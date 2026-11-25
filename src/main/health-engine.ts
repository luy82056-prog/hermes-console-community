import { randomUUID } from "node:crypto";

export type HealthEvidenceSource = {
  id: string;
  title: string;
  organization: string;
  url: string;
  category: "sleep" | "activity" | "nutrition" | "strength" | "anatomy" | "medicine" | "tcm";
  summary: string;
  checkedAt: string;
  reachable: boolean | null;
};

export type HealthRecord = {
  id: string;
  at: string;
  date: string;
  weightKg: number | null;
  sleepHours: number | null;
  sleepQuality: number | null;
  energy: number | null;
  restingHeartRate: number | null;
  steps: number | null;
  trainingMinutes: number | null;
  strengthTraining: boolean;
  symptoms: string;
  note: string;
};

export type HealthInterviewMessage = {
  id: string;
  at: string;
  role: "user" | "assistant" | "system";
  text: string;
};

export type HealthPersonalProfile = {
  birthYear: number | null;
  sex: "male" | "female" | "other" | "unspecified";
  heightCm: number | null;
  conditions: string;
  medications: string;
  injuries: string;
  dietaryRestrictions: string;
  trainingExperience: "new" | "regular" | "experienced";
  checkInTime: string;
  shareSummaryWithAgents: boolean;
};

export type HealthProfile = {
  version: 1;
  revision: number;
  updatedAt: string;
  personal: HealthPersonalProfile;
  records: HealthRecord[];
  interviews: HealthInterviewMessage[];
  evidence: HealthEvidenceSource[];
};

export type HealthRecordInput = Omit<HealthRecord, "id" | "at">;

const officialSources: Array<Omit<HealthEvidenceSource, "checkedAt" | "reachable">> = [
  {
    id: "who-activity-2020",
    title: "身体活动与久坐行为指南",
    organization: "世界卫生组织 WHO",
    url: "https://www.who.int/publications/i/item/9789240015128",
    category: "activity",
    summary: "成年人每周进行 150–300 分钟中等强度有氧活动，或 75–150 分钟高强度活动，并至少两天训练主要肌群。"
  },
  {
    id: "cns-dietary-2022",
    title: "中国居民膳食指南（2022）",
    organization: "中国营养学会",
    url: "https://dg.cnsoc.org/imgnewslist_0602_1.htm",
    category: "nutrition",
    summary: "以食物多样、合理搭配、规律进餐和足量饮水为基础，不用单一食物或补剂替代均衡饮食。"
  },
  {
    id: "cdc-sleep-adults",
    title: "成年人睡眠事实与建议",
    organization: "美国疾病控制与预防中心 CDC",
    url: "https://www.cdc.gov/sleep/about/index.html",
    category: "sleep",
    summary: "成年人通常应保证每晚至少 7 小时睡眠，并保持相对固定的睡眠与起床时间。"
  },
  {
    id: "acsm-resistance-2026",
    title: "健康成年人抗阻训练处方立场声明",
    organization: "美国运动医学会 ACSM",
    url: "https://acsm.org/resistance-training-guidelines-update-2026/",
    category: "strength",
    summary: "一致性比复杂技巧更重要；每周至少两次覆盖主要肌群。以增肌为目标时，可逐步接近每个肌群每周约 10 组。"
  },
  {
    id: "acsm-protein",
    title: "肌肉维持与蛋白质摄入",
    organization: "美国运动医学会 ACSM",
    url: "https://www.acsm.org/docs/default-source/files-for-resource-library/protein-intake-for-optimal-muscle-maintenance.pdf",
    category: "nutrition",
    summary: "规律运动者的蛋白质需求通常高于普通成年人；常见参考范围为每日每公斤体重 1.2–1.7 克，但肾脏疾病等情况应先咨询医生。"
  },
  {
    id: "ncbi-musculoskeletal",
    title: "肌肉骨骼系统解剖与生理基础",
    organization: "美国国家医学图书馆 NCBI Bookshelf",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK595001/",
    category: "anatomy",
    summary: "肌肉与骨骼共同完成支撑和运动。解剖资料用于理解结构与功能，不能仅凭姿态照片推断病变或制定康复处方。"
  },
  {
    id: "nih-supplements",
    title: "膳食补充剂循证资料库",
    organization: "美国国立卫生研究院 NIH ODS",
    url: "https://ods.od.nih.gov/HealthInformation/healthinformation.aspx",
    category: "medicine",
    summary: "按成分查询作用、推荐摄入量、安全性及药物相互作用；补充剂不能替代均衡饮食，也不应在未知相互作用时自行叠加。"
  },
  {
    id: "nccih-tcm",
    title: "中医药疗法的证据与安全边界",
    organization: "美国国家补充与整合健康中心 NCCIH",
    url: "https://www.nccih.nih.gov/health/traditional-chinese-medicine-what-you-need-to-know",
    category: "tcm",
    summary: "针灸、太极和中草药需要分别评价证据；中草药可能存在掺杂、污染、器官损伤及药物相互作用风险。"
  }
];

