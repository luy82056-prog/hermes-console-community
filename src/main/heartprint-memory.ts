import { randomUUID } from "node:crypto";

export type HeartprintMemoryCategory = "fact" | "preference" | "goal" | "boundary";

export type HeartprintMemoryItem = {
  id: string;
  category: HeartprintMemoryCategory;
  text: string;
  sourceAgent: string;
  createdAt: string;
  updatedAt: string;
  confidence: number;
  evidenceCount: number;
  evidenceIds: string[];
};

export type HeartprintReflection = {
  id: string;
  at: string;
  agentId: string;
  user: string;
  assistant: string;
};

export type HeartprintProfile = {
  version: 2;
  updatedAt: string;
  revision: number;
  note: string;
  items: HeartprintMemoryItem[];
  reflections: HeartprintReflection[];
};

type MemoryDraft = {
  key: string;
  category: HeartprintMemoryCategory;
  text: string;
  confidence: number;
};

export type LegacyHeartprint = {
  version?: number;
  updatedAt?: string;
  revision?: number;
  note?: string;
  items?: Array<Partial<HeartprintMemoryItem> & { text?: string }>;
  reflections?: Array<Partial<HeartprintReflection>>;
};

const secretPattern = /(?:api[_ -]?key|password|密码|access[_ -]?token|secret)\s*[:=]/i;
const taskOnlyPattern = /(?:帮我|请你|尝试|给我|输出|写成|查找|搜索|修复|改成|页面|按钮|模型|软件|console|agent)/i;
const productRequestPattern = /(?:页面|按钮|模型|软件|console|agent|api|功能区|界面|终端|代码框)/i;
const durablePattern = /(?:长期|始终|每次|尽量|我的目标|我的愿景|我最近最想|我计划|我打算|我习惯|我偏好|我喜欢|我不希望|我不能接受)/i;
const questionPattern = /[?？]\s*$/;

function cleanText(value: unknown, limit: number) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function sentenceCase(value: string) {
  const cleaned = value
    .replace(/^(?:嗯+|啊+|是的|对的|非常好|不错的?|好的|然后|另外|哦对)[，,、。\s-]*/i, "")
    .replace(/^(?:我觉得|我认为)[，,、。\s]*/i, "")
    .replace(/\s*([。！？!?])\s*$/u, "")
    .trim();
  if (!cleaned) return "";
  return `${cleaned.slice(0, 88)}${cleaned.length > 88 ? "" : "。"}`;
}

function splitThoughts(text: string) {
  return text
    .replace(/#{1,6}\s*/g, "")
    .split(/(?:\r?\n+|(?<=[。！？!?；;]))\s*/u)
    .map((part) => cleanText(part, 320))
    .filter(Boolean);
}

function genericDraft(thought: string): MemoryDraft | null {
  const durable = durablePattern.test(thought);
  if (questionPattern.test(thought)) return null;
  if (productRequestPattern.test(thought)) return null;
  if (/(?:今天|明天|今晚|这周|本周|下次|一会儿)/i.test(thought) && !/(?:长期|始终|每次)/i.test(thought)) return null;
  if (/我想要(?:感叹|讨论|问|了解一下|看看|写|输出)/i.test(thought)) return null;
  if (/(?:按照|列出来|来列|看看我每天|记录我每天)/i.test(thought)) return null;
  if (taskOnlyPattern.test(thought) && !durable) return null;

  const boundarySignal = /(?:我的(?:边界|原则)|我不希望|我不能接受|我不接受|以后请不要|请不要再|你不要再|未经我)/i.test(thought);
  const goalSignal = /(?:我的(?:目标|长期目标|愿景|大愿)|我最近最想|我想要|我希望|我计划|我打算)/i.test(thought);
  const preferenceSignal = /(?:我(?:更|比较)?(?:喜欢|偏好|倾向|习惯|重视|在意)|我不太喜欢|我的(?:偏好|习惯|风格))/i.test(thought);
  const insightSignal = /(?:我(?:逐渐|终于|开始)?(?:意识到|明白了|学会了|发现自己)|我以前.*现在)/i.test(thought);
  const factSignal = /(?:我是|我目前(?:在|从事|负责)|我现在(?:在|从事|负责)|我的(?:工作|业务|职业|专业|身份)是|我每天|我通常|我经常)/i.test(thought);
  let category: HeartprintMemoryCategory;
  if (boundarySignal) category = "boundary";
  else if (goalSignal) category = "goal";
  else if (preferenceSignal) category = "preference";
  else if (factSignal || insightSignal) category = "fact";
  else return null;

  let text = thought
    .replace(/^(?:所以|那么|然后|另外|顺便)[，,、。\s]*/i, "")
    .replace(/\s*(?:请你|帮我|你尝试|现在尝试)[\s\S]*$/i, "")
    .trim();
  if (text.length > 180) return null;
  text = sentenceCase(text);
  if (text.length < 6) return null;

  const normalized = text.toLocaleLowerCase("zh-Hans").replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 72);
  return {
    key: `${category}:${normalized}`,
    category,
    text,
    confidence: durable ? 0.76 : 0.64
  };
}

