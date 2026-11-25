import { randomUUID } from "node:crypto";

export type GrowthCapabilityCategory = "thinking" | "expression" | "execution" | "wellbeing" | "custom";
export type GrowthEvidenceSource = "conversation" | "writing" | "manual";

export type GrowthSkillNode = {
  id: string;
  title: string;
  progress: number;
};

export type GrowthCapability = {
  id: string;
  title: string;
  description: string;
  category: GrowthCapabilityCategory;
  enabled: boolean;
  progress: number;
  level: number;
  signals: string[];
  nodes: GrowthSkillNode[];
  createdAt: string;
  updatedAt: string;
};

export type GrowthEvidence = {
  id: string;
  at: string;
  agentId: string;
  capabilityId: string;
  source: GrowthEvidenceSource;
  excerpt: string;
  score: number;
  reason: string;
};

export type GrowthObservation = {
  id: string;
  at: string;
  agentId: string;
  source: GrowthEvidenceSource;
  excerpt: string;
  capabilityIds: string[];
};

export type GrowthProfile = {
  version: 1;
  revision: number;
  updatedAt: string;
  capabilities: GrowthCapability[];
  evidence: GrowthEvidence[];
  observations: GrowthObservation[];
};

type CapabilityTemplate = Omit<GrowthCapability, "enabled" | "progress" | "level" | "createdAt" | "updatedAt">;

const templates: CapabilityTemplate[] = [
  {
    id: "expression",
    title: "表达力",
    description: "把感受、观点和复杂信息讲清楚，并形成有结构的作品。",
    category: "expression",
    signals: ["表达", "写作", "文章", "标题", "结构", "论证", "叙事", "沟通", "演讲", "观点", "总结", "输出"],
    nodes: ["清晰", "结构", "论证", "叙事", "受众感"].map((title, index) => ({ id: `expression-${index}`, title, progress: 0 }))
  },
  {
    id: "time-management",
    title: "时间管理",
    description: "把有限时间放到重要事项上，并形成可持续的节奏。",
    category: "execution",
    signals: ["时间", "日程", "计划", "截止", "优先级", "专注", "安排", "提醒", "复盘", "拖延", "节奏"],
    nodes: ["优先级", "估时", "专注", "边界", "复盘"].map((title, index) => ({ id: `time-${index}`, title, progress: 0 }))
  },
  {
    id: "learning",
    title: "学习力",
    description: "建立知识框架，主动回忆、迁移并持续修正理解。",
    category: "thinking",
    signals: ["学习", "知识", "研究", "阅读", "理解", "复习", "记忆", "练习", "课程", "框架", "方法论"],
    nodes: ["拆解", "理解", "回忆", "应用", "迁移"].map((title, index) => ({ id: `learning-${index}`, title, progress: 0 }))
  },
  {
    id: "execution",
    title: "执行力",
    description: "把意图变成下一步行动，完成、验证并继续迭代。",
    category: "execution",
    signals: ["执行", "完成", "行动", "开始", "实现", "开发", "交付", "验证", "迭代", "继续", "推进", "发布"],
    nodes: ["启动", "拆步", "完成", "验证", "迭代"].map((title, index) => ({ id: `execution-${index}`, title, progress: 0 }))
  },
  {
    id: "self-awareness",
    title: "自我觉察",
    description: "识别感受、需要、触发因素与边界，做更清醒的选择。",
    category: "wellbeing",
    signals: ["感受", "情绪", "觉察", "反思", "关系", "边界", "内心", "焦虑", "压力", "害怕", "需要", "选择"],
    nodes: ["识别", "命名", "触发", "边界", "选择"].map((title, index) => ({ id: `awareness-${index}`, title, progress: 0 }))
  },
  {
    id: "wellbeing",
    title: "健康自律",
    description: "用可恢复的小行动照顾睡眠、运动和数字生活边界。",
    category: "wellbeing",
    signals: ["健身", "运动", "睡眠", "早睡", "规律", "习惯", "自律", "健康", "训练", "休息", "戒色"],
    nodes: ["睡眠", "运动", "饮食", "恢复", "数字边界"].map((title, index) => ({ id: `wellbeing-${index}`, title, progress: 0 }))
  }
];

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function excerpt(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 220);
}