const urgentPattern = /(胸痛|胸闷.*(?:呼吸|气短)|呼吸困难|喘不上气|昏厥|晕倒|意识不清|一侧无力|口角歪|言语不清|严重过敏|喉头水肿|大量出血|自杀|自伤)/i;
const healthUpdatePattern = /<health-update>\s*([\s\S]*?)\s*<\/health-update>/i;

function finite(value: unknown, minimum: number, maximum: number) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function text(value: unknown, limit: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function messageText(value: unknown, limit: number) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

export function createDefaultHealthProfile(now = new Date().toISOString()): HealthProfile {
  return {
    version: 1,
    revision: 0,
    updatedAt: now,
    personal: {
      birthYear: null,
      sex: "unspecified",
      heightCm: null,
      conditions: "",
      medications: "",
      injuries: "",
      dietaryRestrictions: "",
      trainingExperience: "new",
      checkInTime: "21:30",
      shareSummaryWithAgents: false
    },
    records: [],
    interviews: [],
    evidence: officialSources.map((source) => ({ ...source, checkedAt: "", reachable: null }))
  };
}

export function normalizeHealthProfile(value: Partial<HealthProfile> | null | undefined, now = new Date().toISOString()): HealthProfile {
  const fallback = createDefaultHealthProfile(now);
  if (!value || typeof value !== "object") return fallback;
  const personal = value.personal || fallback.personal;
  const evidenceById = new Map((value.evidence || []).map((source) => [source.id, source]));
  return {
    version: 1,
    revision: Math.max(0, Math.floor(Number(value.revision) || 0)),
    updatedAt: value.updatedAt || now,
    personal: {
      birthYear: finite(personal.birthYear, 1900, new Date().getFullYear()),
      sex: personal.sex === "male" || personal.sex === "female" || personal.sex === "other" ? personal.sex : "unspecified",
      heightCm: finite(personal.heightCm, 80, 250),
      conditions: text(personal.conditions, 1000),
      medications: text(personal.medications, 1000),
      injuries: text(personal.injuries, 1000),
      dietaryRestrictions: text(personal.dietaryRestrictions, 1000),
      trainingExperience: personal.trainingExperience === "regular" || personal.trainingExperience === "experienced" ? personal.trainingExperience : "new",
      checkInTime: /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(personal.checkInTime || "") ? personal.checkInTime : "21:30",
      shareSummaryWithAgents: Boolean(personal.shareSummaryWithAgents)
    },
    records: Array.isArray(value.records) ? value.records.slice(0, 730).map((record) => ({
      id: text(record.id, 80) || randomUUID(),
      at: record.at || now,
      date: /^\d{4}-\d{2}-\d{2}$/.test(record.date || "") ? record.date : record.at?.slice(0, 10) || now.slice(0, 10),
      weightKg: finite(record.weightKg, 20, 400),
      sleepHours: finite(record.sleepHours, 0, 24),
      sleepQuality: finite(record.sleepQuality, 1, 5),
      energy: finite(record.energy, 1, 5),
      restingHeartRate: finite(record.restingHeartRate, 25, 240),
      steps: finite(record.steps, 0, 200_000),
      trainingMinutes: finite(record.trainingMinutes, 0, 600),
      strengthTraining: Boolean(record.strengthTraining),
      symptoms: text(record.symptoms, 500),
      note: text(record.note, 1000)
    })) : [],
    interviews: Array.isArray(value.interviews) ? value.interviews.slice(-200).map((message): HealthInterviewMessage => ({
      id: text(message.id, 80) || randomUUID(),
      at: message.at || now,
      role: message.role === "assistant" || message.role === "system" ? message.role : "user",
      text: messageText(message.text, 5000)
    })).filter((message) => message.text) : [],
    evidence: officialSources.map((source) => {
      const saved = evidenceById.get(source.id);
      return { ...source, checkedAt: saved?.checkedAt || "", reachable: saved?.reachable ?? null };
    })
  };
}

export function updateHealthPersonalProfile(source: HealthProfile, input: Partial<HealthPersonalProfile>, now = new Date().toISOString()) {
  const profile = normalizeHealthProfile(source, now);
  profile.personal = normalizeHealthProfile({ personal: { ...profile.personal, ...input } }, now).personal;
  profile.revision += 1;
  profile.updatedAt = now;
  return profile;
}

export function addHealthRecord(source: HealthProfile, input: HealthRecordInput, now = new Date().toISOString()) {
  const profile = normalizeHealthProfile(source, now);
  const normalized = normalizeHealthProfile({
    records: [{ ...input, id: randomUUID(), at: now }]
  }, now).records[0];
  const existingIndex = profile.records.findIndex((record) => record.date === normalized.date);
  if (existingIndex >= 0) profile.records[existingIndex] = normalized;
  else profile.records.unshift(normalized);
  profile.records.sort((a, b) => b.date.localeCompare(a.date));
  profile.records = profile.records.slice(0, 730);
  profile.revision += 1;
  profile.updatedAt = now;
  return { profile, record: normalized, urgent: urgentPattern.test(`${normalized.symptoms} ${normalized.note}`) };
}

function average(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null);
  return valid.length ? Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10 : null;
}