export function extractHeartprintMemories(userText: string): MemoryDraft[] {
  const clean = cleanText(userText, 6000);
  if (!clean || secretPattern.test(clean)) return [];

  const drafts: MemoryDraft[] = [];
  const add = (draft: MemoryDraft) => {
    if (!drafts.some((entry) => entry.key === draft.key)) drafts.push(draft);
  };

  const hasWritingCollaborationRule = (
    /(?:写作|写文章|改稿)/i.test(clean)
    && /(?:不要瞎编|不要编造|按照我输出|保留我.*(?:原话|语句)|删改太多|不要大幅删改|不是我的写作主导|美化和辅助|辅助.*(?:梳理|润色))/i.test(clean)
  );
  if (hasWritingCollaborationRule) {
    add({
      key: "boundary:writing-collaboration",
      category: "boundary",
      text: "写作协作时不要编造或大幅改写，尽量保留我的原话，只辅助梳理逻辑与润色。",
      confidence: 0.9
    });
  }

  if (/(?:每次|以后).*(?:写完|完成).*(?:文章|写作).*(?:利他|帮助别人|对别人)/i.test(clean)) {
    add({
      key: "preference:writing-altruism-review",
      category: "preference",
      text: "每次完成文章后，希望评估内容的利他性，并获得进一步优化表达的建议。",
      confidence: 0.86
    });
  }

  if (/(?:写作|文章).*(?:不能写|不适合写).*(?:告诉我|提醒我)/i.test(clean)) {
    add({
      key: "boundary:writing-risk-warning",
      category: "boundary",
      text: "写作内容存在明确风险或不适合公开时，需要直接提醒我。",
      confidence: 0.84
    });
  }

  const hasEducationWorkMemory = /我的工作是教育类|我目前.*从事教育|未来.*从事教育/i.test(clean);
  if (hasEducationWorkMemory) {
    add({
      key: "fact:education-career",
      category: "fact",
      text: "目前主要从事教育相关工作，未来希望继续深耕教育领域。",
      confidence: 0.82
    });
  }

  const hasHappinessVision = /(?:我的大愿|我的愿景|长期.*愿景).*(?:幸福|认知)/i.test(clean);
  if (hasHappinessVision) {
    add({
      key: "goal:cognitive-change-happiness",
      category: "goal",
      text: "长期愿景是通过带来认知改变，帮助更多人变得幸福。",
      confidence: 0.86
    });
  }

  if (/(?:戒色|禁欲)/i.test(clean) && /健身/i.test(clean) && /(?:规律|作息|睡眠)/i.test(clean)) {
    add({
      key: "goal:discipline-health",
      category: "goal",
      text: "近期长期目标是坚持戒色、健身并保持规律睡眠。",
      confidence: 0.88
    });
  }

  if (/学习/i.test(clean) && /石油/i.test(clean) && /降息/i.test(clean) && /(?:利率|通胀)/i.test(clean)) {
    add({
      key: "goal:macro-oil-rates-inflation",
      category: "goal",
      text: "希望系统学习石油、降息、利率与通胀之间的关系。",
      confidence: 0.84
    });
  }

  const looksLikeDraft = clean.length > 600 || /^(?:开始)?今天的?(?:文章|日记|写作)/i.test(clean);
  if (looksLikeDraft) return drafts;

  for (const thought of splitThoughts(clean)) {
    if (hasWritingCollaborationRule && /(?:写作|写文章|改稿|瞎编|编造|原话|删改|润色|梳理)/i.test(thought)) continue;
    if (hasEducationWorkMemory && /(?:工作|从事).*(?:教育)/i.test(thought)) continue;
    if (hasHappinessVision && /(?:大愿|愿景|幸福|认知改变)/i.test(thought)) continue;
    const draft = genericDraft(thought);
    if (draft) add(draft);
    if (drafts.length >= 4) break;
  }

  return drafts;
}

