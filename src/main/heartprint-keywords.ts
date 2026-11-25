export type HeartprintCategory = "fact" | "preference" | "goal" | "boundary";
export type HeartprintKeywordRange = "7d" | "30d" | "all";

export type HeartprintKeyword = {
  text: string;
  score: number;
  count: number;
  category: HeartprintCategory;
  lastSeen: string;
  sources: Array<{ at: string; agentId: string; excerpt: string }>;
};

type KeywordProfile = {
  updatedAt: string;
  note: string;
  items: Array<{ category: HeartprintCategory; text: string; sourceAgent: string; updatedAt: string }>;
  reflections: Array<{ at: string; agentId: string; user: string }>;
};

type KeywordDocument = {
  text: string;
  at: string;
  agentId: string;
  category: HeartprintCategory;
  weight: number;
  alwaysInclude?: boolean;
};

const stopwords = new Set([
  "一个", "一些", "一种", "一样", "一下", "一篇", "以及", "已经", "以后", "以为", "但是", "不是", "而是",
  "不能", "不会", "不要", "不只是", "不太", "为什么", "于是", "之前", "之后", "也会", "他们", "你们",
  "你的", "你是", "使用", "其实", "其中", "其他", "写成", "再帮", "准备", "刚刚", "包括", "可以", "可能",
  "同时", "后来", "因为", "在内", "地方", "如何", "如果", "它们", "完成", "尝试", "就是", "已经", "希望",
  "应该", "开始", "当前", "很多", "怎么", "总是", "感觉", "我们", "我的", "所有", "所以", "时候", "是不是",
  "是否", "最后", "最好", "最近", "有些", "有人", "有时候", "本来", "比较", "然后", "现在", "甚至", "真正", "那么",
  "简单", "结合", "继续", "能够", "自己", "这个", "这些", "这种", "那个", "那些", "需要", "非常", "问题",
  "进行", "里面", "重新", "还是", "帮助", "发现", "觉得", "认为", "正如", "比如", "什么", "东西", "情况",
  "差不多", "大概", "左右", "相关", "的话", "来说", "这里", "一下子", "出来", "起来", "一般", "相对", "实际",
  "今天", "昨天", "时间", "文章", "容易", "重要", "对应", "保持", "他的", "她的", "它的", "中的", "以内",
  "一句", "完全", "你会", "突然", "不同", "有点", "一点", "一次", "再次", "一轮", "两个", "三个", "没有", "进入",
  "hermes", "agent", "console", "codex", "openai", "gpt", "minimax", "sol", "terra", "luna", "模型", "对话",
  "输入", "输出", "回复", "消息", "任务", "系统", "页面", "按钮", "软件"
]);

const secretPattern = /(?:api[_ -]?key|password|密码|token)\s*[:=]/i;
const modelPattern = /^(?:gpt|claude|gemini|minimax|qwen|deepseek|glm|m\d)[\w.-]*$/i;
const numericPattern = /^\d+(?:[.,]\d+)*$/;

function categoryFor(text: string): HeartprintCategory {
  if (/(不要|禁止|不能|不允许|隐私|边界)/i.test(text)) return "boundary";
  if (/(想要|希望|计划|目标|以后要|准备)/i.test(text)) return "goal";
  if (/(喜欢|偏好|更喜欢|习惯|风格|倾向)/i.test(text)) return "preference";
  return "fact";
}

function normalizeToken(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("zh-Hans");
}

function tokensFrom(text: string) {
  if (!text || secretPattern.test(text)) return [];
  const segmenter = new Intl.Segmenter("zh-Hans", { granularity: "word" });
  const result: string[] = [];
  for (const part of segmenter.segment(text.replace(/https?:\/\/\S+/gi, " "))) {
    if (!part.isWordLike) continue;
    const token = normalizeToken(part.segment).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (token.length < 2 || token.length > 18 || stopwords.has(token) || numericPattern.test(token) || modelPattern.test(token)) continue;
    result.push(token);
  }
  return result;
}

function decayWeight(at: string, now: number) {
  const timestamp = Date.parse(at);
  if (!Number.isFinite(timestamp)) return 0.35;
  const days = Math.max(0, (now - timestamp) / 86_400_000);
  return Math.max(0.18, Math.pow(0.5, days / 7));
}

function excerpt(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

export function buildHeartprintKeywords(profile: KeywordProfile, range: HeartprintKeywordRange = "30d", now = Date.now()): HeartprintKeyword[] {
  const windowDays = range === "7d" ? 7 : range === "30d" ? 30 : Number.POSITIVE_INFINITY;
  const withinWindow = (at: string) => {
    if (!Number.isFinite(windowDays)) return true;
    const timestamp = Date.parse(at);
    return Number.isFinite(timestamp) && now - timestamp <= windowDays * 86_400_000;
  };

  const documents: KeywordDocument[] = [];
  if (profile.note.trim()) {
    documents.push({ text: profile.note, at: profile.updatedAt, agentId: "note", category: "preference", weight: 3.2, alwaysInclude: true });
  }
  for (const item of profile.items) {
    if (withinWindow(item.updatedAt)) documents.push({ text: item.text, at: item.updatedAt, agentId: item.sourceAgent, category: item.category, weight: 1.8 });
  }
  for (const entry of profile.reflections.slice(0, 40)) {
    if (withinWindow(entry.at)) documents.push({ text: entry.user, at: entry.at, agentId: entry.agentId, category: categoryFor(entry.user), weight: 1 });
  }

  const aggregate = new Map<string, {
    text: string;
    score: number;
    count: number;
    lastSeen: string;
    categoryScores: Record<HeartprintCategory, number>;
    sources: HeartprintKeyword["sources"];
  }>();

  for (const document of documents) {
    const localCounts = new Map<string, number>();
    for (const token of tokensFrom(document.text)) localCounts.set(token, (localCounts.get(token) ?? 0) + 1);
    const recency = document.alwaysInclude ? 1 : decayWeight(document.at, now);
    for (const [token, rawCount] of localCounts) {
      const contribution = document.weight * recency * Math.min(rawCount, 3);
      const current = aggregate.get(token) ?? {
        text: token,
        score: 0,
        count: 0,
        lastSeen: document.at,
        categoryScores: { fact: 0, preference: 0, goal: 0, boundary: 0 },
        sources: []
      };
      current.score += contribution;
      current.count += rawCount;
      current.categoryScores[document.category] += contribution;
      if (Date.parse(document.at) > Date.parse(current.lastSeen)) current.lastSeen = document.at;
      if (!current.sources.some((source) => source.at === document.at && source.agentId === document.agentId)) {
        current.sources.push({ at: document.at, agentId: document.agentId, excerpt: excerpt(document.text) });
        current.sources.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
        current.sources = current.sources.slice(0, 3);
      }
      aggregate.set(token, current);
    }
  }

  return [...aggregate.values()]
    .filter((entry) => entry.score >= 0.3)
    .sort((a, b) => b.score - a.score || b.count - a.count || a.text.localeCompare(b.text, "zh-Hans"))
    .slice(0, 24)
    .map((entry) => ({
      text: entry.text,
      score: Number(entry.score.toFixed(3)),
      count: entry.count,
      category: (Object.entries(entry.categoryScores) as Array<[HeartprintCategory, number]>).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "fact",
      lastSeen: entry.lastSeen,
      sources: entry.sources
    }));
}