export function healthPayload(source: HealthProfile, today = new Date()) {
  const profile = normalizeHealthProfile(source);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 6);
  const recent = profile.records.filter((record) => new Date(`${record.date}T12:00:00`) >= cutoff);
  const latest = profile.records[0] || null;
  const strengthDays = recent.filter((record) => record.strengthTraining).length;
  const trainingMinutes = recent.reduce((sum, record) => sum + (record.trainingMinutes || 0), 0);
  const sleepAverage = average(recent.map((record) => record.sleepHours));
  const energyAverage = average(recent.map((record) => record.energy));
  const weight = latest?.weightKg ?? null;
  const proteinRange = weight ? {
    minimum: Math.round(weight * 1.2),
    maximum: Math.round(weight * 1.7)
  } : null;
  return {
    ok: true,
    profile,
    summary: {
      latest,
      recordsThisWeek: recent.length,
      sleepAverage,
      energyAverage,
      strengthDays,
      trainingMinutes,
      proteinRange,
      urgentRecent: profile.records.slice(0, 7).some((record) => urgentPattern.test(`${record.symptoms} ${record.note}`))
    }
  };
}

export function healthAgentContext(source: HealthProfile, today = new Date()) {
  const payload = healthPayload(source, today);
  if (!payload.profile.personal.shareSummaryWithAgents) return "";
  const { personal } = payload.profile;
  const { summary } = payload;
  const constraints = [
    personal.conditions ? `需关注：${personal.conditions}` : "",
    personal.medications ? `药物/补充剂：${personal.medications}` : "",
    personal.injuries ? `运动限制：${personal.injuries}` : "",
    personal.dietaryRestrictions ? `饮食限制：${personal.dietaryRestrictions}` : ""
  ].filter(Boolean);
  return [
    "以下为用户明确授权共享的本地健康摘要，只用于一般健康协作。",
    "不得据此诊断、开药或建议停药；严重或持续症状应建议由医生评估。",
    constraints.join("；"),
    summary.latest ? `最近记录（${summary.latest.date}）：体重 ${summary.latest.weightKg ?? "未记"}kg，睡眠 ${summary.latest.sleepHours ?? "未记"}h，精力 ${summary.latest.energy ?? "未记"}/5。` : "",
    `近7天：平均睡眠 ${summary.sleepAverage ?? "未记"}h，平均精力 ${summary.energyAverage ?? "未记"}/5，力量训练 ${summary.strengthDays} 天，训练 ${summary.trainingMinutes} 分钟。`
  ].filter(Boolean).join("\n").slice(0, 1800);
}

