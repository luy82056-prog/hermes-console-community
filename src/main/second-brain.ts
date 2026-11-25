import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { KnowledgeVault } from "./knowledge-vault";
import { isTransientConversation, knowledgeTopic } from "../shared/knowledge-taxonomy";

export type SecondBrainCaptureInput = {
  agentId: string;
  agentName: string;
  sessionId: string;
  model: string;
  userText: string;
  assistantText: string;
  completedAt?: string;
  outcome?: "completed" | "cancelled" | "failed";
};

export type SecondBrainCaptureRecord = {
  id: string;
  title: string;
  at: string;
  agentId: string;
  dailyPath: string;
  knowledgePath: string;
  outcome: "completed" | "cancelled" | "failed";
};

export type SecondBrainStatus = {
  enabled: boolean;
  captureCount: number;
  knowledgeCount: number;
  lastCapture: SecondBrainCaptureRecord | null;
  recent: SecondBrainCaptureRecord[];
};

type SecondBrainState = {
  version: 1;
  enabled: boolean;
  fingerprints: string[];
  captures: SecondBrainCaptureRecord[];
};

type Distillation = {
  title: string;
  summary: string[];
  actions: string[];
  tags: string[];
  substantial: boolean;
};

const SENSITIVE_ASSIGNMENT = /((?:api[\s_-]*key|access[\s_-]*token|secret|password|密码|密钥|令牌)\s*[:=：]\s*)[^\s,，。；;]+/gi;
const SECRET_VALUE = /\b(?:sk|rk|pk|api|token)[-_][a-z0-9_-]{12,}\b/gi;
const LOW_VALUE = /^(你好|您好|hello|hi|在吗|谢谢|好的|好|嗯|继续|重试|[?？!！。.]){1,8}$/i;
const ACTION_SIGNAL = /(下一步|行动|待办|建议|需要|应该|可以先|尝试|练习|完成|建立|创建|检查|验证)/;
const TAG_RULES: Array<[string, RegExp]> = [
  ["写作", /(写作|文章|标题|表达|文案|叙事)/i],
  ["学习", /(学习|知识|课程|理解|阅读|笔记|复习)/i],
  ["金融", /(金融|股票|黄金|投资|估值|资产|现金流)/i],
  ["编程", /(代码|编程|开发|软件|API|GitHub|终端)/i],
  ["AI", /(AI|Agent|模型|提示词|Hermes|OpenClaw)/i],
  ["效率", /(时间管理|效率|计划|任务|流程|自动化)/i],
  ["健康", /(健身|睡眠|饮食|健康|戒色|自律)/i],
  ["个人成长", /(成长|目标|习惯|复盘|反思|能力)/i]
];

function localDateParts(value: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second")
  };
}

function cleanSensitiveText(value: string, limit: number) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(SENSITIVE_ASSIGNMENT, "$1[已过滤凭据]")
    .replace(SECRET_VALUE, "[已过滤凭据]")
    .replace(/\0/g, "")
    .trim()
    .slice(0, limit);
}

function plainText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#>*_`~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function titleFrom(userText: string) {
  const cleaned = plainText(userText)
    .replace(/^(请|帮我|麻烦你|尝试|可以|我想要?|我需要)\s*/i, "")
    .replace(/[。！？?!].*$/, "")
    .trim();
  return (cleaned || "Hermes 对话收获").slice(0, 42);
}