function characterBigrams(value: string) {
  const normalized = value.toLocaleLowerCase("zh-Hans").replace(/[^\p{L}\p{N}]+/gu, "");
  const grams = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) grams.add(normalized.slice(index, index + 2));
  return grams;
}

function memorySimilarity(left: string, right: string) {
  const a = characterBigrams(left);
  const b = characterBigrams(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const gram of a) if (b.has(gram)) overlap += 1;
  return overlap / Math.min(a.size, b.size);
}

function mergeDraft(
  items: HeartprintMemoryItem[],
  draft: MemoryDraft,
  input: { agentId: string; at: string; evidenceId: string }
) {
  const keyText = draft.key.split(":").slice(1).join(":");
  const existing = items.find((item) => {
    if (item.category !== draft.category) return false;
    const itemKey = item.text.toLocaleLowerCase("zh-Hans").replace(/[^\p{L}\p{N}]+/gu, "");
    return itemKey.includes(keyText) || memorySimilarity(item.text, draft.text) >= 0.68;
  });

  if (existing) {
    existing.text = draft.text.length <= existing.text.length + 20 ? draft.text : existing.text;
    existing.updatedAt = input.at;
    existing.sourceAgent = input.agentId;
    existing.evidenceCount = Math.min(99, existing.evidenceCount + 1);
    existing.confidence = Number(Math.min(0.98, Math.max(existing.confidence, draft.confidence) + 0.04).toFixed(2));
    existing.evidenceIds = [input.evidenceId, ...existing.evidenceIds.filter((id) => id !== input.evidenceId)].slice(0, 8);
    return;
  }

  items.push({
    id: randomUUID(),
    category: draft.category,
    text: draft.text,
    sourceAgent: input.agentId,
    createdAt: input.at,
    updatedAt: input.at,
    confidence: draft.confidence,
    evidenceCount: 1,
    evidenceIds: [input.evidenceId]
  });
}

function sortMemories(items: HeartprintMemoryItem[]) {
  return items
    .filter((item) => item.text.length >= 6 && item.text.length <= 120)
    .sort((a, b) =>
      b.confidence - a.confidence
      || b.evidenceCount - a.evidenceCount
      || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    )
    .slice(0, 48);
}

export function emptyHeartprintProfile(now = new Date().toISOString()): HeartprintProfile {
  return { version: 2, updatedAt: now, revision: 0, note: "", items: [], reflections: [] };
}