type HealthInterviewUpdate = {
  profile?: Record<string, unknown>;
  record?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
};

export type HealthArchiveSource = "model" | "local" | "mixed" | "none";

const profileUpdateKeys = [
  "birthYear",
  "sex",
  "heightCm",
  "conditions",
  "medications",
  "injuries",
  "dietaryRestrictions",
  "trainingExperience"
] as const;
const recordUpdateKeys = [
  "date",
  "weightKg",
  "sleepHours",
  "sleepQuality",
  "energy",
  "restingHeartRate",
  "steps",
  "trainingMinutes",
  "strengthTraining",
  "symptoms",
  "note"
] as const;

function supportedEvidence(raw: unknown, userText: string) {
  const excerpts = Array.isArray(raw) ? raw : [raw];
  const normalized = excerpts.map((value) => text(value, 240)).filter((value) => value.length >= 2);
  return normalized.length > 0 && normalized.every((excerpt) => userText.includes(excerpt));
}

function parseInterviewUpdate(assistantText: string): HealthInterviewUpdate | null {
  const match = assistantText.match(healthUpdatePattern);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as HealthInterviewUpdate;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function firstMatch(source: string, pattern: RegExp) {
  const match = source.match(pattern);
  return match ? { match, evidence: match[0].trim() } : null;
}

function appendDistinct(existing: unknown, incoming: unknown, limit: number) {
  const current = text(existing, limit);
  const next = text(incoming, limit);
  if (!next || current.includes(next)) return current;
  if (!current) return next;
  if (next.includes(current)) return next.slice(0, limit);
  return `${current}；${next}`.slice(0, limit);
}

function extractLocalHealthUpdate(userText: string, now: string): HealthInterviewUpdate {
  const profile: Record<string, unknown> = {};
  const record: Record<string, unknown> = {};
  const evidence: Record<string, unknown> = {};

  const weight = firstMatch(userText, /(?:目前|现在|最近|今天)?\s*体重(?:是|为|约|大约|[:：])?\s*(\d{2,3}(?:\.\d+)?)\s*(?:kg|公斤|千克)\b/i);
  if (weight) {
    record.weightKg = Number(weight.match[1]);
    evidence.weightKg = weight.evidence;
  }

  const height = firstMatch(userText, /(?:身高(?:是|为|约|大约|[:：])?\s*)(\d{2,3}(?:\.\d+)?)\s*(?:cm|厘米)\b/i);
  if (height) {
    profile.heightCm = Number(height.match[1]);
    evidence.heightCm = height.evidence;
  }

  const birthYear = firstMatch(userText, /(?:出生(?:年份|日期)?(?:是|为|于|[:：])?\s*)((?:19|20)\d{2})\s*年/i);
  if (birthYear) {
    profile.birthYear = Number(birthYear.match[1]);
    evidence.birthYear = birthYear.evidence;
  }

  const sex = firstMatch(userText, /(?:性别(?:是|为|[:：])?\s*|我是\s*)(男|女)(?=$|[\s，,。；;])/);
  if (sex) {
    profile.sex = sex.match[1] === "男" ? "male" : "female";
    evidence.sex = sex.evidence;
  }

  const sleep = firstMatch(userText, /(?:昨晚|昨天|今天)?\s*(?:睡(?:了|眠(?:时长)?(?:是|为|约|[:：])?)?)\s*(\d{1,2}(?:\.\d+)?)\s*(?:小时|h)\b/i);
  if (sleep) {
    record.sleepHours = Number(sleep.match[1]);
    evidence.sleepHours = sleep.evidence;
  }

  const sleepQuality = firstMatch(userText, /睡眠质量(?:是|为|给|约|[:：])?\s*([1-5])\s*(?:分|\/5)?/i);
  if (sleepQuality) {
    record.sleepQuality = Number(sleepQuality.match[1]);
    evidence.sleepQuality = sleepQuality.evidence;
  }

  const energy = firstMatch(userText, /(?:今天|今日|目前)?\s*(?:精力|能量)(?:是|为|给|约|[:：])?\s*([1-5])\s*(?:分|\/5)?/i);
  if (energy) {
    record.energy = Number(energy.match[1]);
    evidence.energy = energy.evidence;
  }

  const heartRate = firstMatch(userText, /(?:静息心率|晨脉)(?:是|为|约|[:：])?\s*(\d{2,3})\s*(?:次\/分|bpm)?/i);
  if (heartRate) {
    record.restingHeartRate = Number(heartRate.match[1]);
    evidence.restingHeartRate = heartRate.evidence;
  }

  const steps = firstMatch(userText, /(?:今天|今日)?\s*(?:走了|步数(?:是|为|约|[:：])?)\s*(\d{1,6})\s*步/i);
  if (steps) {
    record.steps = Number(steps.match[1]);
    evidence.steps = steps.evidence;
  }

  const training = firstMatch(userText, /(?:今天|今日)?\s*(?:训练|锻炼|健身|运动)(?:了|时长(?:是|为|约|[:：])?)?\s*(\d{1,3})\s*分钟/i);
  if (training) {
    record.trainingMinutes = Number(training.match[1]);
    evidence.trainingMinutes = training.evidence;
  }

  const strength = firstMatch(userText, /(?:今天|今日).{0,8}(?:力量训练|抗阻训练|无氧训练)/i);
  if (strength) {
    record.strengthTraining = true;
    evidence.strengthTraining = strength.evidence;
  }

  const symptomMatchers: Array<[string, RegExp]> = [
    ["疲劳或乏力", /疲劳感明显加重|容易疲惫|明显乏力|经常乏力|很疲惫/],
    ["睡眠恢复感差", /睡眠质量(?:明显)?(?:变差|不好|很差)|睡醒后?(?:仍然)?(?:很累|疲惫)|入睡困难|频繁醒来/],
    ["食欲下降", /食欲(?:明显)?(?:下降|变差|不好)/],
    ["餐后困倦", /(?:吃完饭|餐后).{0,8}(?:困|困倦|想睡)/],
    ["反复口腔溃疡", /反复(?:出现)?口腔溃疡|口腔溃疡反复/],
    ["咽喉不适", /扁桃体炎|咽喉痛|嗓子痛|喉咙痛/],
    ["咳痰", /咳黄痰|黄色痰|有痰/],
    ["胸闷或气短", /胸闷|气短|呼吸不畅/],
    ["手麻", /左手麻|右手麻|手(?:部)?发麻/],
    ["步态不稳", /走路.{0,6}(?:不稳|摇晃)|步态不稳/],
    ["便干", /大便.{0,8}(?:干|颗粒状)|排便困难|便秘/],
    ["眼部红痛", /眼睛.{0,8}(?:红|疼|痛)|眼红|眼痛/],
    ["湿疹或瘙痒", /湿疹|皮肤.{0,8}(?:痒|瘙痒)/]
  ];
  const symptomLabels: string[] = [];
  const symptomEvidence: string[] = [];
  for (const [label, pattern] of symptomMatchers) {
    const match = firstMatch(userText, pattern);
    if (!match) continue;
    symptomLabels.push(label);
    symptomEvidence.push(match.evidence);
  }
  if (symptomLabels.length) {
    record.symptoms = symptomLabels.join("、");
    evidence.symptoms = symptomEvidence;
  }

  const lessSugar = firstMatch(userText, /(?:医生|大夫).{0,12}(?:建议|嘱咐).{0,12}(?:少吃|少摄入|避免).{0,6}(?:甜食|糖)/);
  if (lessSugar) {
    profile.dietaryRestrictions = "少吃甜食（医生建议）";
    evidence.dietaryRestrictions = lessSugar.evidence;
  }

  const diagnosis = firstMatch(userText, /(?:临床诊断|中医诊断|辨证)(?:是|为|[:：])?\s*([^，。；;\n]{2,50})/);
  if (diagnosis) {
    profile.conditions = `${diagnosis.match[1].trim()}（原始就诊记录）`;
    evidence.conditions = diagnosis.evidence;
  }

  if (Object.keys(record).some((key) => key !== "date")) {
    record.date = now.slice(0, 10);
    evidence.date = userText.slice(0, Math.min(20, userText.length));
  }

  return { profile, record, evidence };
}

function readSupportedCandidate(
  section: "profile" | "record",
  key: string,
  userText: string,
  modelUpdate: HealthInterviewUpdate | null,
  localUpdate: HealthInterviewUpdate
) {
  const modelSection = modelUpdate?.[section];
  if (modelSection && key in modelSection && supportedEvidence(modelUpdate?.evidence?.[key], userText)) {
    return { value: modelSection[key], source: "model" as const };
  }
  const localSection = localUpdate[section];
  if (localSection && key in localSection && supportedEvidence(localUpdate.evidence?.[key], userText)) {
    return { value: localSection[key], source: "local" as const };
  }
  return null;
}

export function cleanHealthAssistantText(value: string) {
  return value.replace(healthUpdatePattern, "").trim();
}

export function buildHealthInterviewPrompt(source: HealthProfile, userText: string) {
  const profile = normalizeHealthProfile(source);
  const recent = profile.interviews.slice(-8).map((message) => `${message.role === "user" ? "用户" : "健康助手"}：${message.text}`).join("\n");
  const known = {
    birthYear: profile.personal.birthYear,
    sex: profile.personal.sex,
    heightCm: profile.personal.heightCm,
    conditions: profile.personal.conditions,
    medications: profile.personal.medications,
    injuries: profile.personal.injuries,
    dietaryRestrictions: profile.personal.dietaryRestrictions,
    trainingExperience: profile.personal.trainingExperience,
    latestRecord: profile.records[0] || null
  };
  return [
    "你现在是 Hermes Console 健康页中的访谈助手，运行身份是子 Agent A。",
    "开始处理健康问题时，先加载 personal-health-companion skill；按问题只读取其中最相关的一份 references，不要一次塞入全部资料。",
    "目标：用自然、简短的中文对话收集用户明确提供的健康事实，补问关键空白，并给出保守的循证生活方式建议。",
    "安全边界：不得诊断、开药、建议停药；遇到胸痛、严重呼吸困难、昏厥、偏瘫、严重过敏、自伤等风险，先建议立即就医。",
    "涉及疾病、药物、补充剂、中草药、疼痛康复或训练禁忌时，先核对当前官方来源；本地参考文件只是资料导航，不是最终医学依据。",
    "关于形体与姿态，不宣称存在唯一正确姿态，不凭照片诊断骨骼错位；优先关注疼痛、功能、活动耐受和渐进负荷。",
    "中医内容须区分文化经验与临床证据。不得把体质、经络、排毒或草药功效表述为已证实事实；草药按可能具有药理活性的产品处理。",
    "每轮最多追问两个最有价值的问题，不要一次发问卷。用户不想回答时接受跳过。",
    "回复末尾必须附一个机器可读块，界面会自动隐藏。只记录用户本轮明确说出的事实，不得把推测或你的建议写入。",
    "格式：<health-update>{\"profile\":{},\"record\":{},\"evidence\":{}}</health-update>",
    "profile 允许字段：birthYear, sex(male/female/other/unspecified), heightCm, conditions, medications, injuries, dietaryRestrictions, trainingExperience(new/regular/experienced)。",
    "record 允许字段：date(YYYY-MM-DD), weightKg, sleepHours, sleepQuality(1-5), energy(1-5), restingHeartRate, steps, trainingMinutes, strengthTraining, symptoms, note。",
    "evidence 必须为字段名到用户本轮原句片段的映射；片段必须逐字出现在用户本轮消息中，否则该字段不会保存。",
    "如果本轮没有可保存事实，仍输出空对象。自然回复中简要说明已记录什么、还想补问什么。",
    `[当前已知档案]\n${JSON.stringify(known)}`,
    recent ? `[近期健康访谈]\n${recent}` : "",
    `[用户本轮回答]\n${messageText(userText, 4000)}`
  ].filter(Boolean).join("\n\n");
}

export function applyHealthInterview(
  source: HealthProfile,
  userTextRaw: string,
  assistantTextRaw: string,
  now = new Date().toISOString()
) {
  let profile = normalizeHealthProfile(source, now);
  const userText = messageText(userTextRaw, 5000);
  const assistantText = messageText(cleanHealthAssistantText(assistantTextRaw), 5000) || "本轮没有返回可显示回复。";
  const modelUpdate = parseInterviewUpdate(assistantTextRaw);
  const localUpdate = extractLocalHealthUpdate(userText, now);
  const applied = new Set<string>();
  const appliedSources = new Set<"model" | "local">();
  const profilePatch: Partial<HealthPersonalProfile> = {};

  for (const key of profileUpdateKeys) {
    const candidate = readSupportedCandidate("profile", key, userText, modelUpdate, localUpdate);
    if (!candidate) continue;
    const value = key === "conditions" || key === "medications" || key === "injuries" || key === "dietaryRestrictions"
      ? appendDistinct(profile.personal[key], candidate.value, 1000)
      : candidate.value;
    (profilePatch as Record<string, unknown>)[key] = value;
    applied.add(key);
    appliedSources.add(candidate.source);
  }
  if (Object.keys(profilePatch).length) {
    profile = updateHealthPersonalProfile(profile, profilePatch, now);
  }

  const recordPatch: Record<string, unknown> = {};
  for (const key of recordUpdateKeys) {
    const candidate = readSupportedCandidate("record", key, userText, modelUpdate, localUpdate);
    if (!candidate) continue;
    recordPatch[key] = candidate.value;
    applied.add(key);
    appliedSources.add(candidate.source);
  }
  if (Object.keys(recordPatch).length) {
    const date = typeof recordPatch.date === "string" ? recordPatch.date : now.slice(0, 10);
    const existing = profile.records.find((record) => record.date === date);
    const base: HealthRecordInput = existing ? {
      date: existing.date,
      weightKg: existing.weightKg,
      sleepHours: existing.sleepHours,
      sleepQuality: existing.sleepQuality,
      energy: existing.energy,
      restingHeartRate: existing.restingHeartRate,
      steps: existing.steps,
      trainingMinutes: existing.trainingMinutes,
      strengthTraining: existing.strengthTraining,
      symptoms: existing.symptoms,
      note: existing.note
    } : {
      date,
      weightKg: null,
      sleepHours: null,
      sleepQuality: null,
      energy: null,
      restingHeartRate: null,
      steps: null,
      trainingMinutes: null,
      strengthTraining: false,
      symptoms: "",
      note: ""
    };
    if (existing && typeof recordPatch.symptoms === "string") {
      recordPatch.symptoms = appendDistinct(existing.symptoms, recordPatch.symptoms, 500);
    }
    if (existing && typeof recordPatch.note === "string") {
      recordPatch.note = appendDistinct(existing.note, recordPatch.note, 1000);
    }
    profile = addHealthRecord(profile, { ...base, ...recordPatch, date } as HealthRecordInput, now).profile;
  }

  profile.interviews.push(
    { id: randomUUID(), at: now, role: "user", text: userText },
    { id: randomUUID(), at: now, role: "assistant", text: assistantText }
  );
  profile.interviews = profile.interviews.slice(-200);
  profile.revision += 1;
  profile.updatedAt = now;
  return {
    profile,
    assistantText,
    applied: [...applied],
    archiveSource: appliedSources.size === 2 ? "mixed" : appliedSources.has("model") ? "model" : appliedSources.has("local") ? "local" : "none",
    urgent: urgentPattern.test(userText)
  };
}