function buildCapability(template: CapabilityTemplate, now: string, enabled: boolean): GrowthCapability {
  return { ...template, enabled, progress: 0, level: 1, nodes: template.nodes.map((node) => ({ ...node })), createdAt: now, updatedAt: now };
}

export function createDefaultGrowthProfile(now = new Date().toISOString()): GrowthProfile {
  return {
    version: 1,
    revision: 0,
    updatedAt: now,
    capabilities: templates.map((template, index) => buildCapability(template, now, index < 4)),
    evidence: [],
    observations: []
  };
}

export function normalizeGrowthProfile(value: Partial<GrowthProfile> | null | undefined, now = new Date().toISOString()): GrowthProfile {
  const fallback = createDefaultGrowthProfile(now);
  if (!value || !Array.isArray(value.capabilities)) return fallback;
  const capabilities = value.capabilities
    .filter((capability): capability is GrowthCapability => Boolean(capability && typeof capability.id === "string" && typeof capability.title === "string"))
    .map((capability) => ({
      ...capability,
      enabled: capability.enabled !== false,
      progress: clamp(Number(capability.progress) || 0),
      level: Math.max(1, Math.floor(Number(capability.level) || 1)),
      signals: Array.isArray(capability.signals) ? capability.signals.filter((signal) => typeof signal === "string").slice(0, 24) : [],
      nodes: Array.isArray(capability.nodes) ? capability.nodes.slice(0, 8).map((node) => ({ ...node, progress: clamp(Number(node.progress) || 0) })) : [],
      createdAt: capability.createdAt || now,
      updatedAt: capability.updatedAt || now
    }));
  return {
    version: 1,
    revision: Math.max(0, Math.floor(Number(value.revision) || 0)),
    updatedAt: value.updatedAt || now,
    capabilities: capabilities.length ? capabilities : fallback.capabilities,
    evidence: Array.isArray(value.evidence) ? value.evidence.slice(0, 320) : [],
    observations: Array.isArray(value.observations) ? value.observations.slice(0, 500) : []
  };
}

function signalScore(text: string, capability: GrowthCapability) {
  const lower = text.toLowerCase();
  const matched = capability.signals.filter((signal) => lower.includes(signal.toLowerCase()));
  const inferred: string[] = [];
  if (capability.id === "expression" && text.length >= 70) inferred.push("形成了一段完整表达");
  if (capability.id === "time-management" && /(今天|明天|每天|本周|下周|最近|定时|几点|日期|截止|优先|先做|再做|节奏)/.test(text)) inferred.push("包含时间与节奏安排");
  if (capability.id === "learning" && /(为什么|怎么|如何|是什么|请.*(?:解释|梳理|查找|搜索|分析)|我想学|想学习|知识点|最佳案例|参考资料|研究)/.test(text)) inferred.push("主动提出学习或求解问题");
  if (capability.id === "execution" && /(请你|帮我|尝试|需要你|开始|继续|修复|修改|加入|创建|实现|完成|验证|打包|更新)/.test(text)) inferred.push("提出了明确行动或迭代要求");
  if (capability.id === "self-awareness" && /(我觉得|我发现|我意识到|我的感受|让我觉得|我担心|我害怕|我希望|我更喜欢)/.test(text)) inferred.push("表达了自我观察与感受");
  if (!matched.length && !inferred.length) return null;
  let score = Math.min(3, matched.length + inferred.length);
  const reasons = [...(matched.length ? [`提到 ${matched.slice(0, 3).join("、")}`] : []), ...inferred];
  if (text.length >= 160) {
    score += 1;
    reasons.push("形成了较完整的输入");
  }
  if (/\n|(?:^|\s)[一二三四五六七八九十1-9][.、：:]|因为|所以|但是|首先|其次|最后/.test(text)) {
    score += 1;
    reasons.push("包含结构或推理");
  }
  return { score: Math.min(5, score), reason: reasons.join("；") };
}