export function normalizeHeartprintProfile(raw: LegacyHeartprint | null | undefined, now = new Date().toISOString()) {
  if (raw?.version === 2) {
    const profile: HeartprintProfile = {
      version: 2,
      updatedAt: cleanText(raw.updatedAt, 64) || now,
      revision: Number.isFinite(raw.revision) ? Number(raw.revision) : 0,
      note: cleanText(raw.note, 4000),
      items: [],
      reflections: Array.isArray(raw.reflections)
        ? raw.reflections.map((entry) => ({
            id: cleanText(entry.id, 80) || randomUUID(),
            at: cleanText(entry.at, 64) || now,
            agentId: cleanText(entry.agentId, 80) || "parent",
            user: cleanText(entry.user, 1600),
            assistant: cleanText(entry.assistant, 800)
          })).slice(0, 80)
        : []
    };
    for (const item of Array.isArray(raw.items) ? raw.items : []) {
      const text = cleanText(item.text, 120);
      if (!text) continue;
      profile.items.push({
        id: cleanText(item.id, 80) || randomUUID(),
        category: item.category === "preference" || item.category === "goal" || item.category === "boundary" ? item.category : "fact",
        text,
        sourceAgent: cleanText(item.sourceAgent, 80) || "parent",
        createdAt: cleanText(item.createdAt, 64) || now,
        updatedAt: cleanText(item.updatedAt, 64) || now,
        confidence: Math.max(0.4, Math.min(0.99, Number(item.confidence) || 0.64)),
        evidenceCount: Math.max(1, Math.min(99, Number(item.evidenceCount) || 1)),
        evidenceIds: Array.isArray(item.evidenceIds) ? item.evidenceIds.map((id) => cleanText(id, 80)).filter(Boolean).slice(0, 8) : []
      });
    }
    profile.items = sortMemories(profile.items);
    return { profile, migrated: false };
  }

  const profile = emptyHeartprintProfile(cleanText(raw?.updatedAt, 64) || now);
  profile.revision = Number.isFinite(raw?.revision) ? Number(raw?.revision) : 0;
  profile.note = cleanText(raw?.note, 4000);
  profile.reflections = Array.isArray(raw?.reflections)
    ? raw.reflections.map((entry) => ({
        id: cleanText(entry.id, 80) || randomUUID(),
        at: cleanText(entry.at, 64) || now,
        agentId: cleanText(entry.agentId, 80) || "parent",
        user: cleanText(entry.user, 1600),
        assistant: cleanText(entry.assistant, 800)
      })).slice(0, 80)
    : [];

  for (const legacy of Array.isArray(raw?.items) ? raw.items : []) {
    const at = cleanText(legacy.updatedAt, 64) || now;
    const evidenceId = cleanText(legacy.id, 80) || randomUUID();
    for (const draft of extractHeartprintMemories(cleanText(legacy.text, 6000))) {
      mergeDraft(profile.items, draft, {
        agentId: cleanText(legacy.sourceAgent, 80) || "parent",
        at,
        evidenceId
      });
    }
  }
  profile.items = sortMemories(profile.items);
  profile.revision += 1;
  return { profile, migrated: true };
}

export function ingestHeartprintTurn(
  profile: HeartprintProfile,
  input: { agentId: string; userText: string; assistantText: string; at?: string }
) {
  const at = input.at ?? new Date().toISOString();
  const reflection: HeartprintReflection = {
    id: randomUUID(),
    at,
    agentId: cleanText(input.agentId, 80) || "parent",
    user: cleanText(input.userText, 1600),
    assistant: cleanText(input.assistantText, 800)
  };
  if (!reflection.user) return profile;

  const next: HeartprintProfile = {
    ...profile,
    version: 2,
    items: profile.items.map((item) => ({ ...item, evidenceIds: [...item.evidenceIds] })),
    reflections: [reflection, ...profile.reflections].slice(0, 80),
    updatedAt: at,
    revision: profile.revision + 1
  };

  if (!secretPattern.test(reflection.user)) {
    for (const draft of extractHeartprintMemories(reflection.user)) {
      mergeDraft(next.items, draft, { agentId: reflection.agentId, at, evidenceId: reflection.id });
    }
  }
  next.items = sortMemories(next.items);
  return next;
}

export function compactHeartprintProfile(profile: HeartprintProfile) {
  const next = emptyHeartprintProfile(profile.updatedAt);
  next.note = profile.note;
  next.reflections = profile.reflections.slice(0, 80);
  next.revision = profile.revision + 1;
  for (const item of profile.items) {
    const drafts = extractHeartprintMemories(item.text);
    for (const draft of drafts) {
      mergeDraft(next.items, draft, {
        agentId: item.sourceAgent,
        at: item.updatedAt,
        evidenceId: item.evidenceIds[0] ?? item.id
      });
    }
  }
  next.items = sortMemories(next.items);
  return next;
}

export function heartprintMemoryContext(profile: HeartprintProfile) {
  const labels: Record<HeartprintMemoryCategory, string> = {
    fact: "事实",
    preference: "偏好",
    goal: "目标",
    boundary: "边界"
  };
  const memories = profile.items
    .filter((item) => item.confidence >= 0.62)
    .sort((a, b) =>
      (b.category === "boundary" ? 1 : 0) - (a.category === "boundary" ? 1 : 0)
      || b.confidence - a.confidence
      || b.evidenceCount - a.evidenceCount
      || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    )
    .slice(0, 12)
    .map((item) => `- ${labels[item.category]}：${item.text}`);
  if (profile.note.trim()) memories.unshift(`- 用户自述：${profile.note.trim().slice(0, 800)}`);
  return memories.join("\n").slice(0, 2400);
}
