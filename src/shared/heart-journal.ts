export const journalTopics = { emotion: "情感", business: "商业", learning: "学习", life: "生活", preference: "协作偏好", tools: "工具与配置", other: "其他" } as const;
export type JournalTopic = keyof typeof journalTopics;
export const journalRulesVersion = 2;
export type JournalEntry = { id: string; text: string; source: string; topic: JournalTopic; at: string; kind: "baseline" | "added" | "removed"; sourceAt?: string; classificationSource?: "auto" | "manual"; classificationReason?: string; rulesVersion?: number };
export type JournalResult = { entries: JournalEntry[]; syncedAt: string; errors: string[] };
export function journalTextKey(text: string) { return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim(); }

// Kept only to distinguish likely manual corrections in pre-provenance archives.
export function classifyLegacyJournal(text: string): JournalTopic {
  if (/情感|感情|恋爱|伴侣|爱人|女友|男友|婚姻|亲密|沟通关系|焦虑|情绪|难过|孤独|自我接纳/.test(text)) return "emotion";
  if (/商业|创业|业务|客户|营收|收入|营销|销售|投资|融资|职场|职业|工作|项目|生意|产品|经营/.test(text)) return "business";
  if (/学习|读书|阅读|课程|知识|研究|写作|认知|复盘|技能|教育/.test(text)) return "learning";
  if (/生活|睡眠|作息|健身|运动|饮食|健康|习惯|家庭|旅行|戒色/.test(text)) return "life";
  return "other";
}
export function classifyJournalDetail(input: string): { topic: JournalTopic; reason: string } {
  const text = journalTextKey(input);
  const result = (topic: JournalTopic, reason: string) => ({ topic, reason });
  // The subject is a health record even when it contains paths or emotion scores.
  if (/健康档案|体检|腰椎|腰酸|肌肉酸痛|疼痛|\b(?:health record|medical report|back pain)\b/.test(text)) return result("life", "身体健康或日常生活记录");
  if (/已完成.{0,100}(?:学习|课程|阅读)|读书笔记|课程笔记|学习笔记|\bcompleted.{0,60}(?:course|reading)\b/.test(text.slice(0,180))) return result("learning", "已完成的阅读或学习总结，附带工具信息不改变主题");
  if (/自动归档|归档到|不要存到|保存到知识库|存储位置/.test(text)) return result("tools", "知识归档位置或自动整理流程约定");
  // Operational configuration and access agreements are not business activity.
  if (/(?:登录态|权限|账号风险|只读|抓取工具|\buuid\b|库路径|vault path|local source paths|\/users\/|~\/\.local\/|(?:api|cookie|mcp|数据库).{0,20}(?:配置|已配|接口|登录|密钥))/i.test(text)
      && !/(?:写作|随笔|文章|writing|essay).*(?:风格|语气|co-writing|style)/i.test(text)) return result("tools", "工具、路径、接口配置或访问权限约定");
  const writing = /写作|随笔|文章|成稿|科普|逐字稿|公众号标题|比喻|润色|语言|表达|\b(?:writing|essay|article|coeditor|cowriting|co-writing|writings)\b/.test(text);
  const instruction = /偏好|用户要求|用户希望|用户说|默认|不要|避免|保留|不喜欢|先问|提醒|希望.*(?:表达|评估|语言|写|比喻)|我想要的比喻|\b(?:prefers?|preferred|wants?|should|use it|workflow|favored expressions|prioritizes?)\b/.test(text);
  if (writing && instruction) return result("preference", "写作、表达或协作方式的偏好，不是文章主题本身");
  if (/(?:助手|协作|回答|回复|解释|秘书).*(?:简洁|简单|偏好|风格|希望|默认)|(?:希望|偏好).*(?:助手|回答|回复)|\b(?:agent to act|assistant should|response style|communication preference)\b/.test(text)) return result("preference", "对助手角色或回应方式的约定");
  if (/归档|存到|周报页面|工作流|\b(?:workflow|archived under|dashboard)\b/.test(text)) return result("tools", "资料整理或自动化工作流程");
  if (/睡眠|作息|健身|饮食|戒色|\b(?:sleep|exercise|diet)\b/.test(text)) return result("life", "健康习惯或日常生活记录");
  // Explicit learning activity has priority over a financial subject being studied.
  if (/(?:学习|学到|读书|阅读|课程|知识点|认知改变|读完).{0,100}|\b(?:learning|studying|study|lesson|course|reading|learned)\b/.test(text)) return result("learning", "明确的学习、阅读或知识积累");
  const emotion = /情感|感情|恋爱|伴侣|爱人|女友|男友|婚姻|亲密关系|焦虑|情绪|难过|孤独|自我接纳|\b(?:relationship|partner|marriage|lonely|anxiety|emotions?|emotional resonance)\b/.test(text);
  const business = /商业|创业|业务|客户|营收|收入|营销|销售|投资|融资|职业|职场|生意|经营|变现|从事.{0,12}工作|产品管理|\b(?:business|career|revenue|sales|marketing|investing|investment|finance|product management|entrepreneurship)\b/.test(text);
  if (emotion && business) return result("other", "同时涉及情感和商业，暂不强行选择单一主题");
  if (emotion) return result("emotion", "情感、关系或情绪体验");
  if (business) return result("business", "明确的职业、经营或投资活动");
  if (/生活|家庭|旅行|日常习惯|\b(?:travel|family|daily habit)\b/.test(text)) return result("life", "生活方式、家庭或旅行记录");
  return result("other", "主题信息不足，留待确认");
}
export function classifyJournal(text: string): JournalTopic { return classifyJournalDetail(text).topic; }