function updateNodes(capability: GrowthCapability, delta: number) {
  if (!capability.nodes.length) return;
  const targetIndex = Math.min(capability.nodes.length - 1, Math.floor(capability.progress / Math.max(1, 100 / capability.nodes.length)));
  capability.nodes = capability.nodes.map((node, index) => index === targetIndex ? { ...node, progress: clamp(node.progress + delta * 2.4) } : node);
}

export function ingestGrowthEvidence(
  sourceProfile: GrowthProfile,
  input: { text: string; agentId?: string; source?: GrowthEvidenceSource; at?: string }
) {
  const profile = normalizeGrowthProfile(sourceProfile, input.at || new Date().toISOString());
  const clean = excerpt(input.text);
  if (!clean || /(?:api[_ -]?key|password|密码)\s*[:=]/i.test(clean)) return { profile, added: [] as GrowthEvidence[], observed: false };
  const at = input.at || new Date().toISOString();
  const added: GrowthEvidence[] = [];
  for (const capability of profile.capabilities.filter((item) => item.enabled)) {
    const match = signalScore(input.text, capability);
    if (!match) continue;
    const duplicate = profile.evidence.some((item) => item.capabilityId === capability.id && item.excerpt === clean && item.source === (input.source || "conversation") && Math.abs(new Date(at).getTime() - new Date(item.at).getTime()) < 86_400_000);
    if (duplicate) continue;
    const evidence: GrowthEvidence = {
      id: randomUUID(),
      at,
      agentId: input.agentId || "self",
      capabilityId: capability.id,
      source: input.source || "conversation",
      excerpt: clean,
      score: match.score,
      reason: match.reason
    };
    const delta = Math.min(2.5, 0.45 + match.score * 0.34);
    capability.progress = clamp(capability.progress + delta);
    capability.level = Math.max(1, Math.floor(capability.progress / 20) + 1);
    capability.updatedAt = at;
    updateNodes(capability, delta);
    added.push(evidence);
  }
  profile.observations = [{
    id: randomUUID(),
    at,
    agentId: input.agentId || "self",
    source: input.source || "conversation",
    excerpt: clean,
    capabilityIds: added.map((item) => item.capabilityId)
  }, ...profile.observations].slice(0, 500);
  if (added.length) profile.evidence = [...added, ...profile.evidence].slice(0, 320);
  profile.updatedAt = at;
  profile.revision += 1;
  return { profile, added, observed: true };
}

