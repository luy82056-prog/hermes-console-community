export const KNOWLEDGE_KINDS = { knowledge: "知识与方法", project: "项目资料", profile: "个人记录", preference: "协作偏好", material: "参考材料", log: "历史记录" } as const;
export const KNOWLEDGE_STATUSES = { active: "正式内容", inbox: "待整理", archived: "已归档" } as const;
export type KnowledgeKind = keyof typeof KNOWLEDGE_KINDS;
export type KnowledgeStatus = keyof typeof KNOWLEDGE_STATUSES;

const TOPICS: Array<[string, RegExp]> = [
  ["职业发展", /职业|简历|求职|职业资产|作品集|能力证据|周报|周复盘|个人规划/],
  ["内容创作", /写作|文章|公众号|文案|逐字稿|自媒体|账号定位|叙事|标题|选题|科普|写完以后/],
  ["学习方法", /学习方法|爆炸式学习|爆炸式研究|先博后渊|复习|课程|学习计划|学习地图|知识体系|阅读笔记/],
  ["关系与情感", /亲密关系|恋爱|爱情|伴侣|情书|女朋友|男朋友|分手|离别|告别|讨好|朋友圈|人际/],
  ["健康生活", /健康|睡眠|饮食|体检|健身|身体|疼痛|休息|锻炼|戒色|生病|体重|腹肌|练腹|腰酸|肌肉|DOMS|礼物|出差/],
  ["商业与财务", /商业|投资|金融|股票|现金流|估值|创业|经营|客户|定价|收入/],
  ["技术工具", /代码|编程|软件|API|GitHub|Hermes|Notion|skill|模型|权限|安装|配置|AI工具|工具配置/i],
  ["个人成长", /成长|目标|自信|自我|价值|认知|成熟|任性|经验|边界|选择|时间管理|计划|人生|判断|竞争/]
];

export function knowledgeTopic(title: string, text: string): string {
  // Intent/title is stronger evidence than an assistant's multi-topic answer.
  return TOPICS.find(([, pattern]) => pattern.test(title))?.[0]
    ?? TOPICS.find(([, pattern]) => pattern.test(text.slice(0, 1800)))?.[0] ?? "通用";
}

export function isTransientConversation(userText: string): boolean {
  const value = userText.replace(/[#>*`\s，。！？!?]/g, "");
  return /^(你好|您好|hello|hi|在吗|谢谢|好的|好|嗯|继续|重试|已允许|允许|同意|收到|非常好|是的|对的|ok)+$/i.test(value)
    || /你(现在)?是(什么|哪个)模型|你现在有.*skill|有没有.*skill|去GitHub.*(安装|搜索)|权限.*(弹|允许)|安装.*skill|配置.*(公众号|权限)/i.test(value)
    || /^(起|给我|提供).{0,8}[三五345].{0,6}标题/.test(value)
    || /^(继续扩展|开头.*(修改|修复|重写)|这.*没.*按照.*风格)/.test(value);
}

export function knowledgeMetadata(data: Record<string, unknown>, relativePath: string, body: string) {
  const title = String(data.title || relativePath.split("/").pop() || "");
  const question = body.match(/## 我的问题\s*\n([\s\S]*?)(?=\n## |$)/)?.[1]?.replace(/^>\s?/gm, "") || "";
  const generated = data.source === "hermes-conversation";
  const log = /^(Daily|Archive\/对话日志)\//.test(relativePath);
  const transient = generated && !log && isTransientConversation(question || title);
  const topic = typeof data.topic === "string" && data.topic ? data.topic : knowledgeTopic(title, question || body);
  const kind: KnowledgeKind = Object.hasOwn(KNOWLEDGE_KINDS, String(data.kind)) ? data.kind as KnowledgeKind
    : log ? "log" : relativePath.startsWith("Projects/") ? "project"
    : relativePath.startsWith("Profile/") ? "profile" : generated ? "material" : "knowledge";
  const status: KnowledgeStatus = Object.hasOwn(KNOWLEDGE_STATUSES, String(data.status)) ? data.status as KnowledgeStatus
    : relativePath.startsWith("Archive/") || log || transient ? "archived"
    : generated || relativePath.startsWith("Inbox/") ? "inbox" : "active";
  return { kind, status, topic, reason: String(data.classification_reason || (transient ? "临时操作或对话反馈，仅供追溯" : generated ? "自动提取，尚未经人工确认" : "按内容用途整理")) };
}

export function matchesKnowledgeView(note: { status: KnowledgeStatus; kind: KnowledgeKind; topic: string; tags: string[]; folder: string }, filters: { status: string; kind: string; topic: string; tag: string; folder: string }) {
  return (filters.status === "all" || note.status === filters.status)
    && (filters.kind === "all" || note.kind === filters.kind)
    && (filters.topic === "all" || note.topic === filters.topic)
    && (!filters.tag || note.tags.includes(filters.tag))
    && (filters.folder === "全部" || note.folder === filters.folder || note.folder.startsWith(`${filters.folder}/`));
}