function lineCandidates(markdown: string) {
  const lines = markdown.split("\n");
  const structured = lines
    .map((line) => line.trim())
    .filter((line) => /^(?:#{1,4}\s+|[-*+]\s+|\d+[.)、]\s+)/.test(line))
    .map((line) => plainText(line.replace(/^(?:#{1,4}\s+|[-*+]\s+|\d+[.)、]\s+)/, "")))
    .filter((line) => line.length >= 8 && line.length <= 220);
  const sentences = plainText(markdown)
    .split(/(?<=[。！？!?；;])\s*/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 16 && line.length <= 220);
  return unique([...structured, ...sentences]);
}

export function distillConversation(userValue: string, assistantValue: string): Distillation {
  const userText = cleanSensitiveText(userValue, 20_000);
  const assistantText = cleanSensitiveText(assistantValue, 80_000);
  const candidates = lineCandidates(assistantText);
  const actions = unique(candidates.filter((line) => ACTION_SIGNAL.test(line))).slice(0, 5);
  const summary = unique(candidates.filter((line) => !actions.includes(line))).slice(0, 7);
  if (!summary.length) {
    const fallback = plainText(assistantText).slice(0, 260);
    if (fallback) summary.push(fallback);
  }
  const combined = `${userText}\n${assistantText}`;
  const tags = TAG_RULES.filter(([, rule]) => rule.test(combined)).map(([tag]) => tag);
  if (!tags.length) tags.push("对话沉淀");
  const substantial =
    !LOW_VALUE.test(plainText(userText)) && !isTransientConversation(userText) &&
    (plainText(userText).length >= 32 || (summary.length >= 2 && /方法|概念|原则|知识|学习|整理|复盘|记录|总结/.test(userText)));
  return {
    title: titleFrom(userText),
    summary,
    actions,
    tags: unique([knowledgeTopic(titleFrom(userText), userText), ...TAG_RULES.filter(([, rule]) => rule.test(userText)).map(([tag]) => tag)]).slice(0, 3),
    substantial
  };
}

function quoted(value: string) {
  return value.replace(/\n+/g, "\n> ").split("\n").map((line) => `> ${line}`).join("\n");
}

function safeFileName(value: string) {
  return value.replace(/[/:\\?*"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 60) || "对话收获";
}

export class SecondBrainEngine {
  private readonly statePath: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly vault: KnowledgeVault) {
    this.statePath = path.join(vault.root, ".hermes-console", "second-brain.json");
  }

  initialize() {
    mkdirSync(path.dirname(this.statePath), { recursive: true });
    if (!existsSync(this.statePath)) this.writeState(this.defaultState());
    return this.status();
  }

  status(): SecondBrainStatus {
    const state = this.readState();
    const recent = state.captures.slice(-12).reverse();
    return {
      enabled: state.enabled,
      captureCount: state.captures.length,
      knowledgeCount: state.captures.filter((item) => Boolean(item.knowledgePath)).length,
      lastCapture: recent[0] || null,
      recent
    };
  }

  configure(enabled: boolean) {
    const state = this.readState();
    state.enabled = Boolean(enabled);
    this.writeState(state);
    return this.status();
  }

  capture(input: SecondBrainCaptureInput): Promise<SecondBrainCaptureRecord | null> {
    const task = this.queue.then(() => this.captureNow(input));
    this.queue = task.catch(() => undefined);
    return task;
  }

  private captureNow(input: SecondBrainCaptureInput) {
    const state = this.readState();
    if (!state.enabled) return null;
    const userText = cleanSensitiveText(input.userText, 20_000);
    const assistantText = cleanSensitiveText(input.assistantText, 80_000);
    if (!userText || !assistantText) return null;
    const fingerprint = createHash("sha256")
      .update(`${input.agentId}\0${input.sessionId}\0${userText}\0${assistantText}`)
      .digest("hex");
    if (state.fingerprints.includes(fingerprint)) return null;

    const at = input.completedAt || new Date().toISOString();
    const parts = localDateParts(at);
    const distilled = distillConversation(userText, assistantText);
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}`;
    const dailyPath = `Archive/对话日志/${date}.md`;
    const captureId = fingerprint.slice(0, 16);
    const cardName = `${parts.hour}${parts.minute}${parts.second}-${safeFileName(distilled.title)}-${captureId.slice(0, 6)}`;
    const topic = knowledgeTopic(distilled.title, userText);
    const knowledgePath = distilled.substantial && (input.outcome || "completed") === "completed"
      ? `Inbox/待整理/${topic}/${cardName}.md`
      : "";

    if (knowledgePath) {
      const card = matter.stringify(
        [
          `# ${distilled.title}`,
          "",
          "## 我的问题",
          "",
          quoted(userText.slice(0, 4000)),
          "",
          "## 待核对摘要",
          "",
          ...distilled.summary.map((item) => `- ${item}`),
          ...(distilled.actions.length ? ["", "## 行动项", "", ...distilled.actions.map((item) => `- [ ] ${item}`)] : []),
          "",
          "## 来源",
          "",
          `- Agent：${input.agentName}`,
          `- 模型：${input.model || "未知"}`,
          `- 会话：\`${input.sessionId || "未记录"}\``,
          `- 当日日志：[[${date}]]`,
          `- 状态：${input.outcome || "completed"}`,
          "",
          `<!-- hermes-capture:${captureId} -->`,
          ""
        ].join("\n"),
        {
          title: distilled.title,
          tags: distilled.tags,
          source: "hermes-conversation",
          kind: "material",
          status: "inbox",
          topic,
          classification_reason: "自动提取候选材料，核对后再收录正式知识",
          source_agent: input.agentId,
          session_id: input.sessionId,
          capture_id: captureId,
          created: at,
          updated: at
        }
      );
      this.vault.writeGenerated(knowledgePath, card);
    }

    const existing = this.vault.exists(dailyPath) ? this.vault.readGenerated(dailyPath) : matter.stringify(
      `# ${date} · Hermes 对话日志\n\n仅供追溯，不等同于已确认的知识或个人事实。\n`,
      {
        title: `${date} · Hermes 对话日志`,
        tags: ["对话日志"], kind: "log", status: "archived", topic: "通用",
        source: "hermes-conversation",
        created: at,
        updated: at
      }
    );
    const entry = [
      "",
      `## ${time} · ${input.agentName} · ${distilled.title}`,
      "",
      quoted(userText.slice(0, 1600)),
      "",
      "### 精炼",
      "",
      ...distilled.summary.map((item) => `- ${item}`),
      ...(distilled.actions.length ? ["", "### 下一步", "", ...distilled.actions.map((item) => `- [ ] ${item}`)] : []),
      ...(knowledgePath ? ["", `知识卡片：[[${path.basename(knowledgePath, ".md")}]]`] : []),
      "",
      `<small>${input.model || "未知模型"} · ${input.outcome || "completed"}</small>`,
      "",
      `<!-- hermes-capture:${captureId} -->`,
      ""
    ].join("\n");
    this.vault.writeGenerated(dailyPath, `${existing.trimEnd()}\n${entry}`);

    const record: SecondBrainCaptureRecord = {
      id: captureId,
      title: distilled.title,
      at,
      agentId: input.agentId,
      dailyPath,
      knowledgePath,
      outcome: input.outcome || "completed"
    };
    state.fingerprints = [...state.fingerprints, fingerprint].slice(-4000);
    state.captures = [...state.captures, record].slice(-2000);
    this.writeState(state);
    return record;
  }

  private defaultState(): SecondBrainState {
    return { version: 1, enabled: true, fingerprints: [], captures: [] };
  }

  private readState(): SecondBrainState {
    try {
      const parsed = JSON.parse(readFileSync(this.statePath, "utf8")) as Partial<SecondBrainState>;
      return {
        version: 1,
        enabled: parsed.enabled !== false,
        fingerprints: Array.isArray(parsed.fingerprints) ? parsed.fingerprints.filter((item): item is string => typeof item === "string") : [],
        captures: Array.isArray(parsed.captures) ? parsed.captures as SecondBrainCaptureRecord[] : []
      };
    } catch {
      return this.defaultState();
    }
  }

  private writeState(state: SecondBrainState) {
    mkdirSync(path.dirname(this.statePath), { recursive: true });
    const temporary = `${this.statePath}.${process.pid}.${randomUUID()}.tmp`;
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(descriptor, `${JSON.stringify(state, null, 2)}\n`);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, this.statePath);
  }
}