function customTitle(prompt: string) {
  const quoted = prompt.match(/[“\"「](.{2,12})[”\"」]/)?.[1];
  if (quoted) return quoted.trim();
  const match = prompt.match(/(?:提升|学习|培养|训练|改善|建立|加强)(.{2,10}?)(?:能力|习惯|水平|，|。|$)/)?.[1];
  return (match || prompt).replace(/[，。！？,.!?\s]/g, "").slice(0, 8) || "新能力";
}

export function createCapabilityFromPrompt(sourceProfile: GrowthProfile, rawPrompt: string, at = new Date().toISOString()) {
  const profile = normalizeGrowthProfile(sourceProfile, at);
  const prompt = excerpt(rawPrompt);
  if (!prompt) return { profile, capability: null, reason: "请先描述你想培养的能力。" };
  const bestTemplate = templates
    .map((template) => ({ template, score: template.signals.filter((signal) => prompt.toLowerCase().includes(signal.toLowerCase())).length }))
    .sort((a, b) => b.score - a.score)[0];
  if (bestTemplate?.score) {
    const existing = profile.capabilities.find((item) => item.id === bestTemplate.template.id);
    if (existing) {
      existing.enabled = true;
      existing.updatedAt = at;
      profile.updatedAt = at;
      profile.revision += 1;
      return { profile, capability: existing, reason: `已启用「${existing.title}」，并保留原有进度。` };
    }
  }
  const title = customTitle(prompt);
  const id = `custom-${title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}-${Date.now().toString(36)}`;
  const phrases = prompt.split(/[，。；、,;\s]+/).filter((part) => part.length >= 2 && part.length <= 12).slice(0, 10);
  const capability: GrowthCapability = {
    id,
    title,
    description: prompt.slice(0, 120),
    category: "custom",
    enabled: true,
    progress: 0,
    level: 1,
    signals: Array.from(new Set([title, ...phrases])).slice(0, 12),
    nodes: ["理解", "练习", "反馈", "应用", "复盘"].map((nodeTitle, index) => ({ id: `${id}-${index}`, title: nodeTitle, progress: 0 })),
    createdAt: at,
    updatedAt: at
  };
  profile.capabilities.push(capability);
  profile.updatedAt = at;
  profile.revision += 1;
  return { profile, capability, reason: `已建立「${title}」的初始成长路径。` };
}

export function createCapabilityFromDefinition(
  sourceProfile: GrowthProfile,
  definition: { title?: unknown; description?: unknown; signals?: unknown; nodes?: unknown },
  fallbackPrompt: string,
  at = new Date().toISOString()
) {
  const profile = normalizeGrowthProfile(sourceProfile, at);
  const title = String(definition.title || customTitle(fallbackPrompt)).replace(/[\r\n<>]/g, "").trim().slice(0, 16);
  if (!title) return createCapabilityFromPrompt(profile, fallbackPrompt, at);
  const existing = profile.capabilities.find((item) => item.title.toLowerCase() === title.toLowerCase());
  if (existing) {
    existing.enabled = true;
    existing.updatedAt = at;
    profile.updatedAt = at;
    profile.revision += 1;
    return { profile, capability: existing, reason: `Hermes 已重新启用「${existing.title}」，并保留原有进度。` };
  }
  const id = `custom-${title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}-${Date.now().toString(36)}`;
  const signals = Array.isArray(definition.signals)
    ? definition.signals.map(String).map((item) => item.trim()).filter((item) => item.length >= 2 && item.length <= 12).slice(0, 12)
    : [];
  const nodeTitles = Array.isArray(definition.nodes)
    ? definition.nodes.map(String).map((item) => item.trim()).filter((item) => item.length >= 1 && item.length <= 12).slice(0, 6)
    : [];
  const capability: GrowthCapability = {
    id,
    title,
    description: String(definition.description || fallbackPrompt).replace(/[\r\n]+/g, " ").trim().slice(0, 160),
    category: "custom",
    enabled: true,
    progress: 0,
    level: 1,
    signals: Array.from(new Set([title, ...signals])).slice(0, 12),
    nodes: (nodeTitles.length >= 3 ? nodeTitles : ["理解", "练习", "反馈", "应用", "复盘"]).map((nodeTitle, index) => ({ id: `${id}-${index}`, title: nodeTitle, progress: 0 })),
    createdAt: at,
    updatedAt: at
  };
  profile.capabilities.push(capability);
  profile.updatedAt = at;
  profile.revision += 1;
  return { profile, capability, reason: `Hermes 已把「${title}」整理为一条新的成长路径。` };
}

export function toggleGrowthCapability(sourceProfile: GrowthProfile, capabilityId: string, enabled: boolean, at = new Date().toISOString()) {
  const profile = normalizeGrowthProfile(sourceProfile, at);
  const capability = profile.capabilities.find((item) => item.id === capabilityId);
  if (!capability) return { profile, capability: null };
  capability.enabled = enabled;
  capability.updatedAt = at;
  profile.updatedAt = at;
  profile.revision += 1;
  return { profile, capability };
}

export function growthContext(profile: GrowthProfile) {
  return profile.capabilities
    .filter((item) => item.enabled)
    .slice(0, 8)
    .map((item) => `- ${item.title}：成长指数 ${Math.round(item.progress)}%，当前关注 ${[...item.nodes].sort((a, b) => a.progress - b.progress)[0]?.title || "持续练习"}`)
    .join("\n");
}
