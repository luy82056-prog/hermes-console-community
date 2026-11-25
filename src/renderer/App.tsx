import { HeartJournalPanel } from "./HeartJournalPanel";
import { InsightsPanel } from "./InsightsPanel";
import { PersonalAgentHome, type PersonalAgentSessionItem } from "./PersonalAgentHome";
import type { JournalResult, JournalTopic } from "../shared/heart-journal";
import {
  Activity,
  ArrowDown,
  Ban,
  BookOpen,
  BrainCircuit,
  CalendarClock,
  CalendarDays,
  Check,
  CircleStop,
  Copy,
  Columns3,
  Cpu,
  Download,
  FolderOpen,
  Flame,
  Gauge,
  GitBranch,
  HeartPulse,
  History,
  KeyRound,
  LayoutDashboard,
  ListRestart,
  LoaderCircle,
  Mic,
  MicOff,
  Pause,
  Pencil,
  Play,
  Plus,
  PlugZap,
  Quote,
  Radio,
  RefreshCcw,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Send,
  Sparkles,
  Target,
  TerminalSquare,
  Trophy,
  Volume2,
  Wrench,
  X
} from "lucide-react";
import wordCloudLayout from "d3-cloud";
import { lazy, Suspense, type CSSProperties, type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./styles.css";
import "./personal-agent.css";
import "./console-layout.css";
import "./page-layout.css";
import "./chat-layout.css";

const KnowledgePage = lazy(() => import("./KnowledgePage").then((module) => ({ default: module.KnowledgePage })));
const HealthPage = lazy(() => import("./HealthPage").then((module) => ({ default: module.HealthPage })));

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
};

type StatusSummary = {
  raw: string;
  version: string;
  project: string;
  python: string;
  model: string;
  provider: string;
  gateway: string;
  jobs: string;
  sessions: string;
};

type Snapshot = {
  status: StatusSummary;
  gateway: CommandResult;
  sessions: CommandResult;
  cron: CommandResult;
  logs: CommandResult;
  tools: CommandResult;
  skills: CommandResult;
};

type ModelPreset = {
  id: string;
  label: string;
  model: string;
  provider: string;
  providerLabel: string;
  baseUrl: string;
  apiKeyEnv?: string;
  custom?: boolean;
  available?: boolean;
};

type ModelSyncStatus = { source: "online" | "cache" | "builtin"; checkedAt?: string; updatedAt?: string; reason?: string };

type UpdateInfo = {
  available: boolean;
  detail: string;
  currentVersion: string;
  releaseUrl: string;
  status: StatusSummary;
};

type RealtimeVoice = "marin" | "cedar" | "alloy" | "shimmer" | "verse";

type RealtimeSessionResult =
  | {
      ok: true;
      clientSecret: string;
      expiresAt?: number;
      model: "gpt-realtime";
      voice: RealtimeVoice;
      mode: "vad" | "push-to-talk";
    }
  | {
      ok: false;
      reason: string;
    };

type SessionHistoryItem = {
  id: string;
  agentId: string;
  title: string;
  preview: string;
  updatedAt: string;
  model: string;
  messageCount: number;
  source: "session" | "request-dump";
  fileName: string;
};

type SessionHistoryResult =
  | { ok: true; sessions: SessionHistoryItem[] }
  | { ok: false; reason: string; sessions: SessionHistoryItem[] };

type SessionLoadResult =
  | { ok: true; session: SessionHistoryItem & { messages: ChatMessage[] } }
  | { ok: false; reason: string };

type SchedulerJob = {
  id: string;
  name?: string;
  prompt?: string;
  schedule_display?: string;
  enabled?: boolean;
  state?: string;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_status?: string | null;
  last_error?: string | null;
  deliver?: string;
  repeat?: { times?: number | null; completed?: number };
};

type SchedulerResult = { ok: boolean; jobs: SchedulerJob[]; updatedAt?: string; reason?: string; output?: string };
type KanbanTask = {
  id: string;
  title: string;
  body?: string;
  status?: string;
  assignee?: string | null;
  priority?: number;
  parent_ids?: string[];
  parents?: Array<string | { id?: string }>;
  updated_at?: string;
  created_at?: string;
  failure_count?: number;
  max_retries?: number;
  goal?: boolean;
  goal_max_turns?: number;
  summary?: string;
};
type JsonResult<T> = { ok: boolean; data: T; reason?: string };
type HeartprintProfile = { version: 2; updatedAt: string; revision: number; note: string; items: Array<{ id: string; category: "fact" | "preference" | "goal" | "boundary"; text: string; sourceAgent: string; createdAt: string; updatedAt: string; confidence: number; evidenceCount: number; evidenceIds: string[] }>; reflections: Array<{ id: string; at: string; agentId: string; user: string; assistant: string }> };
type HeartprintRange = "7d" | "30d" | "all";
type HeartprintKeyword = { text: string; score: number; count: number; category: "fact" | "preference" | "goal" | "boundary"; lastSeen: string; sources: Array<{ at: string; agentId: string; excerpt: string }> };
type HeartprintResult = { ok: boolean; profile: HeartprintProfile; keywords: HeartprintKeyword[] };
type GrowthSkillNode = { id: string; title: string; progress: number };
type GrowthCapability = { id: string; title: string; description: string; category: "thinking" | "expression" | "execution" | "wellbeing" | "custom"; enabled: boolean; progress: number; level: number; signals: string[]; nodes: GrowthSkillNode[]; createdAt: string; updatedAt: string };
type GrowthEvidence = { id: string; at: string; agentId: string; capabilityId: string; source: "conversation" | "writing" | "manual"; excerpt: string; score: number; reason: string };
type GrowthObservation = { id: string; at: string; agentId: string; source: "conversation" | "writing" | "manual"; excerpt: string; capabilityIds: string[] };
type GrowthProfile = { version: 1; revision: number; updatedAt: string; capabilities: GrowthCapability[]; evidence: GrowthEvidence[]; observations: GrowthObservation[] };
type GrowthResult = { ok: boolean; profile: GrowthProfile; summary: { enabled: number; average: number; evidence: number; observations: number; updatedAt: string }; added?: GrowthEvidence[]; capability?: GrowthCapability | null; reason?: string };
type DisciplineMode = "avoid" | "build";
type DisciplineStatus = "kept" | "slipped" | "done" | "skipped";
type DisciplineStats = { currentStreak: number; longestStreak: number; totalSuccess: number; xp: number; level: number; todayStatus: DisciplineStatus | null; recent: Array<{ date: string; status: DisciplineStatus | null; success: boolean }> };
type DisciplineGoal = { id: string; title: string; mode: DisciplineMode; reason: string; minimumAction: string; active: boolean; createdAt: string; updatedAt: string; stats: DisciplineStats };
type DisciplineResult = { ok: boolean; reason?: string; profile: { version: 1; revision: number; updatedAt: string }; goals: DisciplineGoal[]; totalXp: number };
type KnowledgeNoteSummary = { kind: import("../shared/knowledge-taxonomy").KnowledgeKind; status: import("../shared/knowledge-taxonomy").KnowledgeStatus; topic: string; reason: string; path: string; title: string; folder: string; tags: string[]; createdAt: string; updatedAt: string; mtimeMs: number; excerpt: string; links: string[]; backlinks: number };
type KnowledgeNote = KnowledgeNoteSummary & { content: string };
type KnowledgeSnapshot = { root: string; folders: string[]; notes: KnowledgeNoteSummary[]; graph: { nodes: Array<{ id: string; label: string; folder: string; tags: string[]; inbound: number; outbound: number }>; links: Array<{ source: string; target: string; kind: "link" | "suggestion" }> } };
type KnowledgeSaveResult = { ok: true; note: KnowledgeNote } | { ok: false; conflict?: boolean; reason: string; diskContent?: string; mtimeMs?: number };
type ReaderHighlight = { id: string; text: string; createdAt: string; chapter?: string };
type ReaderProgress = { scrollRatio: number; fontScale: number; theme: "paper" | "night"; updatedAt: string; highlights: ReaderHighlight[] };
type ReaderDocumentSummary = { path: string; name: string; title: string; author: string; type: "markdown" | "text" | "epub"; size: number; updatedAt: string; progress: ReaderProgress };
type ReaderDocument = ReaderDocumentSummary & { content: string; html: string; toc: Array<{ label: string; target: string; depth: number }> };
type SecondBrainCaptureRecord = { id: string; title: string; at: string; agentId: string; dailyPath: string; knowledgePath: string; outcome: "completed" | "cancelled" | "failed" };
type SecondBrainStatus = { enabled: boolean; captureCount: number; knowledgeCount: number; lastCapture: SecondBrainCaptureRecord | null; recent: SecondBrainCaptureRecord[] };

type HermesBridge = import("../shared/insights").InsightsBridge & {
  snapshot: () => Promise<Snapshot>;
  status: () => Promise<StatusSummary>;
  updateInfo: () => Promise<UpdateInfo>;
  updateHermes: () => Promise<{ ok: boolean; before: UpdateInfo; after: UpdateInfo; output: string }>;
  gateway: (action: "start" | "stop" | "restart" | "status") => Promise<CommandResult>;
  cron: (action: "list" | "status" | "tick") => Promise<CommandResult>;
  schedulerList: () => Promise<SchedulerResult>;
  schedulerCreate: (input: unknown) => Promise<SchedulerResult>;
  schedulerUpdate: (jobId: string, input: unknown) => Promise<SchedulerResult>;
  schedulerPause: (jobId: string) => Promise<SchedulerResult>;
  schedulerResume: (jobId: string) => Promise<SchedulerResult>;
  schedulerRun: (jobId: string) => Promise<SchedulerResult>;
  schedulerRemove: (jobId: string) => Promise<SchedulerResult>;
  schedulerStatus: () => Promise<CommandResult>;
  kanbanBoards: () => Promise<JsonResult<Array<{ slug: string; name: string; is_current?: boolean; counts?: Record<string, number> }>>>;
  kanbanList: (board?: string) => Promise<JsonResult<KanbanTask[]>>;
  kanbanStats: (board?: string) => Promise<JsonResult<{ by_status?: Record<string, number>; by_assignee?: Record<string, number> }>>;
  kanbanCreate: (input: unknown) => Promise<JsonResult<Record<string, unknown>>>;
  kanbanShow: (board: string, taskId: string) => Promise<JsonResult<Record<string, unknown>>>;
  kanbanRuns: (board: string, taskId: string) => Promise<JsonResult<unknown[]>>;
  kanbanLink: (board: string, parentId: string, childId: string) => Promise<{ ok: boolean; output?: string }>;
  kanbanAssign: (board: string, taskId: string, assignee: string) => Promise<{ ok: boolean; output?: string }>;
  kanbanBlock: (board: string, taskId: string, reason?: string) => Promise<{ ok: boolean; output?: string }>;
  kanbanRetry: (board: string, taskId: string) => Promise<{ ok: boolean; output?: string }>;
  kanbanCancel: (board: string, taskId: string) => Promise<{ ok: boolean; output?: string }>;
  automationPause: () => Promise<{ ok: boolean; pausedJobIds: string[] }>;
  automationResume: () => Promise<{ ok: boolean; resumedJobIds: string[] }>;
  runtimeList: () => Promise<Array<{ id: string; label: string; capabilities: Record<string, boolean> }>>;
  runtimeAgents: (runtimeId: string) => Promise<Array<{ runtimeId: string; agentId: string; name: string; model: string; status: string }>>;
  runtimeStartSession: (runtimeId: string, input: { agentId: string; modelPresetId?: string }) => Promise<{ runtimeId: string; agentId: string; sessionId: string; createdAt: string }>;
  runtimeSend: (runtimeId: string, sessionId: string, prompt: string) => Promise<unknown>;
  runtimeInterrupt: (runtimeId: string, sessionId: string) => Promise<unknown>;
  knowledgeCleanup: () => Promise<{ ok: boolean; report?: import("../shared/knowledge-cleanup").CleanupReport; reason?: string }>;
  knowledgeCleanupStatus: () => Promise<import("../shared/knowledge-cleanup").CleanupProgress>;
  knowledgeCleanupCancel: () => Promise<void>;
  knowledgeCleanupRestore: (id: string) => Promise<{ ok: boolean; report?: import("../shared/knowledge-cleanup").CleanupReport; reason?: string }>;
  onKnowledgeCleanup: (callback: (state: import("../shared/knowledge-cleanup").CleanupProgress) => void) => () => void;
  knowledgeSnapshot: () => Promise<KnowledgeSnapshot>;
  knowledgeUpdateMetadata: (relativePath: string, input: { tags?: string[]; kind?: string; status?: string; topic?: string }, expectedMtimeMs: number) => Promise<KnowledgeSaveResult>;
  knowledgeRead: (relativePath: string) => Promise<KnowledgeNote>;
  knowledgeCreate: (input?: { folder?: string; title?: string }) => Promise<KnowledgeNote>;
  knowledgeRename: (relativePath: string, input: { folder?: string; title: string }, expectedMtimeMs?: number) => Promise<{ ok: boolean; note?: KnowledgeNote; reason?: string }>;
  knowledgeRemove: (relativePath: string, confirmation: string, options?: { deleteOriginal?: boolean; expectedMtimeMs?: number }) => Promise<{ ok: boolean; trashedPath?: string; reason?: string }>;
  knowledgeSave: (relativePath: string, content: string, expectedMtimeMs?: number) => Promise<KnowledgeSaveResult>;
  knowledgeSearch: (query: string) => Promise<KnowledgeNoteSummary[]>;
  knowledgeBacklinks: (relativePath: string) => Promise<KnowledgeNoteSummary[]>;
  knowledgeImportImage: (input: { name: string; mime: string; data: Uint8Array }) => Promise<{ ok: boolean; path: string; reason?: string }>;
  knowledgeReadAsset: (relativePath: string) => Promise<{ mime: string; dataBase64: string }>;
  knowledgeAcceptSuggestion: (sourcePath: string, targetPath: string, expectedMtimeMs?: number) => Promise<KnowledgeSaveResult>;
  knowledgeRestoreExcluded: (relativePath: string) => Promise<{ ok: boolean }>;
  knowledgeReveal: (relativePath: string) => Promise<void>;
  knowledgeOpenRoot: () => Promise<string>;
  readerList: () => Promise<ReaderDocumentSummary[]>;
  readerOpen: (relativePath: string) => Promise<ReaderDocument>;
  readerImport: () => Promise<{ ok: boolean; canceled?: boolean; paths: string[] }>;
  readerImportBuffer: (input: { name: string; data: Uint8Array }) => Promise<{ ok: boolean; path: string }>;
  readerProgress: (relativePath: string, patch: { scrollRatio?: number; fontScale?: number; theme?: "paper" | "night" }) => Promise<ReaderProgress>;
  readerAddHighlight: (relativePath: string, text: string, chapter?: string) => Promise<ReaderProgress>;
  readerRemoveHighlight: (relativePath: string, highlightId: string) => Promise<ReaderProgress>;
  readerExportHighlights: (relativePath: string) => Promise<{ ok: boolean; path: string }>;
  readerNewWindow: (relativePath?: string) => Promise<{ ok: boolean }>;
  onKnowledgeUpdated: (callback: (event: { at: string }) => void) => () => void;
  secondBrainStatus: () => Promise<SecondBrainStatus>;
  secondBrainConfigure: (enabled: boolean) => Promise<SecondBrainStatus>;
  onSecondBrainUpdated: (callback: (event: SecondBrainStatus) => void) => () => void;
  journalGet: () => Promise<JournalResult>;
  journalCategorize: (id: string, topic: JournalTopic) => Promise<JournalResult>;
  heartprintGet: (range?: HeartprintRange) => Promise<HeartprintResult>;
  heartprintSaveNote: (note: string, range?: HeartprintRange) => Promise<HeartprintResult>;
  heartprintRemove: (itemId: string, range?: HeartprintRange) => Promise<HeartprintResult>;
  heartprintCompact: (range?: HeartprintRange) => Promise<HeartprintResult>;
  heartprintClear: (range?: HeartprintRange) => Promise<HeartprintResult>;
  onHeartprintUpdated: (callback: (event: { revision: number; updatedAt: string }) => void) => () => void;
  growthGet: () => Promise<GrowthResult>;
  growthCreate: (prompt: string) => Promise<GrowthResult>;
  growthToggle: (capabilityId: string, enabled: boolean) => Promise<GrowthResult>;
  growthAnalyze: (text: string, source?: "writing" | "manual") => Promise<GrowthResult>;
  onGrowthUpdated: (callback: (event: { revision: number; updatedAt: string }) => void) => () => void;
  disciplineGet: () => Promise<DisciplineResult>;
  disciplineCheckIn: (goalId: string, status: DisciplineStatus, note?: string) => Promise<DisciplineResult>;
  disciplineUpdate: (goalId: string, input: { title: string; mode: DisciplineMode; reason: string; minimumAction: string; active: boolean }) => Promise<DisciplineResult>;
  onDisciplineUpdated: (callback: (event: { revision: number; updatedAt: string }) => void) => () => void;
  healthGet: () => Promise<unknown>;
  healthUpdateProfile: (input: unknown) => Promise<unknown>;
  healthAddRecord: (input: unknown) => Promise<unknown>;
  healthRefreshEvidence: () => Promise<unknown>;
  healthInterviewPrompt: (userText: string) => Promise<{ ok: boolean; prompt: string }>;
  healthStartInterview: (userText: string) => Promise<{ ok: boolean; reason?: string; startedAt?: number }>;
  healthArchiveInterview: (userText: string, assistantText: string) => Promise<unknown>;
  onHealthUpdated: (callback: (event: { revision: number; updatedAt: string }) => void) => () => void;
  logs: (logName: "agent" | "errors" | "gateway", lines?: number) => Promise<CommandResult>;
  sessions: (limit?: number) => Promise<CommandResult>;
  sessionHistory: (agentId?: string, limit?: number) => Promise<SessionHistoryResult>;
  loadSession: (agentId: string, sessionId: string) => Promise<SessionLoadResult>;
  onAgentModelUpdated: (callback: (state: AgentRuntimeState) => void) => () => void;
  onModelsUpdated: (callback: (presets: ModelPreset[]) => void) => () => void;
  discoverModels: (preset: ModelPreset, apiKey?: string) => Promise<{ ok: boolean; models?: string[]; reason?: string }>;
  modelPresets: () => Promise<ModelPreset[]>;
  modelSyncStatus: () => Promise<ModelSyncStatus>;
  refreshModels: () => Promise<ModelSyncStatus>;
  onModelSyncUpdated: (callback: (status: ModelSyncStatus) => void) => () => void;
  switchModel: (presetId: ModelPreset["id"]) => Promise<{ ok: boolean; reason?: string; preset?: ModelPreset; presets?: ModelPreset[]; status?: StatusSummary }>;
  createRealtimeSession: (request: { voice?: RealtimeVoice; mode?: "vad" | "push-to-talk" }) => Promise<RealtimeSessionResult>;
  startAgent: (agentId: string, prompt: string, presetId?: ModelPreset["id"], preset?: ModelPreset | null) => Promise<{ ok: boolean; reason?: string; startedAt?: number }>;
  interruptAgent: (agentId?: string) => Promise<{ ok: boolean; reason?: string }>;
  pauseAgent: (agentId?: string) => Promise<{ ok: boolean; reason?: string; paused?: boolean }>;
  resumeAgent: (agentId?: string) => Promise<{ ok: boolean; reason?: string; paused?: boolean }>;
  newAgentContext: (agentId?: string, presetId?: ModelPreset["id"]) => Promise<{ ok: boolean; reason?: string }>;
  configureAgentModel: (agentId: string, preset: ModelPreset, apiKey?: string) => Promise<{ ok: boolean; reason?: string; preset?: ModelPreset; state?: AgentRuntimeState }>;
  verifyAgentModel: (agentId: string) => Promise<{ ok: boolean; reason?: string; message?: string }>;
  agentState: (agentId?: string) => Promise<AgentRuntimeState>;
  agentStates: () => Promise<AgentRuntimeState[]>;
  onAgentEvent: (callback: (event: AgentEvent) => void) => () => void;
  openPath: (target: "home" | "config" | "logs") => Promise<string>;
  openExternal: (url: string) => Promise<{ ok: boolean; reason?: string }>;
};

type AgentEvent =
  | { type: "start"; runtimeId?: string; agentId?: string; startedAt: number; command: string }
  | { type: "session"; runtimeId?: string; agentId?: string; sessionId: string; at: number }
  | { type: "stdout" | "stderr" | "error"; runtimeId?: string; agentId?: string; chunk: string; at: number }
  | { type: "close"; runtimeId?: string; agentId?: string; code: number | null; signal: string | null; hadOutput?: boolean; at: number };

type ChatMessage = {
  id: string;
  runtimeId?: string;
  agentId?: string;
  sessionId?: string | null;
  role: "user" | "agent" | "system";
  text: string;
  at: string;
};

type AgentTraceEvent = {
  id: string;
  kind: "task" | "session" | "output" | "pause" | "cancel" | "error" | "done" | "config";
  label: string;
  detail: string;
  at: string;
};

type AgentRuntimeState = {
  runtimeId?: string;
  agentId: string;
  running: boolean;
  paused: boolean;
  startedAt: number;
  sessionId: string | null;
  presetId: ModelPreset["id"];
  customPreset?: ModelPreset | null;
};

type AgentSlotId = "parent" | "child-a" | "child-b";

type AgentSlot = {
  id: AgentSlotId;
  name: string;
  role: string;
  presetId: ModelPreset["id"];
  customPreset: ModelPreset | null;
  sessionId: string | null;
  messages: ChatMessage[];
  running: boolean;
  paused: boolean;
  startedAt: number;
  phase: string;
  progress: number;
  queue: string[];
  events: AgentTraceEvent[];
};

type StoredAgentSlot = {
  name?: string;
  modelDefaultsVersion?: number;
  presetId?: ModelPreset["id"];
  customPreset?: ModelPreset | null;
  sessionId?: string | null;
  messages?: ChatMessage[];
  events?: AgentTraceEvent[];
};

type AgentModelDraft = {
  label: string;
  model: string;
  provider: string;
  providerLabel: string;
  baseUrl: string;
  apiKeyEnv?: string;
  apiKey: string;
};

type VoiceMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  at: string;
};

declare global {
  interface Window {
    hermes: HermesBridge;
  }
}

const brandAsset = "./hermes-router-bot.svg";
const realtimeVoices: RealtimeVoice[] = ["marin", "cedar", "alloy", "shimmer", "verse"];

const nav = [
  { id: "home", label: "我的 Agent", icon: LayoutDashboard, group: "工作" },
  { id: "sessions", label: "对话", icon: History, group: "工作" },
  { id: "cron", label: "任务与例行", icon: CalendarClock, group: "工作" },
  { id: "heartprint", label: "个人记忆", icon: Sparkles, group: "个人" },
  { id: "knowledge", label: "知识库", icon: BookOpen, group: "个人" },
  { id: "growth", label: "成长", icon: Target, group: "个人" },
  { id: "health", label: "健康", icon: HeartPulse, group: "个人" },
  { id: "observatory", label: "观测台", icon: Gauge, group: "系统" },
  { id: "gateway", label: "网关", icon: PlugZap, group: "系统" },
  { id: "tools", label: "工具与技能", icon: Wrench, group: "系统" },
  { id: "security", label: "安全", icon: ShieldCheck, group: "系统" }
] as const;

type TabId = (typeof nav)[number]["id"];
type ChatHandoff = { id: number; prompt?: string; session?: Pick<SessionHistoryItem, "id" | "agentId" | "title"> };

function lines(text = "", limit = 10) {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, limit);
}

function output(result?: CommandResult, fallback = "暂无数据") {
  const text = `${result?.stdout ?? ""}${result?.stderr ? `\n${result.stderr}` : ""}`.trim();
  return text || fallback;
}

function currentModelPresetId(status: StatusSummary | undefined, presets: ModelPreset[]) {
  const model = status?.model.toLowerCase() ?? "";
  const provider = status?.provider.toLowerCase() ?? "";
  return presets.find((preset) => {
    const providerMatches = provider === preset.providerLabel.toLowerCase() || provider === preset.provider.toLowerCase();
    return model === preset.model.toLowerCase() && providerMatches;
  })?.id ?? "";
}

function isHermesMissing(snapshot: Snapshot | null) {
  return snapshot?.gateway.code === 127 || snapshot?.status.raw.includes("Hermes CLI was not found");
}

function App() {
  const initialTab = new URLSearchParams(window.location.search).get("tab");
  const [active, setActive] = useState<TabId>(
    nav.some((item) => item.id === initialTab) ? initialTab as TabId : "home"
  );
  const [chatActivated, setChatActivated] = useState(initialTab === "sessions");
  useEffect(() => {
    const navigateInsights = (event: Event) => { const tab=(event as CustomEvent).detail; if(tab==="knowledge" || tab==="heartprint")setActive(tab); };
    window.addEventListener("hermes:insights:navigate",navigateInsights);
    return()=>window.removeEventListener("hermes:insights:navigate",navigateInsights);
  },[]);
  const [chatHandoff, setChatHandoff] = useState<ChatHandoff | null>(null);
  const handoffId = useRef(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [logName, setLogName] = useState<"agent" | "errors" | "gateway">("agent");
  const [liveLog, setLiveLog] = useState<CommandResult | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [modelPresets, setModelPresets] = useState<ModelPreset[]>([]);
  const [modelSwitching, setModelSwitching] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");

  function navigate(tab: TabId) {
    if (tab === "sessions") setChatActivated(true);
    setActive(tab);
  }

  function composeFromHome(prompt: string) {
    setChatHandoff({ id: ++handoffId.current, prompt });
    navigate("sessions");
  }

  function openHomeSession(session: PersonalAgentSessionItem) {
    setChatHandoff({ id: ++handoffId.current, session });
    navigate("sessions");
  }

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      if (!window.hermes) {
        throw new Error("Hermes bridge is unavailable. Please restart the Electron window.");
      }
      const next = await window.hermes.snapshot();
      setSnapshot(next);
      setLiveLog(await window.hermes.logs(logName, 90));
      setUpdateInfo(await window.hermes.updateInfo());
      setLastUpdated(new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function refreshLog(nextLog = logName) {
    setLogName(nextLog);
    setLiveLog(await window.hermes.logs(nextLog, 90));
  }

  async function checkUpdate() {
    setUpdateBusy(true);
    setUpdateMessage("正在检查 Hermes 更新...");
    setError("");
    try {
      const info = await window.hermes.updateInfo();
      setUpdateInfo(info);
      setSnapshot((current) => current && { ...current, status: info.status });
      setUpdateMessage(info.available ? `发现更新：${info.detail}` : info.detail);
      setLastUpdated(new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setUpdateMessage("检查更新失败。");
    } finally {
      setUpdateBusy(false);
    }
  }

  async function runUpdate() {
    setUpdateBusy(true);
    setUpdateMessage("正在更新 Hermes，这可能需要几分钟...");
    setError("");
    try {
      const result = await window.hermes.updateHermes();
      setUpdateInfo(result.after);
      setSnapshot((current) => current && { ...current, status: result.after.status });
      setUpdateMessage(result.ok ? "Hermes 更新完成。" : `更新未完成：${result.output}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setUpdateMessage("更新失败。");
    } finally {
      setUpdateBusy(false);
    }
  }

  async function switchModel(presetId: ModelPreset["id"]) {
    setModelSwitching(true);
    setError("");
    try {
      const result = await window.hermes.switchModel(presetId);
      if (!result.ok) {
        throw new Error(result.reason ?? "模型切换失败");
      }
      if (result.status) {
        setSnapshot((current) => current && { ...current, status: result.status! });
      }
      setLastUpdated(new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setModelSwitching(false);
    }
  }

  async function gateway(action: "start" | "stop" | "restart" | "status") {
    setBusy(true);
    try {
      await window.hermes.gateway(action);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    if (window.hermes) {
      void window.hermes.modelPresets().then(setModelPresets).catch(() => {});
      return window.hermes.onModelsUpdated(setModelPresets);
    }
  }, []);

  const status = snapshot?.status;
  const missingHermes = isHermesMissing(snapshot);
  const metrics = [
    { label: "模型", value: status?.model ?? "Unknown", tone: "ink" },
    { label: "Provider", value: status?.provider ?? "Unknown", tone: "green" },
    { label: "Gateway", value: status?.gateway ?? "Unknown", tone: "blue" },
    { label: "任务", value: status?.jobs ?? "Unknown", tone: "amber" },
    { label: "会话", value: status?.sessions ?? "Unknown", tone: "rose" }
  ];

  return (
    <main className="app-frame">
      <div className="title-strip">
        <span>Hermes Console</span>
      </div>
      <section className="shell">
      <aside className="sidebar no-drag">
        <div className="brand">
          <div className="mark">
            <img src={brandAsset} alt="" />
          </div>
          <div>
            <strong>Hermes Console</strong>
            <span>你的个人 Agent</span>
          </div>
        </div>

        <nav className="nav" aria-label="主导航">
          {(["工作", "个人", "系统"] as const).map((group) => (
            <div className="nav-section" key={group}>
              <span className="nav-section-label">{group}</span>
          {nav.filter((item) => item.group === group).map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={active === item.id ? "nav-item active" : "nav-item"}
                key={item.id}
                onClick={() => navigate(item.id)}
                aria-current={active === item.id ? "page" : undefined}
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="ghost" onClick={() => window.hermes.openPath("home")} title="打开 Hermes Home">
            <FolderOpen size={16} />
            <span>本地目录</span>
          </button>
          <button className="ghost" onClick={() => window.hermes.openPath("config")} title="打开配置文件">
            <Settings size={16} />
            <span>配置文件</span>
          </button>
        </div>
      </aside>

      <section className={`workspace no-drag${active === "home" ? " personal-workspace" : active === "sessions" ? " sessions-workspace" : ""}`}>
        <header className="topbar">
          <div>
            <p className="eyebrow">{active === "home" ? "Personal Agent · 本地工作空间" : "Hermes Console"}</p>
            <h1>{titleFor(active)}</h1>
          </div>
          <div className="actions">
            {active !== "home" ? <label className="model-switcher" title={`Hermes 全局默认：${status?.model ?? "Unknown"} · ${status?.provider ?? "Unknown"}`}>
              <Cpu size={16} />
              <select
                value={currentModelPresetId(status, modelPresets)}
                disabled={modelSwitching || busy || modelPresets.length === 0}
                onChange={(event) => {
                  const next = event.target.value as ModelPreset["id"];
                  if (next) {
                    void switchModel(next);
                  }
                }}
              >
                <option value="" disabled>
                  {status ? `全局 · ${status.model} · ${status.provider}` : "选择全局模型"}
                </option>
                {modelPresets.map((preset) => (
                  <option key={preset.id} value={preset.id} disabled={preset.available === false}>
                    {`全局 · ${preset.model} · ${preset.providerLabel}${preset.available === false ? " · 已下架" : ""}`}
                  </option>
                ))}
              </select>
            </label> : null}
            <span className="time">{lastUpdated ? `更新 ${lastUpdated}` : "等待同步"}</span>
            {active !== "home" ? <button className="log-toggle" onClick={() => setShowLogs((value) => !value)} title={showLogs ? "隐藏日志" : "显示日志"}>
              <TerminalSquare size={16} />
              日志
            </button> : <button className="log-toggle" onClick={() => navigate("observatory")}><Settings size={16} />运行设置</button>}
            <button className="icon-button" onClick={refresh} disabled={busy} title="刷新">
              {busy ? <LoaderCircle className="spin" size={18} /> : <RefreshCcw size={18} />}
            </button>
          </div>
        </header>

        {error ? <div className="error">{error}</div> : null}
        {missingHermes ? <MissingHermesNotice /> : null}

        {chatActivated ? <div className="agent-chat-mount" hidden={active !== "sessions"}>
          <AgentChatPanel snapshot={snapshot} setSnapshot={setSnapshot} visible={active === "sessions"} onOpenModels={() => {
            navigate("observatory");
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.getElementById("model-configuration-center")?.scrollIntoView({ behavior: "smooth", block: "start" })));
          }} handoff={chatHandoff} onHandoffConsumed={(id) => setChatHandoff((current) => current?.id === id ? null : current)} />
        </div> : null}

        {active === "home" ? (
          <PersonalAgentHome bridge={window.hermes} onCompose={composeFromHome} onOpenSession={openHomeSession} onNavigate={navigate} refreshKey={lastUpdated} unavailable={missingHermes} />
        ) : active === "observatory" ? (
          <Observatory
            snapshot={snapshot}
            metrics={metrics}
            updateInfo={updateInfo}
            updateBusy={updateBusy}
            updateMessage={updateMessage}
            onCheckUpdate={checkUpdate}
            onRunUpdate={runUpdate}
          />
        ) : active === "sessions" ? (
          null
        ) : active === "heartprint" ? (
          <HeartprintPanel />
        ) : active === "growth" ? (
          <GrowthPanel />
        ) : active === "health" ? (
          <Suspense fallback={<div className="knowledge-loading"><LoaderCircle className="spin" /> 正在加载健康档案</div>}>
            <HealthPage />
          </Suspense>
        ) : active === "knowledge" ? (
          <Suspense fallback={<div className="knowledge-loading"><LoaderCircle className="spin" /> 正在加载知识工作区</div>}>
            <KnowledgePage />
          </Suspense>
        ) : active === "gateway" ? (
          <GatewayPanel snapshot={snapshot} onAction={gateway} />
        ) : active === "cron" ? (
          <TaskCenter />
        ) : active === "tools" ? (
          <ToolsPanel snapshot={snapshot} />
        ) : (
          <SecurityPanel status={status} />
        )}
      </section>

      <aside className={showLogs ? "right-rail open no-drag" : "right-rail no-drag"} aria-hidden={!showLogs}>
        <div className="rail-head">
          <div>
            <p className="eyebrow">Live log</p>
            <h2>{logName}.log</h2>
          </div>
          <div className="rail-actions">
            <button className="icon-button" onClick={() => refreshLog()} title="刷新日志">
              <RefreshCcw size={16} />
            </button>
            <button className="icon-button" onClick={() => setShowLogs(false)} title="隐藏日志">
              <CircleStop size={16} />
            </button>
          </div>
        </div>
        <div className="segmented">
          {(["agent", "errors", "gateway"] as const).map((name) => (
            <button key={name} className={logName === name ? "selected" : ""} onClick={() => refreshLog(name)}>
              {name}
            </button>
          ))}
        </div>
        <pre className="log">{output(liveLog ?? snapshot?.logs, "日志为空")}</pre>
      </aside>
      </section>
    </main>
  );
}

type TaskCenterTab = "overview" | "schedule" | "board" | "dag" | "runs" | "approvals";

type PositionedHeartprintKeyword = HeartprintKeyword & { x: number; y: number; size: number };
type CloudHeartprintKeyword = HeartprintKeyword & { x?: number; y?: number; size: number };

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const heartprintCategoryLabels = { fact: "关于你", preference: "偏好", goal: "目标", boundary: "边界" } as const;
const heartprintAgentLabels: Record<string, string> = { note: "你的自述", parent: "父 Agent", "child-a": "子 Agent A", "child-b": "子 Agent B" };

function HeartprintWordCloud({ keywords, selected, onSelect }: { keywords: HeartprintKeyword[]; selected: string | null; onSelect: (keyword: HeartprintKeyword) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 920, height: 320 });
  const [words, setWords] = useState<PositionedHeartprintKeyword[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setSize({ width: Math.max(320, Math.floor(host.clientWidth)), height: Math.max(250, Math.floor(host.clientHeight)) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!keywords.length || size.width < 1) {
      setWords([]);
      return;
    }
    const scores = keywords.map((keyword) => Math.log1p(keyword.score));
    const low = Math.min(...scores);
    const high = Math.max(...scores);
    const maxFont = size.width < 620 ? 38 : 48;
    const cloudWords = keywords.map((keyword) => ({
      ...keyword,
      size: Math.round(16 + ((Math.log1p(keyword.score) - low) / Math.max(0.001, high - low)) * (maxFont - 16))
    }));
    let active = true;
    const layout = wordCloudLayout<CloudHeartprintKeyword>()
      .size([size.width - 22, size.height - 20])
      .words(cloudWords)
      .padding((word) => word.size > 34 ? 7 : 5)
      .rotate(0)
      .font("Source Sans 3")
      .fontWeight((word) => word.size > 34 ? 700 : 600)
      .fontSize((word) => word.size)
      .random(seededRandom(0x48e7 + size.width * 13))
      .on("end", (placed) => {
        if (!active) return;
        setWords(placed.filter((word) => typeof word.x === "number" && typeof word.y === "number").map((word) => ({ ...word, x: word.x!, y: word.y!, size: word.size })));
      });
    layout.start();
    return () => {
      active = false;
      layout.stop();
    };
  }, [keywords, size]);

  const colors = { fact: "#26231e", preference: "#426f52", goal: "#24573d", boundary: "#984d58" } as const;
  return <div className="heartprint-cloud-stage" ref={hostRef}>
    {keywords.length === 0 ? <div className="heartprint-cloud-empty"><Sparkles size={24} /><strong>还没有足够的近期词语</strong><span>完成几轮对话后，最能概括你的词会在这里出现。</span></div> : null}
    {keywords.length > 0 ? <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="根据最近心迹生成的关键词云">
      <g transform={`translate(${size.width / 2}, ${size.height / 2})`}>
        {words.map((word) => <g key={word.text} transform={`translate(${word.x}, ${word.y})`}>
          <text
            className={selected === word.text ? "heartprint-cloud-word selected" : "heartprint-cloud-word"}
            fill={colors[word.category]}
            fontSize={word.size}
            fontWeight={word.size > 34 ? 700 : 600}
            onClick={() => onSelect(word)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(word); }}
            role="button"
            tabIndex={0}
            textAnchor="middle"
          >
            <title>{`${word.text} · ${word.count} 次 · ${heartprintCategoryLabels[word.category]} · 最近 ${formatDateTime(word.lastSeen)}`}</title>
            {word.text}
          </text>
        </g>)}
      </g>
    </svg> : null}
  </div>;
}

function HeartprintPanel() {
  const [profile, setProfile] = useState<HeartprintProfile | null>(null);
  const [keywords, setKeywords] = useState<HeartprintKeyword[]>([]);
  const [range, setRange] = useState<HeartprintRange>("30d");
  const [selectedKeyword, setSelectedKeyword] = useState<HeartprintKeyword | null>(null);
  const [note, setNote] = useState("");
  const noteDirty = useRef(false);
  const [filter, setFilter] = useState<"all" | HeartprintProfile["items"][number]["category"]>("all");
  const [saving, setSaving] = useState(false);
  const [compacting, setCompacting] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const result = await window.hermes.heartprintGet(range);
      if (!active) return;
      setProfile(result.profile);
      setKeywords(result.keywords);
      setSelectedKeyword((current) => current ? result.keywords.find((keyword) => keyword.text === current.text) ?? null : null);
      if (!noteDirty.current) setNote(result.profile.note);
    };
    void refresh();
    const unsubscribe = window.hermes.onHeartprintUpdated(() => { void refresh(); });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [range]);

  const labels = heartprintCategoryLabels;
  const items = profile?.items.filter((item) => filter === "all" || item.category === filter) ?? [];
  return <section className="heartprint-page">
    <header className="heartprint-hero"><div><p className="eyebrow">Local personal understanding</p><h2>心迹</h2><p>汇集 Hermes 自动记忆与 Console 对话沉淀，按主题回看想法、目标和生活的变化。</p></div><div className="heartprint-revision"><span>Revision</span><strong>{profile?.revision ?? 0}</strong><small>{profile ? formatDateTime(profile.updatedAt) : "正在读取"}</small></div></header>
    <InsightsPanel mode="memory" />
    <HeartJournalPanel />
    <section className="heartprint-cloud-panel">
      <div className="section-toolbar"><div><p className="eyebrow">Live portrait</p><h3>此刻的你</h3><p>词语越大，说明它在近期表达中出现得越频繁、离现在越近。</p></div><div className="heartprint-range" aria-label="词云时间范围">{(["7d", "30d", "all"] as const).map((value) => <button key={value} className={range === value ? "active" : ""} onClick={() => setRange(value)}>{value === "7d" ? "近 7 天" : value === "30d" ? "近 30 天" : "全部"}</button>)}</div></div>
      <HeartprintWordCloud keywords={keywords} selected={selectedKeyword?.text ?? null} onSelect={setSelectedKeyword} />
      <div className="heartprint-cloud-legend">{(["goal", "preference", "fact", "boundary"] as const).map((category) => <span key={category} data-category={category}><i />{labels[category]}</span>)}</div>
      {selectedKeyword ? <div className="heartprint-keyword-detail"><header><div><span>{labels[selectedKeyword.category]}</span><strong>{selectedKeyword.text}</strong></div><small>{selectedKeyword.count} 次 · 最近 {formatDateTime(selectedKeyword.lastSeen)}</small><button title="关闭关键词详情" onClick={() => setSelectedKeyword(null)}><X size={15} /></button></header><div>{selectedKeyword.sources.map((source) => <article key={`${source.at}-${source.agentId}`}><time>{formatDateTime(source.at)}</time><strong>{heartprintAgentLabels[source.agentId] ?? source.agentId}</strong><p>{source.excerpt}</p></article>)}</div></div> : null}
    </section>
    <div className="heartprint-grid"><section className="heartprint-note"><div><h3>你的自述</h3><p>这部分权重最高，可随时修订。</p></div><textarea value={note} onChange={(event) => { noteDirty.current = true; setNote(event.target.value); }} placeholder="例如：我的长期目标、工作方式、偏好和明确边界。" /><button className="primary-command" disabled={saving} onClick={async () => { setSaving(true); const result = await window.hermes.heartprintSaveNote(note, range); noteDirty.current = false; setProfile(result.profile); setKeywords(result.keywords); setSaving(false); }}>{saving ? "保存中..." : "保存自述"}</button></section><section className="heartprint-stats">{(["preference", "goal", "fact", "boundary"] as const).map((category) => <button key={category} onClick={() => setFilter(category)} className={filter === category ? "active" : ""}><span>{labels[category]}</span><strong>{profile?.items.filter((item) => item.category === category).length ?? 0}</strong></button>)}</section></div>
    <section className="heartprint-library"><div className="section-toolbar"><div><h3>旧版记忆（保留）</h3><p>保留升级前的记忆及状态。新记忆在上方核对依据并确认；这里的历史评分不代表新增证据。</p></div><div className="heartprint-actions"><button onClick={() => setFilter("all")}>全部</button><button disabled={compacting} onClick={async () => { setCompacting(true); try { const result = await window.hermes.heartprintCompact(range); setProfile(result.profile); setKeywords(result.keywords); } finally { setCompacting(false); } }}><Sparkles size={14} />{compacting ? "整理中" : "整理记忆"}</button><button onClick={async () => { if (!window.confirm("清空工作了解库和近期对话证据？长期心迹档案及 Hermes 原生记忆仍会保留。")) return; const result = await window.hermes.heartprintClear(range); noteDirty.current = false; setProfile(result.profile); setKeywords(result.keywords); setSelectedKeyword(null); setNote(""); }}>清空</button></div></div><div className="heartprint-items">{items.map((item) => <article key={item.id}><header><span>{labels[item.category]}</span><em title={`记忆置信度 ${Math.round(item.confidence * 100)}%`}>{Math.round(item.confidence * 100)}%</em></header><p>{item.text}</p><footer><small>{heartprintAgentLabels[item.sourceAgent] ?? item.sourceAgent} · {formatDateTime(item.updatedAt)}</small><small>{item.evidenceCount} 次印证</small></footer><button title="删除这条心迹" onClick={async () => { const result = await window.hermes.heartprintRemove(item.id, range); setProfile(result.profile); setKeywords(result.keywords); }}><X size={14} /></button></article>)}</div>{items.length === 0 ? <div className="task-empty"><Sparkles size={26} /><strong>还没有稳定记忆</strong><p>明确表达长期目标、偏好或边界后，精炼结果会出现在这里。</p></div> : null}</section>
    <section className="heartprint-chronicle"><div className="section-toolbar"><div><h3>对话证据</h3><p>保留最近 80 轮原始来源供核对；它们不会被整段注入下一轮对话。</p></div></div>{profile?.reflections.slice(0, 8).map((entry) => <article key={entry.id}><time>{formatDateTime(entry.at)}</time><strong>{entry.user}</strong><p>{entry.assistant || "本轮未保存 Agent 摘要"}</p></article>)}</section>
  </section>;
}

const growthCategoryLabels: Record<GrowthCapability["category"], string> = {
  thinking: "认知",
  expression: "表达",
  execution: "行动",
  wellbeing: "身心",
  custom: "自定义"
};

function GrowthPanel() {
  const [profile, setProfile] = useState<GrowthProfile | null>(null);
  const [summary, setSummary] = useState<GrowthResult["summary"] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [coachPrompt, setCoachPrompt] = useState("");
  const [writing, setWriting] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [discipline, setDiscipline] = useState<DisciplineResult | null>(null);
  const [editingGoal, setEditingGoal] = useState<DisciplineGoal | null>(null);

  function applyResult(result: GrowthResult) {
    setProfile(result.profile);
    setSummary(result.summary);
    setSelectedId((current) => current || result.profile.capabilities.find((item) => item.enabled)?.id || result.profile.capabilities[0]?.id || "");
  }

  async function refresh() {
    applyResult(await window.hermes.growthGet());
  }

  async function refreshDiscipline() {
    setDiscipline(await window.hermes.disciplineGet());
  }

  useEffect(() => {
    void refresh();
    const unsubscribe = window.hermes.onGrowthUpdated(() => { void refresh(); });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void refreshDiscipline();
    const unsubscribe = window.hermes.onDisciplineUpdated(() => { void refreshDiscipline(); });
    return unsubscribe;
  }, []);

  const selected = profile?.capabilities.find((item) => item.id === selectedId) ?? profile?.capabilities[0];
  const selectedEvidence = profile?.evidence.filter((item) => !selected || item.capabilityId === selected.id).slice(0, 8) ?? [];
  const recentDays = new Set((profile?.evidence ?? []).filter((item) => Date.now() - new Date(item.at).getTime() < 7 * 86_400_000).map((item) => item.at.slice(0, 10))).size;

  return <section className="growth-page">
    <header className="growth-hero">
      <div><p className="eyebrow">Personal growth system</p><h2>成长星图</h2><p>把日常表达、学习和行动沉淀成可追溯的成长证据。指数代表近期实践，不是对你的定论。</p></div>
      <div className="growth-level"><span>整体观察</span><strong>{summary?.average ?? 0}</strong><small>Revision {profile?.revision ?? 0}</small></div>
    </header>

    <div className="growth-metrics">
      <article><span>正在培养</span><strong>{summary?.enabled ?? 0}</strong><small>项底层能力</small></article>
      <article><span>自动感知</span><strong>{summary?.observations ?? 0}</strong><small>条全 Agent 输入</small></article>
      <article><span>近 7 天节奏</span><strong>{recentDays}</strong><small>天产生有效输入</small></article>
      <article><span>最近同步</span><strong>{profile ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(profile.updatedAt)) : "--"}</strong><small>{profile ? formatDateTime(profile.updatedAt).split(" ").at(-1) : "正在读取"}</small></article>
    </div>

    <section className="discipline-panel">
      <div className="section-toolbar">
        <div><p className="eyebrow">Long game</p><h3>长期主义</h3><p>每天只确认一次今天的选择。连续记录可以重来，已经积累的努力不会清零。</p></div>
        <div className="discipline-total"><Trophy size={18} /><span>总经验</span><strong>{discipline?.totalXp ?? 0} XP</strong></div>
      </div>
      <div className="discipline-grid">
        {discipline?.goals.map((goal) => <article className={goal.active ? "discipline-goal" : "discipline-goal inactive"} key={goal.id}>
          <header>
            <div><span>{goal.mode === "avoid" ? "守住边界" : "养成习惯"} · Lv.{goal.stats.level}</span><h4>{goal.title}</h4></div>
            <button className="discipline-edit" onClick={() => setEditingGoal(goal)} title={`编辑${goal.title}`}><Pencil size={14} /></button>
          </header>
          <p>{goal.reason || "为长期改变留下一次清晰选择。"}</p>
          <div className="discipline-streak">
            <Flame size={20} />
            <strong>{goal.stats.currentStreak}</strong><span>天连续</span>
            <small>最长 {goal.stats.longestStreak} · 累计 {goal.stats.totalSuccess}</small>
          </div>
          <div className="discipline-week" aria-label={`${goal.title}最近七天记录`}>
            {goal.stats.recent.map((day) => <span key={day.date} className={day.success ? "success" : day.status ? "miss" : ""} title={`${day.date}${day.status ? ` · ${disciplineStatusLabel(day.status)}` : " · 未记录"}`}><i />{weekdayLabel(day.date)}</span>)}
          </div>
          <div className="discipline-minimum"><span>最低行动</span><strong>{goal.minimumAction || "完成一次最小行动"}</strong></div>
          <footer>
            <button className="discipline-primary" disabled={!goal.active || busy} onClick={async () => {
              setBusy(true);
              try { setDiscipline(await window.hermes.disciplineCheckIn(goal.id, goal.mode === "avoid" ? "kept" : "done")); }
              finally { setBusy(false); }
            }}>{goal.stats.todayStatus && (goal.stats.todayStatus === "kept" || goal.stats.todayStatus === "done") ? <Check size={15} /> : <Flame size={15} />}{goal.stats.todayStatus && (goal.stats.todayStatus === "kept" || goal.stats.todayStatus === "done") ? "今日已记录" : goal.mode === "avoid" ? "今日守住" : "完成打卡"}</button>
            <button disabled={!goal.active || busy} onClick={async () => {
              setBusy(true);
              try { setDiscipline(await window.hermes.disciplineCheckIn(goal.id, goal.mode === "avoid" ? "slipped" : "skipped")); }
              finally { setBusy(false); }
            }}>{goal.mode === "avoid" ? "记录偏离" : "今天跳过"}</button>
          </footer>
        </article>)}
      </div>
    </section>

    <div className="growth-workbench">
      <section className="growth-map-panel">
        <div className="section-toolbar"><div><p className="eyebrow">Capability map</p><h3>底层能力</h3><p>点击六边形查看它的练习路径；关闭的能力不会参与自动分析。</p></div></div>
        <div className="growth-hex-grid">
          {profile?.capabilities.map((capability) => <button
            key={capability.id}
            className={`growth-hex ${selected?.id === capability.id ? "selected" : ""} ${capability.enabled ? "" : "disabled"}`}
            onClick={() => setSelectedId(capability.id)}
            style={{ "--growth": `${Math.round(capability.progress)}%` } as CSSProperties}
          >
            <span className="growth-hex-shape"><small>{growthCategoryLabels[capability.category]}</small><strong>{capability.title}</strong><em>Lv.{capability.level}</em></span>
            <span className="growth-hex-meter"><i /></span>
            <b>{Math.round(capability.progress)}%</b>
          </button>)}
        </div>
      </section>

      <aside className="growth-coach-panel">
        <div><p className="eyebrow">Hermes growth coach</p><h3>和 AI 设定能力</h3><p>用一句话描述你想成为怎样的人，Hermes 会启用最接近的能力，或建立一条新路径。</p></div>
        <textarea value={coachPrompt} onChange={(event) => setCoachPrompt(event.target.value)} placeholder="例如：我想提升公开表达能力，能把复杂观点讲得清楚、有说服力。" />
        <button className="primary-command" disabled={busy || !coachPrompt.trim()} onClick={async () => {
          setBusy(true); setMessage("");
          try { const result = await window.hermes.growthCreate(coachPrompt); applyResult(result); setSelectedId(result.capability?.id || selectedId); setCoachPrompt(""); setMessage(result.reason || "能力路径已更新。"); }
          finally { setBusy(false); }
        }}><Sparkles size={16} />{busy ? "正在整理..." : "建立成长路径"}</button>
        {message ? <p className="growth-coach-message">{message}</p> : null}
        <div className="growth-switches">
          {profile?.capabilities.map((capability) => <button key={capability.id} role="switch" aria-checked={capability.enabled} onClick={async () => applyResult(await window.hermes.growthToggle(capability.id, !capability.enabled))}>
            <span><strong>{capability.title}</strong><small>{capability.enabled ? "参与实时观察" : "暂不观察"}</small></span><i className={capability.enabled ? "on" : ""}><b /></i>
          </button>)}
        </div>
      </aside>
    </div>

    {selected ? <section className="growth-detail">
      <header><div><p className="eyebrow">Selected capability</p><h3>{selected.title}</h3><p>{selected.description}</p></div><span>{Math.round(selected.progress)}%</span></header>
      <div className="growth-skill-path">
        {selected.nodes.map((node, index) => <div key={node.id} className={node.progress > 0 ? "active" : ""}><span>{index + 1}</span><strong>{node.title}</strong><small>{Math.round(node.progress)}%</small></div>)}
      </div>
    </section> : null}

    <div className="growth-lower-grid">
      <section className="growth-writing">
        <div className="section-toolbar"><div><p className="eyebrow">Optional import</p><h3>补充外部文字</h3><p>Console 会自动感知三个 Agent 的全部对话。这里只用于补充你在其他软件里写的文章或笔记。</p></div><BookOpen size={20} /></div>
        <textarea value={writing} onChange={(event) => setWriting(event.target.value)} placeholder="把今天写下的内容放在这里..." />
        <button disabled={busy || !writing.trim()} onClick={async () => {
          setBusy(true); setMessage("");
          try { const result = await window.hermes.growthAnalyze(writing); applyResult(result); setWriting(""); setMessage(result.added?.length ? `已生成 ${result.added.length} 条成长证据。` : "这段内容暂未匹配到已启用的能力，你可以先创建对应能力。" ); }
          finally { setBusy(false); }
        }}><BrainCircuit size={16} />分析并同步</button>
      </section>
      <section className="growth-evidence">
        <div className="section-toolbar"><div><p className="eyebrow">Evidence trail</p><h3>{selected ? `${selected.title}的近期证据` : "近期证据"}</h3><p>每一次增长都能回到原始表达。</p></div></div>
        <div>{selectedEvidence.map((evidence) => <article key={evidence.id}><header><span>{evidence.source === "conversation" ? "对话" : evidence.source === "writing" ? "写作" : "手动"}</span><time>{formatDateTime(evidence.at)}</time><strong>+{evidence.score}</strong></header><p>{evidence.excerpt}</p><small>{evidence.reason}</small></article>)}</div>
        {selectedEvidence.length === 0 ? <div className="task-empty compact"><Target size={24} /><strong>还没有成长证据</strong><p>完成一轮相关对话，或分析一篇今天的文字。</p></div> : null}
      </section>
    </div>
    {editingGoal ? <DisciplineGoalModal goal={editingGoal} onClose={() => setEditingGoal(null)} onSave={async (input) => {
      setBusy(true);
      try {
        const result = await window.hermes.disciplineUpdate(editingGoal.id, input);
        setDiscipline(result);
        setEditingGoal(null);
      } finally { setBusy(false); }
    }} /> : null}
  </section>;
}

function weekdayLabel(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return ["日", "一", "二", "三", "四", "五", "六"][value.getDay()];
}

function disciplineStatusLabel(status: DisciplineStatus) {
  return { kept: "已守住", slipped: "有偏离", done: "已完成", skipped: "已跳过" }[status];
}

function DisciplineGoalModal({ goal, onClose, onSave }: { goal: DisciplineGoal; onClose: () => void; onSave: (input: { title: string; mode: DisciplineMode; reason: string; minimumAction: string; active: boolean }) => Promise<void> }) {
  const [draft, setDraft] = useState({ title: goal.title, mode: goal.mode, reason: goal.reason, minimumAction: goal.minimumAction, active: goal.active });
  const [saving, setSaving] = useState(false);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <form className="task-modal discipline-modal" onSubmit={async (event) => { event.preventDefault(); setSaving(true); try { await onSave(draft); } finally { setSaving(false); } }}>
      <header><div><p className="eyebrow">Long-term goal</p><h3>编辑长期目标</h3></div><button type="button" onClick={onClose} title="关闭"><X size={17} /></button></header>
      <label>目标名称<input value={draft.title} maxLength={20} required onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>坚持方式<select value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value as DisciplineMode })}><option value="build">坚持做到</option><option value="avoid">坚持不做</option></select></label>
      <label>为什么值得坚持<textarea rows={3} maxLength={180} value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} /></label>
      <label>最低行动<textarea rows={2} maxLength={120} value={draft.minimumAction} onChange={(event) => setDraft({ ...draft, minimumAction: event.target.value })} /></label>
      <label className="discipline-active"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>在成长页显示并允许打卡</span></label>
      <footer><button type="button" onClick={onClose}>取消</button><button className="primary-command" disabled={saving || !draft.title.trim()}>{saving ? "保存中..." : "保存目标"}</button></footer>
    </form>
  </div>;
}

const taskCenterTabs: Array<{ id: TaskCenterTab; label: string; icon: typeof Gauge }> = [
  { id: "overview", label: "总览", icon: LayoutDashboard },
  { id: "schedule", label: "定时作业", icon: CalendarDays },
  { id: "board", label: "任务板", icon: Columns3 },
  { id: "dag", label: "DAG", icon: GitBranch },
  { id: "runs", label: "运行记录", icon: Activity },
  { id: "approvals", label: "审批", icon: ShieldAlert }
];

const agentProfiles = [
  { id: "consoleparent", label: "父 Agent", model: "GPT-5.4" },
  { id: "consolechilda", label: "子 Agent A", model: "GPT-5.4 Mini" },
  { id: "consolechildb", label: "子 Agent B", model: "GPT-5.4 Mini" }
];

function TaskCenter() {
  const [tab, setTab] = useState<TaskCenterTab>("overview");
  const [jobs, setJobs] = useState<SchedulerJob[]>([]);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [boards, setBoards] = useState<Array<{ slug: string; name: string; is_current?: boolean }>>([]);
  const [board, setBoard] = useState("default");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showJobForm, setShowJobForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingJob, setEditingJob] = useState<SchedulerJob | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [runs, setRuns] = useState<unknown[]>([]);
  const [automationPaused, setAutomationPaused] = useState(false);

  async function refresh(silent = false) {
    if (!silent) setBusy(true);
    try {
      const [jobResult, boardResult, taskResult] = await Promise.all([
        window.hermes.schedulerList(),
        window.hermes.kanbanBoards(),
        window.hermes.kanbanList(board)
      ]);
      if (jobResult.ok) setJobs(jobResult.jobs);
      if (boardResult.ok) setBoards(boardResult.data);
      if (taskResult.ok) setTasks(taskResult.data);
      const reason = jobResult.reason || boardResult.reason || taskResult.reason;
      if (reason) setMessage(reason);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (!silent) setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 5000);
    return () => window.clearInterval(timer);
  }, [board]);

  async function actOnJob(action: "pause" | "resume" | "run" | "remove", job: SchedulerJob) {
    if (action === "remove" && !window.confirm(`确定删除“${job.name || job.id}”吗？`)) return;
    setBusy(true);
    const result = await ({
      pause: window.hermes.schedulerPause,
      resume: window.hermes.schedulerResume,
      run: window.hermes.schedulerRun,
      remove: window.hermes.schedulerRemove
    }[action])(job.id);
    setMessage(result.ok ? action === "run" ? "任务已交给 Hermes，正在运行。" : "定时作业已更新。" : result.output || result.reason || "操作失败。");
    await refresh(true);
    setBusy(false);
  }

  async function cancelTask(task: KanbanTask) {
    if (!window.confirm(`停止“${task.title}”？当前 worker 会被终止，而且不会自动续跑。`)) return;
    setBusy(true);
    const result = await window.hermes.kanbanCancel(board, task.id);
    setMessage(result.ok ? "任务已取消并阻止自动续跑。" : result.output || "取消失败。");
    await refresh(true);
    setBusy(false);
  }

  async function retryTask(task: KanbanTask) {
    setBusy(true);
    const result = await window.hermes.kanbanRetry(board, task.id);
    setMessage(result.ok ? "任务已返回 Ready，Gateway 将重新派发。" : result.output || "重试失败。");
    await refresh(true);
    setBusy(false);
  }

  async function openRuns(task: KanbanTask) {
    setSelectedTaskId(task.id);
    setTab("runs");
    const result = await window.hermes.kanbanRuns(board, task.id);
    setRuns(result.ok ? result.data : []);
    if (!result.ok) setMessage(result.reason || "无法读取运行记录。");
  }

  const statusCount = (status: string) => tasks.filter((task) => task.status === status).length;
  const blockedTasks = tasks.filter((task) => task.status === "blocked");
  const runningTasks = tasks.filter((task) => task.status === "running");
  const nextJob = jobs.find((job) => job.enabled && job.next_run_at);

  return (
    <section className="task-center">
      <header className="task-center-head">
        <div>
          <p className="eyebrow">Hermes native runtime</p>
          <h2>任务中心</h2>
          <span>定时作业、并行 Agent 与 Loop Engine 共用 Hermes 状态</span>
        </div>
        <div className="task-head-actions">
          <label className="compact-select">
            <span>Board</span>
            <select value={board} onChange={(event) => setBoard(event.target.value)}>
              {boards.length === 0 ? <option value="default">Default</option> : boards.map((item) => <option key={item.slug} value={item.slug}>{item.name || item.slug}</option>)}
            </select>
          </label>
          <button
            className={automationPaused ? "automation-button paused" : "automation-button"}
            onClick={async () => {
              setBusy(true);
              const result = automationPaused ? await window.hermes.automationResume() : await window.hermes.automationPause();
              setAutomationPaused(!automationPaused && result.ok);
              setMessage(result.ok ? automationPaused ? "自动化已恢复。" : "自动化已暂停，运行中的任务不受影响。" : "自动化状态切换失败。");
              await refresh(true);
              setBusy(false);
            }}
          >
            {automationPaused ? <Play size={16} /> : <Pause size={16} />}
            {automationPaused ? "恢复自动化" : "暂停自动化"}
          </button>
          <button className="icon-button" onClick={() => void refresh()} disabled={busy} title="刷新任务中心">
            {busy ? <LoaderCircle className="spin" size={17} /> : <RefreshCcw size={17} />}
          </button>
        </div>
      </header>

      <nav className="task-tabs" aria-label="任务中心视图">
        {taskCenterTabs.map((item) => {
          const Icon = item.icon;
          const badge = item.id === "approvals" ? blockedTasks.length : item.id === "schedule" ? jobs.length : 0;
          return <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><Icon size={15} />{item.label}{badge ? <b>{badge}</b> : null}</button>;
        })}
      </nav>

      {message ? <div className="task-feedback"><span>{message}</span><button onClick={() => setMessage("")} title="关闭"><X size={14} /></button></div> : null}

      {tab === "overview" ? (
        <div className="task-overview">
          <div className="task-metrics">
            <MetricTile label="运行中" value={String(runningTasks.length)} hint="并行上限 3" tone="green" />
            <MetricTile label="待执行" value={String(statusCount("ready") + statusCount("todo"))} hint="等待 Gateway 派发" tone="blue" />
            <MetricTile label="待审批" value={String(blockedTasks.length)} hint="失败或风险动作" tone="rose" />
            <MetricTile label="定时作业" value={String(jobs.filter((job) => job.enabled).length)} hint={nextJob ? `下一次 ${formatDateTime(nextJob.next_run_at)}` : "暂无计划"} tone="amber" />
          </div>
          <section className="runtime-band">
            <div><p className="eyebrow">Loop Engine</p><h3>受监督自治</h3><p>Plan → Do → Check → Act。默认 20 轮、30 分钟、2 次连续失败后转人工审批。</p></div>
            <div className="profile-lanes">{agentProfiles.map((profile) => { const task = tasks.find((item) => item.assignee === profile.id && item.status === "running"); return <article key={profile.id}><span className={task ? "profile-signal live" : "profile-signal"} /><strong>{profile.label}</strong><small>{profile.model}</small><em>{task?.title || "空闲"}</em></article>; })}</div>
          </section>
          <section className="next-actions">
            <div><h3>最近任务</h3><button onClick={() => setTab("board")}>查看任务板</button></div>
            {tasks.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} onRuns={openRuns} onCancel={cancelTask} onRetry={retryTask} />)}
            {tasks.length === 0 ? <EmptyState title="还没有 Loop 任务" detail="创建任务后，Hermes Gateway 会按 Agent 和依赖关系自动派发。" action="创建任务" onAction={() => setShowTaskForm(true)} /> : null}
          </section>
        </div>
      ) : null}

      {tab === "schedule" ? (
        <div className="schedule-view">
          <div className="section-toolbar"><div><h3>定时作业</h3><p>数据直接来自 ~/.hermes/cron/jobs.json，操作通过 Hermes CLI 生效。</p></div><button className="primary-command" onClick={() => { setEditingJob(null); setShowJobForm(true); }}><Plus size={16} />新建作业</button></div>
          <div className="job-list">{jobs.map((job) => <article className="job-row" key={job.id}><span className={job.enabled ? "job-state active" : "job-state"} /><div className="job-main"><strong>{job.name || "未命名作业"}</strong><p>{job.prompt || "无任务说明"}</p><small>{job.schedule_display || "未知周期"} · {job.deliver || "origin"}</small></div><div className="job-time"><span>下次</span><strong>{formatDateTime(job.next_run_at)}</strong><small>上次 {job.last_status || "未运行"} · {formatDateTime(job.last_run_at)}</small></div><div className="row-actions"><button onClick={() => void actOnJob("run", job)} title="立即运行"><Play size={15} /></button><button onClick={() => void actOnJob(job.enabled ? "pause" : "resume", job)} title={job.enabled ? "暂停" : "恢复"}>{job.enabled ? <Pause size={15} /> : <Play size={15} />}</button><button onClick={() => { setEditingJob(job); setShowJobForm(true); }} title="编辑"><Pencil size={15} /></button><button onClick={() => void actOnJob("remove", job)} title="删除"><Ban size={15} /></button></div></article>)}</div>
          {jobs.length === 0 ? <EmptyState title="暂无定时作业" detail="创建后由 Hermes Gateway 在后台执行，关闭 Console 也不会失效。" action="新建作业" onAction={() => setShowJobForm(true)} /> : null}
        </div>
      ) : null}

      {tab === "board" ? <BoardView tasks={tasks} onCreate={() => setShowTaskForm(true)} onRuns={openRuns} onCancel={cancelTask} onRetry={retryTask} /> : null}
      {tab === "dag" ? <DagView tasks={tasks} onSelect={(task) => void openRuns(task)} /> : null}
      {tab === "runs" ? <RunsView tasks={tasks} runs={runs} selectedTaskId={selectedTaskId} onSelect={openRuns} /> : null}
      {tab === "approvals" ? <ApprovalView tasks={blockedTasks} onApprove={retryTask} onReject={cancelTask} /> : null}

      {showJobForm ? <JobForm job={editingJob} onClose={() => setShowJobForm(false)} onSaved={async (text) => { setShowJobForm(false); setMessage(text); await refresh(true); }} /> : null}
      {showTaskForm ? <TaskForm board={board} tasks={tasks} onClose={() => setShowTaskForm(false)} onSaved={async (text) => { setShowTaskForm(false); setMessage(text); await refresh(true); }} /> : null}
    </section>
  );
}

function MetricTile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
  return <article className={`task-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>;
}

function TaskRow({ task, onRuns, onCancel, onRetry }: { task: KanbanTask; onRuns: (task: KanbanTask) => void; onCancel: (task: KanbanTask) => void; onRetry: (task: KanbanTask) => void }) {
  return <article className="task-row"><span className={`task-status ${task.status || "todo"}`} /> <div><strong>{task.title}</strong><small>{task.assignee || "未分配"} · {task.id}</small></div><em>{statusLabel(task.status)}</em><div className="row-actions"><button onClick={() => void onRuns(task)} title="运行记录"><Activity size={14} /></button>{task.status === "blocked" ? <button onClick={() => void onRetry(task)} title="重新执行"><RefreshCcw size={14} /></button> : null}{task.status === "running" || task.status === "ready" ? <button onClick={() => void onCancel(task)} title="停止"><CircleStop size={14} /></button> : null}</div></article>;
}

function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action: string; onAction: () => void }) {
  return <div className="task-empty"><GitBranch size={25} /><strong>{title}</strong><p>{detail}</p><button onClick={onAction}><Plus size={15} />{action}</button></div>;
}

function BoardView({ tasks, onCreate, onRuns, onCancel, onRetry }: { tasks: KanbanTask[]; onCreate: () => void; onRuns: (task: KanbanTask) => void; onCancel: (task: KanbanTask) => void; onRetry: (task: KanbanTask) => void }) {
  const columns = [{ id: "inbox", label: "Inbox", statuses: ["triage", "todo"] }, { id: "ready", label: "Ready", statuses: ["ready", "scheduled"] }, { id: "running", label: "Running", statuses: ["running"] }, { id: "review", label: "Review", statuses: ["review"] }, { id: "blocked", label: "Blocked", statuses: ["blocked"] }, { id: "done", label: "Done", statuses: ["done"] }];
  return <div className="board-view"><div className="section-toolbar"><div><h3>Agent 任务板</h3><p>Ready 节点由 Gateway 自动并行派发。</p></div><button className="primary-command" onClick={onCreate}><Plus size={16} />新建 Loop 任务</button></div><div className="kanban-columns">{columns.map((column) => { const items = tasks.filter((task) => column.statuses.includes(task.status || "todo")); return <section className="kanban-column" key={column.id}><header><strong>{column.label}</strong><span>{items.length}</span></header><div>{items.map((task) => <article className="kanban-task" key={task.id} onDoubleClick={() => void onRuns(task)}><span className={`task-status ${task.status}`} /><strong>{task.title}</strong><p>{task.body || task.summary || "暂无说明"}</p><small>{task.assignee || "未分配"}</small><div className="row-actions"><button onClick={() => void onRuns(task)} title="详情"><Activity size={13} /></button>{task.status === "blocked" ? <button onClick={() => void onRetry(task)} title="批准重试"><Play size={13} /></button> : null}{["running", "ready", "scheduled"].includes(task.status || "") ? <button onClick={() => void onCancel(task)} title="停止"><CircleStop size={13} /></button> : null}</div></article>)}</div></section>; })}</div></div>;
}

function DagView({ tasks, onSelect }: { tasks: KanbanTask[]; onSelect: (task: KanbanTask) => void }) {
  const levels = new Map<string, number>();
  const parentsFor = (task: KanbanTask) => (task.parent_ids || task.parents || []).map((item) => typeof item === "string" ? item : item.id || "").filter(Boolean);
  function level(task: KanbanTask, trail = new Set<string>()): number { if (levels.has(task.id)) return levels.get(task.id)!; if (trail.has(task.id)) return 0; trail.add(task.id); const parents = parentsFor(task); const value = parents.length ? 1 + Math.max(...parents.map((id) => { const parent = tasks.find((item) => item.id === id); return parent ? level(parent, trail) : 0; })) : 0; levels.set(task.id, value); return value; }
  const grouped = tasks.reduce<Record<number, KanbanTask[]>>((acc, task) => { const depth = level(task); (acc[depth] ||= []).push(task); return acc; }, {});
  return <div className="dag-view"><div className="section-toolbar"><div><h3>任务依赖图</h3><p>从左到右依次执行；同一列没有依赖的节点可以并行。</p></div><div className="dag-legend"><span><i className="task-status running" />运行</span><span><i className="task-status blocked" />阻塞</span><span><i className="task-status done" />完成</span></div></div>{tasks.length ? <div className="dag-canvas">{Object.keys(grouped).sort((a,b) => Number(a)-Number(b)).map((depth) => <section className="dag-level" key={depth}><small>阶段 {Number(depth)+1}</small>{grouped[Number(depth)].map((task) => <button className={`dag-node ${task.status || "todo"}`} key={task.id} onClick={() => onSelect(task)}><span className={`task-status ${task.status}`} /><strong>{task.title}</strong><em>{task.assignee || "未分配"}</em><small>{parentsFor(task).length ? `依赖 ${parentsFor(task).join(", ")}` : "起点"}</small></button>)}</section>)}</div> : <EmptyState title="没有可展示的任务图" detail="先创建任务，再为子任务添加父任务依赖。" action="前往任务板" onAction={() => {}} />}</div>;
}

function RunsView({ tasks, runs, selectedTaskId, onSelect }: { tasks: KanbanTask[]; runs: unknown[]; selectedTaskId: string; onSelect: (task: KanbanTask) => void }) {
  return <div className="runs-view"><aside>{tasks.map((task) => <button className={task.id === selectedTaskId ? "active" : ""} key={task.id} onClick={() => void onSelect(task)}><strong>{task.title}</strong><small>{statusLabel(task.status)} · {task.assignee || "未分配"}</small></button>)}</aside><section><div className="section-toolbar"><div><h3>运行记录</h3><p>{selectedTaskId || "选择左侧任务查看每次尝试"}</p></div></div>{runs.length ? <div className="run-timeline">{runs.map((run, index) => <article key={index}><span>{index + 1}</span><pre>{JSON.stringify(run, null, 2)}</pre></article>)}</div> : <div className="task-empty compact"><Activity size={22} /><strong>暂无运行记录</strong><p>任务开始执行后，每次尝试都会出现在这里。</p></div>}</section></div>;
}

function ApprovalView({ tasks, onApprove, onReject }: { tasks: KanbanTask[]; onApprove: (task: KanbanTask) => void; onReject: (task: KanbanTask) => void }) {
  return <div className="approval-view"><div className="section-toolbar"><div><h3>审批中心</h3><p>连续失败、外部发送、删除、付费调用和未知脚本在这里等待确认。</p></div></div>{tasks.map((task) => <article className="approval-row" key={task.id}><ShieldAlert size={20} /><div><strong>{task.title}</strong><p>{task.body || "任务已被 Loop Engine 阻塞，需要人工决定。"}</p><small>{task.assignee || "未分配"} · 失败 {task.failure_count || 0} 次</small></div><div><button className="approve" onClick={() => void onApprove(task)}><Play size={15} />批准重试</button><button onClick={() => void onReject(task)}><Ban size={15} />终止</button></div></article>)}{tasks.length === 0 ? <div className="task-empty"><ShieldCheck size={26} /><strong>没有待审批事项</strong><p>自动化正在受监督运行。</p></div> : null}</div>;
}

function JobForm({ job, onClose, onSaved }: { job: SchedulerJob | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState(job?.name || ""); const [schedule, setSchedule] = useState(job?.schedule_display || "every 2h"); const [prompt, setPrompt] = useState(job?.prompt || ""); const [deliver, setDeliver] = useState(job?.deliver || "origin"); const [workdir, setWorkdir] = useState(""); const [saving, setSaving] = useState(false);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="task-modal" onSubmit={async (event) => { event.preventDefault(); setSaving(true); const input = { name, schedule, prompt, deliver, workdir }; const result = job ? await window.hermes.schedulerUpdate(job.id, input) : await window.hermes.schedulerCreate(input); setSaving(false); if (result.ok) onSaved(job ? "定时作业已更新。" : "定时作业已创建并交给 Hermes Gateway。"); }}><header><div><p className="eyebrow">Scheduler</p><h3>{job ? "编辑定时作业" : "新建定时作业"}</h3></div><button type="button" onClick={onClose} title="关闭"><X size={17} /></button></header><label>名称<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></label><div className="form-pair"><label>执行周期<input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="every 2h 或 0 9 * * *" required /></label><label>投递<select value={deliver} onChange={(e) => setDeliver(e.target.value)}><option value="origin">Origin</option><option value="local">Local</option><option value="telegram">Telegram</option><option value="discord">Discord</option></select></label></div><label>任务说明<textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} required rows={7} /></label><label>工作目录（可选）<input value={workdir} onChange={(e) => setWorkdir(e.target.value)} placeholder="/Users/.../project" /></label><footer><button type="button" onClick={onClose}>取消</button><button className="primary-command" disabled={saving}>{saving ? "正在保存..." : "保存作业"}</button></footer></form></div>;
}

function TaskForm({ board, tasks, onClose, onSaved }: { board: string; tasks: KanbanTask[]; onClose: () => void; onSaved: (message: string) => void }) {
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [assignees, setAssignees] = useState<string[]>(["consoleparent"]); const [parent, setParent] = useState(""); const [goal, setGoal] = useState(true); const [maxTurns, setMaxTurns] = useState(20); const [runtime, setRuntime] = useState("30m"); const [retries, setRetries] = useState(2); const [saving, setSaving] = useState(false);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="task-modal" onSubmit={async (event) => { event.preventDefault(); if (!assignees.length) return; setSaving(true); const results = await Promise.all(assignees.map((assignee) => window.hermes.kanbanCreate({ board, title: assignees.length > 1 ? `${title} · ${agentProfiles.find((item) => item.id === assignee)?.label}` : title, body, assignee, parents: parent ? [parent] : [], goal, goalMaxTurns: maxTurns, maxRuntime: runtime, maxRetries: retries, workspace: "scratch" }))); setSaving(false); if (results.every((result) => result.ok)) onSaved(`已向 ${assignees.length} 个 Agent 并行派发 Loop 任务。`); }}><header><div><p className="eyebrow">Loop Engine</p><h3>新建受监督任务</h3></div><button type="button" onClick={onClose}><X size={17} /></button></header><label>任务标题<input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} /></label><label>目标与验收标准<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder="说明完成标准、必须交付的证据以及禁止执行的动作。" /></label><div className="agent-picker"><span>执行 Agent（可多选并行）</span>{agentProfiles.map((profile) => <label key={profile.id}><input type="checkbox" checked={assignees.includes(profile.id)} onChange={(event) => setAssignees((current) => event.target.checked ? [...current, profile.id] : current.filter((id) => id !== profile.id))} /><strong>{profile.label}</strong><small>{profile.model}</small></label>)}</div><label>依赖任务<select value={parent} onChange={(e) => setParent(e.target.value)}><option value="">无依赖</option>{tasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label><div className="loop-policy"><label><input type="checkbox" checked={goal} onChange={(e) => setGoal(e.target.checked)} />启用 PDCA 目标循环</label><label>最多轮数<input type="number" min="1" max="100" value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} /></label><label>运行上限<input value={runtime} onChange={(e) => setRuntime(e.target.value)} /></label><label>失败熔断<input type="number" min="1" max="20" value={retries} onChange={(e) => setRetries(Number(e.target.value))} /></label></div><footer><button type="button" onClick={onClose}>取消</button><button className="primary-command" disabled={saving || assignees.length === 0}>{saving ? "正在创建..." : `创建并派发 (${assignees.length})`}</button></footer></form></div>;
}

function statusLabel(status?: string) { const labels: Record<string, string> = { triage: "收件箱", todo: "待规划", ready: "就绪", scheduled: "等待时间", running: "运行中", review: "审核", blocked: "待审批", done: "完成", archived: "归档" }; return labels[status || ""] || status || "未知"; }
function formatDateTime(value?: string | null) { if (!value) return "--"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date); }

function AgentChatPanel({ snapshot, setSnapshot, visible, handoff, onHandoffConsumed, onOpenModels }: { snapshot: Snapshot | null; setSnapshot: Dispatch<SetStateAction<Snapshot | null>>; visible: boolean; onOpenModels: () => void; handoff: ChatHandoff | null; onHandoffConsumed: (id: number) => void }) {
  const [modelPresets, setModelPresets] = useState<ModelPreset[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<AgentSlotId>("parent");
  const [agents, setAgents] = useState<Record<AgentSlotId, AgentSlot>>(() => loadStoredAgents());
  const [renamingAgentId, setRenamingAgentId] = useState<AgentSlotId | null>(null);
  const [prompts, setPrompts] = useState<Record<AgentSlotId, string>>({ parent: "", "child-a": "", "child-b": "" });
  const [showRecent, setShowRecent] = useState(false);
  const [historySessions, setHistorySessions] = useState<SessionHistoryItem[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyLoadError, setHistoryLoadError] = useState("");
  const [runtimeHydrated, setRuntimeHydrated] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldFollowOutputRef = useRef(true);
  const handledHandoffRef = useRef(0);
  const historyLoadRef = useRef(0);

  const activeAgent = agents[activeAgentId];
  const activePreset = presetForAgent(activeAgent, modelPresets);

  function scrollMessagesToBottom() {
    const scroller = messagesRef.current;
    if (!visible || !scroller) {
      return;
    }

    window.requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
      shouldFollowOutputRef.current = true;
      setShowJumpToBottom(false);
    });
  }

  function handleMessagesScroll() {
    const scroller = messagesRef.current;
    if (!scroller) {
      return;
    }

    const distanceToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const nearBottom = distanceToBottom < 80;
    shouldFollowOutputRef.current = nearBottom;
    setShowJumpToBottom(!nearBottom);
  }

  useEffect(() => {
    scrollMessagesToBottom();
  }, [activeAgentId]);

  useEffect(() => {
    if (visible && shouldFollowOutputRef.current) scrollMessagesToBottom();
  }, [visible]);

  useEffect(() => {
    const composer = composerRef.current?.parentElement;
    const grid = composer?.closest<HTMLElement>(".multi-agent-grid");
    if (!composer || !grid) return;
    const measure = () => {
      const height = composer.getBoundingClientRect().height;
      if (height > 0) grid.style.setProperty("--chat-composer-height", `${height}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(composer);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (shouldFollowOutputRef.current) {
      scrollMessagesToBottom();
    }
  }, [activeAgentId, activeAgent.messages.length, activeAgent.messages.at(-1)?.text]);

  const activeRuntimeSeconds = activeAgent.running && activeAgent.startedAt ? Math.max(0, Math.floor((Date.now() - activeAgent.startedAt) / 1000)) : 0;

  useEffect(() => {
    if (showRecent) {
      void refreshHistory();
    }
  }, [showRecent, activeAgentId]);

  useEffect(() => {
    void window.hermes.modelPresets().then(setModelPresets);
    const unsubscribeModels = window.hermes.onModelsUpdated(setModelPresets);
    const unsubscribeModelSelection = window.hermes.onAgentModelUpdated(state => {
      if (!isAgentSlotId(state.agentId)) return;
      const agentId = state.agentId;
      setAgents(current => updateAgent(current, agentId, {
        presetId: state.presetId, customPreset: state.customPreset ?? null,
        sessionId: null, phase: "模型已配置，下一轮生效"
      }));
    });
    void window.hermes.agentStates().then((states) => {
      setAgents((current) => {
        let next = current;
        for (const state of states) {
          if (isAgentSlotId(state.agentId)) {
            next = updateAgent(next, state.agentId, {
              running: state.running,
              paused: state.paused,
              startedAt: state.startedAt,
              sessionId: state.sessionId ?? next[state.agentId].sessionId,
              presetId: state.presetId ?? next[state.agentId].presetId,
              customPreset: state.customPreset ?? next[state.agentId].customPreset,
              phase: state.paused ? "已暂停" : state.running ? "连接 Hermes" : next[state.agentId].phase
            });
          }
        }
        return next;
      });
    }).catch((err) => {
      setHistoryError(err instanceof Error ? err.message : "无法读取 Agent 状态。");
    }).finally(() => setRuntimeHydrated(true));

    const unsubscribeAgent = window.hermes.onAgentEvent((event) => {
      const agentId = isAgentSlotId(event.agentId) ? event.agentId : "parent";
      if (event.type === "start") {
        setAgents((current) =>
          appendAgentMessage(
            appendAgentEvent(
              updateAgent(current, agentId, {
                running: true,
                paused: false,
                startedAt: event.startedAt,
                progress: 18,
                phase: "启动 Agent"
              }),
              agentId,
              "task",
              "启动",
              event.command
            ),
            agentId,
            "system",
            "Hermes Agent 已启动。"
          )
        );
      }

      if (event.type === "session") {
        setAgents((current) => appendAgentEvent(updateAgent(current, agentId, { sessionId: event.sessionId }), agentId, "session", "会话", event.sessionId));
      }

      if (event.type === "error") {
        setAgents((current) =>
          appendAgentMessage(
            appendAgentEvent(
              updateAgent(current, agentId, {
                phase: "连接已重置",
                progress: 0
              }),
              agentId,
              "error",
              "错误",
              friendlyAgentError(event.chunk)
            ),
            agentId,
            "system",
            friendlyAgentError(event.chunk)
          )
        );
      }

      if (event.type === "stdout" || event.type === "stderr") {
        setAgents((current) =>
          appendAgentChunk(
            updateAgent(current, agentId, {
              phase: event.type === "stderr" ? "处理诊断输出" : "生成回复",
              progress: Math.min(92, Math.max(current[agentId].progress + 6, 32))
            }),
            agentId,
            event.chunk
          )
        );
      }

      if (event.type === "close") {
        setAgents((current) => {
          const cancelled = event.signal === "cancelled";
          const next = updateAgent(current, agentId, {
            running: false,
            paused: false,
            progress: 100,
            phase: cancelled ? "已取消" : event.signal ? `已中断 (${event.signal})` : "本轮回复完成"
          });
          const traced = appendAgentEvent(
            next,
            agentId,
            cancelled ? "cancel" : event.signal ? "error" : "done",
            cancelled ? "取消" : event.signal ? "中断" : "完成",
            cancelled ? "当前任务已取消" : event.signal ? `signal=${event.signal}` : "本轮回复完成"
          );
          if (cancelled) {
            return appendAgentMessage(traced, agentId, "system", "当前任务已取消。");
          }
          if (event.signal) {
            return appendAgentMessage(traced, agentId, "system", "当前回复已中断。");
          }
          if (event.hadOutput === false) {
            return appendAgentMessage(traced, agentId, "system", "Hermes 本轮没有返回可显示文本。通常是模型/鉴权配置失败，打开日志可以看到更具体的错误。");
          }
          return traced;
        });
        window.setTimeout(() => setAgents((current) => updateAgent(current, agentId, { progress: 0 })), 1800);
        void window.hermes.sessions(20).then((result) => setSnapshot((prev) => prev && { ...prev, sessions: result }));
      }
    });
    return () => { unsubscribeModels(); unsubscribeModelSelection(); unsubscribeAgent(); };
  }, [setSnapshot]);

  useEffect(() => {
    if (!handoff || handledHandoffRef.current === handoff.id) return;
    const sourceAgent = handoff.session?.agentId;
    const target = sourceAgent === "__global" ? "parent" : sourceAgent ?? "parent";
    if (!isAgentSlotId(target)) {
      handledHandoffRef.current = handoff.id;
      setHistoryLoadError("这条会话不属于当前工作空间的 Agent。");
      setShowRecent(true);
      onHandoffConsumed(handoff.id);
      return;
    }
    if (activeAgentId !== target) {
      setActiveAgentId(target);
      return;
    }
    if (handoff.session && !runtimeHydrated) return;
    handledHandoffRef.current = handoff.id;
    if (handoff.session) {
      setShowRecent(false);
      void loadHistorySession(handoff.session).catch((err) => {
        setHistoryLoadError(err instanceof Error ? err.message : "无法载入历史对话。");
        setShowRecent(true);
      }).finally(() => onHandoffConsumed(handoff.id));
    } else if (handoff.prompt) {
      setPrompts((current) => ({ ...current, [target]: handoff.prompt! }));
      window.requestAnimationFrame(() => composerRef.current?.focus());
      onHandoffConsumed(handoff.id);
    }
  }, [handoff, activeAgentId, runtimeHydrated, onHandoffConsumed]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAgents((current) => {
        let changed = false;
        const next = { ...current };
        for (const agent of Object.values(current)) {
          if (agent.running) {
            const elapsed = agent.startedAt ? Date.now() - agent.startedAt : 0;
            const progress = Math.min(92, 18 + Math.floor(elapsed / 900));
            if (progress !== agent.progress) {
              next[agent.id] = { ...agent, progress };
              changed = true;
            }
          }
        }
        return changed ? next : current;
      });
    }, 700);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    saveStoredAgents(agents);
  }, [agents]);

  useEffect(() => {
    for (const agent of Object.values(agents)) {
      if (!agent.running && agent.queue.length > 0) {
        const [nextPrompt, ...rest] = agent.queue;
        setAgents((current) => updateAgent(current, agent.id, { queue: rest }));
        void launchPrompt(agent.id, nextPrompt, false);
        break;
      }
    }
  }, [agents]);

  function addMessage(agentId: AgentSlotId, role: ChatMessage["role"], text: string) {
    setAgents((current) => appendAgentMessage(current, agentId, role, text));
  }

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId((current) => (current === message.id ? null : current)), 1200);
    } catch {
      addMessage(activeAgentId, "system", "复制失败，系统剪贴板暂时不可用。");
    }
  }

  function quoteMessage(message: ChatMessage) {
    const speaker = message.role === "user" ? "你" : message.role === "agent" ? activeAgent.name : "Console";
    const quotedText = message.text
      .trim()
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    const quoteBlock = `引用 ${speaker} · ${message.at}：\n${quotedText}\n\n`;
    setPrompts((current) => ({
      ...current,
      [activeAgentId]: current[activeAgentId].trim() ? `${current[activeAgentId].trimEnd()}\n\n${quoteBlock}` : quoteBlock
    }));
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function launchPrompt(agentId: AgentSlotId, text: string, shouldAddUserMessage = true) {
    const agent = agents[agentId];
    if (shouldAddUserMessage) {
      addMessage(agentId, "user", text);
    }
    setAgents((current) => appendAgentEvent(updateAgent(current, agentId, { phase: "排队启动", progress: 8 }), agentId, "task", "投递任务", text.slice(0, 96)));
    const result = await window.hermes.startAgent(agentId, text, agent.presetId, agent.customPreset);
    if (!result.ok) {
      setAgents((current) =>
        appendAgentMessage(
          updateAgent(current, agentId, { running: false, progress: 0, phase: "启动失败" }),
          agentId,
          "system",
          result.reason ?? "Hermes Agent 启动失败。"
        )
      );
    }
  }

  async function submitText(agentId: AgentSlotId, text: string) {
    const clean = text.trim();
    if (!clean) {
      return;
    }

    if (agents[agentId].running) {
      setAgents((current) =>
        appendAgentEvent(
          appendAgentMessage(
            appendAgentMessage(updateAgent(current, agentId, { queue: [...current[agentId].queue, clean] }), agentId, "user", clean),
            agentId,
            "system",
            "当前 Agent 正在运行，这条消息已排队。"
          ),
          agentId,
          "task",
          "排队",
          clean.slice(0, 96)
        )
      );
      return;
    }

    await launchPrompt(agentId, clean);
  }

  async function sendPrompt() {
    const text = prompts[activeAgentId].trim();
    if (!text) {
      return;
    }

    setPrompts((current) => ({ ...current, [activeAgentId]: "" }));
    await submitText(activeAgentId, text);
  }

  async function retryMessage(message: ChatMessage) {
    if (message.role !== "user") {
      return;
    }
    await submitText(activeAgentId, message.text);
  }

  async function refreshHistory(limit = 30) {
    setHistoryBusy(true);
    setHistoryError("");
    const result = await window.hermes.sessionHistory(activeAgentId, limit);
    setHistoryBusy(false);
    if (!result.ok) {
      setHistoryError(result.reason);
      setHistorySessions([]);
      return;
    }
    setHistorySessions(result.sessions);
  }

  async function loadHistorySession(item: Pick<SessionHistoryItem, "id" | "agentId" | "title">) {
    setHistoryLoadError("");
    if (activeAgent.running) {
      addMessage(activeAgentId, "system", "当前 Agent 正在运行，结束后再载入历史记录。");
      return;
    }

    const loadId = ++historyLoadRef.current;
    const result = await window.hermes.loadSession(item.agentId, item.id);
    if (historyLoadRef.current !== loadId) return;
    if (!result.ok) {
      setHistoryLoadError(result.reason);
      setShowRecent(true);
      return;
    }

    setAgents((current) =>
      appendAgentEvent(
        updateAgent(current, activeAgentId, {
        sessionId: result.session.id,
        phase: "查看历史",
        progress: 0,
        running: false,
        paused: false,
        messages:
          result.session.messages.length > 0
            ? result.session.messages.map((message) => ({
                ...message,
                runtimeId: "hermes",
                agentId: activeAgentId,
                sessionId: result.session.id
              }))
            : [
                {
                  id: `history-empty-${Date.now()}`,
                  runtimeId: "hermes",
                  agentId: activeAgentId,
                  sessionId: result.session.id,
                  role: "system",
                  text: "这条历史会话没有可显示的消息。",
                  at: nowLabel()
                }
              ]
        }),
        activeAgentId,
        "session",
        "载入历史",
        result.session.title
      )
    );
    shouldFollowOutputRef.current = true;
    window.requestAnimationFrame(scrollMessagesToBottom);
  }

  async function interrupt(agentId: AgentSlotId) {
    const result = await window.hermes.interruptAgent(agentId);
    if (result.ok) {
      setAgents((current) => appendAgentEvent(updateAgent(current, agentId, { phase: "正在中断", progress: 96 }), agentId, "error", "中断请求", "正在停止当前回复"));
    } else {
      addMessage(agentId, "system", result.reason ?? "当前没有正在运行的 Agent。");
    }
  }

  async function cancelRun(agentId: AgentSlotId) {
    if (!agents[agentId].running) {
      return;
    }

    const result = await window.hermes.interruptAgent(agentId);
    if (result.ok) {
      setAgents((current) =>
        appendAgentEvent(
          updateAgent(current, agentId, { running: false, paused: false, phase: "正在取消", progress: 96, queue: [] }),
          agentId,
          "cancel",
          "取消请求",
          "正在取消当前任务并释放连接"
        )
      );
    } else {
      addMessage(agentId, "system", result.reason ?? "当前没有正在运行的 Agent。");
    }
  }

  async function newContext(agentId: AgentSlotId) {
    const agent = agents[agentId];
    if (agent.running) {
      addMessage(agentId, "system", "当前 Agent 正在运行，请先中断或等待完成。");
      return;
    }

    const result = await window.hermes.newAgentContext(agentId, agent.presetId);
    if (!result.ok) {
      addMessage(agentId, "system", result.reason ?? "新建对话失败。");
      return;
    }

    setAgents((current) =>
      appendAgentEvent(
        updateAgent(current, agentId, {
          sessionId: null,
          queue: [],
          phase: "新对话",
          progress: 0,
          messages: [
            {
              id: `context-${Date.now()}`,
              runtimeId: "hermes",
              agentId,
              sessionId: null,
              role: "system",
              text: "已新建一轮上下文。输入任务后，Hermes 会从新的对话开始。",
              at: nowLabel()
            }
          ]
        }),
        agentId,
        "session",
        "新对话",
        "已重置当前上下文"
      )
    );
  }

  async function switchAgentModel(agentId: AgentSlotId, presetId: ModelPreset["id"]) {
    const agent = agents[agentId];
    if (agent.running) {
      return;
    }
    const preset = modelPresets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    const result = await window.hermes.configureAgentModel(agentId, preset);
    if (!result.ok) {
      addMessage(agentId, "system", result.reason ?? "模型配对失败。");
      return;
    }

    setAgents((current) =>
      appendAgentMessage(
        appendAgentEvent(updateAgent(current, agentId, { presetId, customPreset: preset.custom ? preset : null, sessionId: null, phase: "模型已切换，下一轮生效" }), agentId, "config", "模型", preset.label),
        agentId,
        "system",
        `模型已切换为 ${modelPresets.find((preset) => preset.id === presetId)?.label ?? presetId}。`
      )
    );
    void window.hermes.newAgentContext(agentId, presetId);
  }


  return (
    <section className="chat-console multi-agent-console">
      <div className="agent-status">
        <div>
          <p className="eyebrow">Multi-agent runtime</p>
          <h2>{activeAgent.running ? `${activeAgent.name} 正在运行` : `${activeAgent.name} 对话框`}</h2>
          <span className="agent-session-label" title={activeAgent.sessionId ?? undefined}>{activeAgent.phase}{activeAgent.sessionId ? ` · 会话 ${activeAgent.sessionId.slice(-8)}` : ""}</span>
          <small className="runtime-model-truth">实际运行：{activePreset.model} · {activePreset.providerLabel}</small>
        </div>
        <div className="runtime-actions">
          <button onClick={onOpenModels} title="配置模型和 API Key">
            <Settings size={16} />
            模型中心
          </button>
          <label className="inline-select" title="当前 Agent 模型">
            <Cpu size={16} />
            <select value={activeAgent.customPreset ? "__custom" : activeAgent.presetId} disabled={activeAgent.running} onChange={(event) => {
              if (event.target.value !== "__custom") void switchAgentModel(activeAgentId, event.target.value as ModelPreset["id"]);
            }}>
              {activeAgent.customPreset ? <option value="__custom">{`${activePreset.model} · ${activePreset.providerLabel}`}</option> : null}
              {modelPresets.map((preset) => (
                <option key={preset.id} value={preset.id} disabled={preset.available === false}>
                  {`${preset.model} · ${preset.providerLabel}${preset.available === false ? " · 已下架" : ""}`}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => newContext(activeAgentId)} disabled={activeAgent.running}>
            <ListRestart size={16} />
            新对话
          </button>
          <button onClick={() => setShowRecent((value) => !value)} aria-expanded={showRecent} aria-controls="session-history-panel">
            <History size={16} />
            最近会话
          </button>
          <button className="icon-button" onClick={() => cancelRun(activeAgentId)} disabled={!activeAgent.running} title="取消当前任务">
            <CircleStop size={18} />
          </button>
          <button className="icon-button" onClick={() => interrupt(activeAgentId)} disabled={!activeAgent.running} title="强制中断 Agent">
            <CircleStop size={18} />
          </button>
        </div>
      </div>

      <div className={showRecent ? "multi-agent-grid with-recent" : "multi-agent-grid"}>
        <aside className="agent-list">
          {Object.values(agents).map((agent) => {
            const preset = presetForAgent(agent, modelPresets);
            return (
              <div className="agent-card-wrapper" key={agent.id}>
              <button className={agent.id === activeAgentId ? "agent-card active" : "agent-card"} onClick={() => setActiveAgentId(agent.id)}>
                <span className={agent.running ? "agent-dot running" : "agent-dot"} />
                <span className="agent-card-heading">
                  <strong>{agent.name}</strong>
                  <small>{agent.role}</small>
                </span>
                <span className="agent-model-badge" title={preset ? `${preset.model} · ${preset.providerLabel}` : agent.presetId}>
                  <b>{preset?.model ?? agent.presetId}</b>
                  {preset ? <i>{preset.providerLabel}</i> : null}
                </span>
                <span className="agent-preview">{agent.running ? agent.phase : agent.messages.at(-1)?.text.slice(0, 34) ?? "待命"}</span>
                <span className="agent-progress" aria-label={`${agent.name} 运行进度`}>
                  <i style={{ width: `${agent.progress}%` }} />
                </span>
              </button>
              <button className="agent-rename-button" title={`修改 ${agent.name} 的显示名称`} aria-label={`修改 ${agent.name} 的显示名称`} onClick={() => setRenamingAgentId(agent.id)}><Pencil size={14} /></button>
              {renamingAgentId === agent.id ? <form className="agent-rename-form" onSubmit={(event) => {
                event.preventDefault();
                const input = event.currentTarget.elements.namedItem("displayName") as HTMLInputElement;
                const name = input.value.trim();
                if (!name) { input.setCustomValidity("请输入显示名称"); input.reportValidity(); return; }
                setAgents(current => updateAgent(current, agent.id, { name }));
                setRenamingAgentId(null);
              }}>
                <label htmlFor={`agent-name-${agent.id}`}>显示名称</label>
                <input id={`agent-name-${agent.id}`} name="displayName" defaultValue={agent.name} maxLength={32} required autoFocus onFocus={event => event.currentTarget.select()} onInput={event => event.currentTarget.setCustomValidity("")} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setRenamingAgentId(null); } }} />
                <div><button type="submit">保存</button><button type="button" onClick={() => setRenamingAgentId(null)}>取消</button></div>
              </form> : null}
              </div>
            );
          })}
          <section className="workroom-panel">
            <div className="workroom-head">
              <div>
                <p className="eyebrow">Workroom</p>
                <strong>运行轨迹</strong>
              </div>
              <span className={activeAgent.running ? "workroom-state live" : "workroom-state"}>{activeAgent.running ? "Live" : "Idle"}</span>
            </div>
            <div className="workroom-stats">
              <span>
                <small>阶段</small>
                <b>{activeAgent.phase}</b>
              </span>
              <span>
                <small>队列</small>
                <b>{activeAgent.queue.length}</b>
              </span>
              <span>
                <small>耗时</small>
                <b>{formatDuration(activeRuntimeSeconds)}</b>
              </span>
            </div>
            <div className="workroom-session">
              <small>Session</small>
              <code>{activeAgent.sessionId ?? "pending"}</code>
            </div>
            <div className="workroom-events">
              {activeAgent.events.length === 0 ? <p>暂无运行事件</p> : null}
              {activeAgent.events.slice(-6).reverse().map((event) => (
                <article className={`trace-event ${event.kind}`} key={event.id}>
                  <span>{event.at}</span>
                  <strong>{event.label}</strong>
                  <small>{event.detail}</small>
                </article>
              ))}
            </div>
          </section>
        </aside>

        <div className="dialog-panel">
          <div className="messages" ref={messagesRef} onScroll={handleMessagesScroll}>
            {activeAgent.messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <span>{message.role === "user" ? "你" : message.role === "agent" ? activeAgent.name : "Console"} · {message.at}</span>
                <MessageBody message={message} />
                <div className="message-actions">
                  <button className="message-action" onClick={() => void copyMessage(message)} title="复制这条消息">
                    {copiedMessageId === message.id ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  <button className="message-action" onClick={() => quoteMessage(message)} title="引用这条消息">
                    <Quote size={13} />
                  </button>
                  {message.role === "user" ? (
                    <button className="message-action" onClick={() => void retryMessage(message)} title="重新发送这条消息">
                      <RefreshCcw size={13} />
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {showJumpToBottom ? (
            <button className="jump-to-bottom" onClick={scrollMessagesToBottom} title="回到底部">
              <ArrowDown size={16} />
            </button>
          ) : null}
          <div className="composer">
            <textarea
              ref={composerRef}
              value={prompts[activeAgentId]}
              onChange={(event) => setPrompts((current) => ({ ...current, [activeAgentId]: event.target.value }))}
              onKeyDown={(event) => {
                const nativeEvent = event.nativeEvent as KeyboardEvent;
                const isComposing = nativeEvent.isComposing || nativeEvent.keyCode === 229;
                if (event.key !== "Enter" || isComposing) {
                  return;
                }

                if (event.shiftKey) {
                  return;
                }

                if (!event.metaKey && !event.ctrlKey) {
                  event.preventDefault();
                  void sendPrompt();
                  return;
                }

                if (event.metaKey || event.ctrlKey) {
                  event.preventDefault();
                  void sendPrompt();
                }
              }}
              placeholder={`输入要交给 ${activeAgent.name} 的任务... Enter 发送，Shift+Enter 换行`}
            />
            <button
              className={activeAgent.running ? "send-button pause-action" : "send-button"}
              onClick={activeAgent.running ? () => void cancelRun(activeAgentId) : sendPrompt}
              disabled={!activeAgent.running && !prompts[activeAgentId].trim()}
              title={activeAgent.running ? "取消当前任务" : "发送"}
            >
              {activeAgent.running ? <CircleStop size={18} /> : <Send size={18} />}
            </button>
          </div>
        </div>

        {showRecent ? (
          <aside className="history-panel" id="session-history-panel" aria-label="最近会话" onKeyDown={(event) => { if (event.key === "Escape") setShowRecent(false); }}>
            <div className="history-head">
              <div>
                <p className="eyebrow">History</p>
                <h2>
                  <History size={18} />
                  最近会话
                </h2>
              </div>
              <div className="history-head-actions">
              <button onClick={() => void refreshHistory(40)} disabled={historyBusy} title="刷新最近会话" aria-label="刷新最近会话">
                <RefreshCcw size={15} />
              </button>
              <button onClick={() => setShowRecent(false)} title="关闭最近会话" aria-label="关闭最近会话"><X size={16} /></button>
              </div>
            </div>
            <div className="history-list">
              {historyLoadError || historyError ? <p className="history-error" role="alert">{historyLoadError || historyError}</p> : null}
              {historyBusy && historySessions.length === 0 ? <p className="history-empty">正在读取历史...</p> : null}
              {!historyBusy && historySessions.length === 0 && !historyError && !historyLoadError ? <p className="history-empty">还没有找到这个 Agent 的历史会话。</p> : null}
              {historySessions.map((item) => (
                <button className="history-item" key={item.id} onClick={() => void loadHistorySession(item)} disabled={activeAgent.running}>
                  <span>{formatHistoryTime(item.updatedAt)}</span>
                  <strong>{item.title}</strong>
                  <small>{item.preview}</small>
                  <em>
                    {item.source === "request-dump" ? "请求记录" : item.agentId === "__global" ? "全局会话" : "Console 会话"} · {item.model || "unknown"} · {item.messageCount} 条
                  </em>
                </button>
              ))}
            </div>
            <button className="history-more" onClick={() => void refreshHistory(80)} disabled={historyBusy}>
              加载更多
            </button>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function nowLabel() {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
}

function formatDuration(seconds: number) {
  if (!seconds) {
    return "0s";
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

function formatHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "未知时间";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

const agentsStorageKey = "hermes-console:agent-slots";

const agentTemplates: Array<Omit<AgentSlot, "customPreset" | "messages" | "sessionId" | "running" | "paused" | "startedAt" | "phase" | "progress" | "queue" | "events">> = [
  { id: "parent", name: "父 Agent", role: "总控 / 规划", presetId: "codex-gpt-6-sol" },
  { id: "child-a", name: "子 Agent A", role: "研究 / 审阅", presetId: "codex-gpt-6-sol" },
  { id: "child-b", name: "子 Agent B", role: "执行 / 快速反馈", presetId: "codex-gpt-6-sol" }
];

function initialChatMessages(): ChatMessage[] {
  return [
    {
      id: "welcome",
      role: "system",
      text: "Hermes Console 已准备好。输入任务后可以观察运行状态，也可以随时中断当前 Agent。",
      at: nowLabel()
    }
  ];
}

function MessageBody({ message }: { message: ChatMessage }) {
  return (
    <div className="message-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault();
                if (href) {
                  void window.hermes.openExternal(href);
                }
              }}
              rel="noreferrer"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="markdown-table-scroll">
              <table>{children}</table>
            </div>
          )
        }}
      >
        {message.text}
      </ReactMarkdown>
    </div>
  );
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "agent" || message.role === "system") &&
    typeof message.text === "string" &&
    typeof message.at === "string"
  );
}

function isAgentTraceEvent(value: unknown): value is AgentTraceEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const event = value as Partial<AgentTraceEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.label === "string" &&
    typeof event.detail === "string" &&
    typeof event.at === "string" &&
    (event.kind === "task" || event.kind === "session" || event.kind === "output" || event.kind === "pause" || event.kind === "cancel" || event.kind === "error" || event.kind === "done" || event.kind === "config")
  );
}

function isAgentSlotId(value: unknown): value is AgentSlotId {
  return value === "parent" || value === "child-a" || value === "child-b";
}

function createAgentSlot(template: (typeof agentTemplates)[number], stored?: StoredAgentSlot): AgentSlot {
  const messages = (Array.isArray(stored?.messages) ? stored.messages.filter(isChatMessage).slice(-200) : initialChatMessages()).map((message) => ({
    ...message,
    runtimeId: message.runtimeId || "hermes",
    agentId: message.agentId || template.id,
    sessionId: message.sessionId ?? stored?.sessionId ?? null
  }));
  const events = Array.isArray(stored?.events) ? stored.events.filter(isAgentTraceEvent).slice(-80) : [];
  const storedPreset = isModelPreset(stored?.customPreset) ? stored.customPreset : null;
  const migrateLegacyPreset = stored?.modelDefaultsVersion !== 20260913;
  return {
    ...template,
    name: typeof stored?.name === "string" && stored.name.trim() ? stored.name.trim().slice(0, 32) : template.name,
    presetId: migrateLegacyPreset ? template.presetId : stored?.presetId ?? template.presetId,
    customPreset: migrateLegacyPreset ? null : storedPreset,
    sessionId: typeof stored?.sessionId === "string" ? stored.sessionId : null,
    messages: messages.length > 0 ? messages : initialChatMessages(),
    running: false,
    paused: false,
    startedAt: 0,
    phase: "待命",
    progress: 0,
    queue: [],
    events
  };
}

function isModelPreset(value: unknown): value is ModelPreset {
  if (!value || typeof value !== "object") {
    return false;
  }
  const preset = value as Partial<ModelPreset>;
  return (
    typeof preset.id === "string" &&
    typeof preset.label === "string" &&
    typeof preset.model === "string" &&
    typeof preset.provider === "string" &&
    typeof preset.providerLabel === "string" &&
    typeof preset.baseUrl === "string"
  );
}

function loadStoredAgents(): Record<AgentSlotId, AgentSlot> {
  try {
    const raw = window.localStorage.getItem(agentsStorageKey);
    const parsed = raw ? (JSON.parse(raw) as Partial<Record<AgentSlotId, StoredAgentSlot>>) : {};
    return {
      parent: createAgentSlot(agentTemplates[0], parsed.parent),
      "child-a": createAgentSlot(agentTemplates[1], parsed["child-a"]),
      "child-b": createAgentSlot(agentTemplates[2], parsed["child-b"])
    };
  } catch {
    return {
      parent: createAgentSlot(agentTemplates[0]),
      "child-a": createAgentSlot(agentTemplates[1]),
      "child-b": createAgentSlot(agentTemplates[2])
    };
  }
}

function saveStoredAgents(agents: Record<AgentSlotId, AgentSlot>) {
  window.localStorage.setItem(
    agentsStorageKey,
    JSON.stringify(
      Object.fromEntries(
        Object.values(agents).map((agent) => [
          agent.id,
          {
            name: agent.name,
            modelDefaultsVersion: 20260913,
            presetId: agent.presetId,
            customPreset: agent.customPreset,
            sessionId: agent.sessionId,
            messages: agent.messages.slice(-200),
            events: agent.events.slice(-80)
          }
        ])
      )
    )
  );
}

function presetForAgent(agent: AgentSlot, presets: ModelPreset[]) {
  return agent.customPreset ?? presets.find((preset) => preset.id === agent.presetId) ?? presets[0] ?? {
    id: agent.presetId,
    label: agent.presetId,
    model: agent.presetId,
    provider: "openai-codex",
    providerLabel: "OpenAI Codex",
    baseUrl: "https://chatgpt.com/backend-api/codex"
  };
}

function draftFromPreset(preset: ModelPreset): AgentModelDraft {
  return {
    label: preset.label,
    model: preset.model,
    provider: preset.provider,
    providerLabel: preset.providerLabel,
    baseUrl: preset.baseUrl,
    apiKeyEnv: preset.apiKeyEnv,
    apiKey: ""
  };
}

function matchingDraftPresetId(draft: AgentModelDraft, presets: ModelPreset[]) {
  return presets.find((preset) =>
    preset.model === draft.model &&
    preset.provider === draft.provider &&
    preset.baseUrl === draft.baseUrl
  )?.id ?? "__custom";
}

function presetFromDraft(draft: AgentModelDraft): ModelPreset {
  const label = draft.label.trim() || `${draft.providerLabel} · ${draft.model.trim()}`;
  return {
    id: `custom-${draft.provider}-${draft.model.trim().replace(/[^a-zA-Z0-9._-]/g, "-")}`,
    label,
    model: draft.model.trim(),
    provider: draft.provider,
    providerLabel: draft.providerLabel,
    baseUrl: draft.baseUrl.trim(),
    apiKeyEnv: draft.apiKeyEnv,
    custom: true
  };
}

function updateAgent(agents: Record<AgentSlotId, AgentSlot>, agentId: AgentSlotId, patch: Partial<AgentSlot>) {
  return {
    ...agents,
    [agentId]: {
      ...agents[agentId],
      ...patch
    }
  };
}

function appendAgentMessage(agents: Record<AgentSlotId, AgentSlot>, agentId: AgentSlotId, role: ChatMessage["role"], text: string) {
  return updateAgent(agents, agentId, {
    messages: [
      ...agents[agentId].messages,
      {
        id: `${Date.now()}-${Math.random()}`,
        runtimeId: "hermes",
        agentId,
        sessionId: agents[agentId].sessionId,
        role,
        text,
        at: nowLabel()
      }
    ]
  });
}

function appendAgentEvent(agents: Record<AgentSlotId, AgentSlot>, agentId: AgentSlotId, kind: AgentTraceEvent["kind"], label: string, detail: string) {
  return updateAgent(agents, agentId, {
    events: [
      ...agents[agentId].events,
      {
        id: `event-${Date.now()}-${Math.random()}`,
        kind,
        label,
        detail,
        at: nowLabel()
      }
    ].slice(-80)
  });
}

function appendAgentChunk(agents: Record<AgentSlotId, AgentSlot>, agentId: AgentSlotId, chunk: string) {
  const clean = chunk
    .replace(/session_id:\s*[0-9]{8}_[0-9]{6}_[A-Za-z0-9]+/gi, "")
    .replace(/Resume this session with:[\s\S]*$/i, "")
    .replace(/^Queued for the next turn\.\s*\(\d+\s+queued\)\s*$/i, "");
  if (!clean.trim()) {
    return agents;
  }

  const messages = agents[agentId].messages;
  const last = messages[messages.length - 1];
  return updateAgent(agents, agentId, {
    messages:
      last?.role === "agent"
        ? [...messages.slice(0, -1), { ...last, text: `${last.text}${clean}` }]
        : [
            ...messages,
            {
              id: `${Date.now()}-${Math.random()}`,
              role: "agent",
              text: clean,
              at: nowLabel()
            }
          ]
  });
}

function friendlyAgentError(message: string) {
  if (/Hermes ACP request timed out|本轮响应超时/i.test(message)) {
    return "Hermes 本轮响应超时，已自动重置这个 Agent 的连接。你可以直接重新发送，不会再接到旧的排队上下文。";
  }

  if (/Queued for the next turn/i.test(message)) {
    return "Hermes 还在处理上一轮，Console 已阻止这条内部排队提示继续污染对话。";
  }

  return message || "Hermes 运行时出现错误。";
}

function titleFor(active: TabId) {
  return {
    home: "我的 Agent",
    observatory: "Observatory",
    sessions: "Sessions",
    heartprint: "Heartprint",
    growth: "Growth Map",
    health: "Health",
    knowledge: "Knowledge",
    gateway: "Gateway",
    cron: "Task Center",
    tools: "Tools & Skills",
    security: "Security"
  }[active];
}

function Observatory({
  snapshot,
  metrics,
  updateInfo,
  updateBusy,
  updateMessage,
  onCheckUpdate,
  onRunUpdate
}: {
  snapshot: Snapshot | null;
  metrics: { label: string; value: string; tone: string }[];
  updateInfo: UpdateInfo | null;
  updateBusy: boolean;
  updateMessage: string;
  onCheckUpdate: () => void;
  onRunUpdate: () => void;
}) {
  const missingHermes = isHermesMissing(snapshot);
  const status = snapshot?.status;

  return (
    <div className="stack">
      <section className="hero-band">
        <div>
          <p className="eyebrow">Hermes Agent</p>
          <h2>{missingHermes ? "Hermes 尚未连接" : snapshot?.status.version ?? "正在连接 Hermes"}</h2>
          <p className="soft">{missingHermes ? "这台电脑需要先安装并配置 Hermes Agent" : snapshot?.status.project ?? "读取本地 Hermes 状态中"}</p>
        </div>
        <div className="hero-symbol">
          <img src={brandAsset} alt="" />
        </div>
      </section>

      <section className="metrics">
        {metrics.map((item) => (
          <article className={`metric ${item.tone}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section className="grid two overview-grid">
        <section className="panel readable-panel">
          <header>
            <div className="panel-title">
              <TerminalSquare size={18} />
              <h2>运行状态</h2>
            </div>
          </header>
          <div className="readable-list">
            <StatusRow label="项目" value={status?.project ?? "正在读取"} />
            <StatusRow label="Python" value={status?.python ?? "Unknown"} />
            <StatusRow label="模型" value={status?.model ?? "Unknown"} />
            <StatusRow label="Provider" value={status?.provider ?? "Unknown"} />
            <StatusRow label="Gateway" value={status?.gateway ?? "Unknown"} />
            <StatusRow label="任务" value={status?.jobs ?? "Unknown"} />
            <StatusRow label="会话" value={status?.sessions ?? "Unknown"} />
          </div>
        </section>

        <section className="panel readable-panel update-panel">
          <header>
            <div className="panel-title">
              <Download size={18} />
              <h2>Hermes 更新</h2>
            </div>
          </header>
          <div className="update-state">
            <span className={updateInfo?.available ? "status-pill warn" : "status-pill good"}>
              {updateInfo?.available ? "有新版本" : "已是最新"}
            </span>
            <strong>{updateInfo?.currentVersion ?? status?.version ?? "正在读取版本"}</strong>
            <p>{updateMessage || updateInfo?.detail || "点击检查更新，Hermes 会使用官方 CLI 更新流程检测当前版本。"}</p>
          </div>
          <div className="update-actions">
            <button onClick={onCheckUpdate} disabled={updateBusy || missingHermes}>
              {updateBusy ? <LoaderCircle className="spin" size={16} /> : <RefreshCcw size={16} />}
              检查更新
            </button>
            <button className="primary-action" onClick={onRunUpdate} disabled={updateBusy || missingHermes || !updateInfo?.available}>
              <Download size={16} />
              更新 Hermes
            </button>
          </div>
        </section>
      </section>
      <ModelConfigurationCenter />
    </div>
  );
}

function ModelConfigurationCenter() {
  const [presets, setPresets] = useState<ModelPreset[]>([]);
  const [agentId, setAgentId] = useState<AgentSlotId>("parent");
  const [states, setStates] = useState<AgentRuntimeState[]>([]);
  const [draft, setDraft] = useState<AgentModelDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: string; text: string }>({ tone: "idle", text: "选择模型后点击测试，自动保存并连接。" });
  const [apiModels, setApiModels] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState<ModelSyncStatus>({ source: "builtin" });
  const [refreshing, setRefreshing] = useState(false);
  const selectionRef = useRef(0);
  const names = loadStoredAgents();
  const current = states.find(s => s.agentId === agentId);
  const codexPresets = presets.filter(p => p.provider === "openai-codex" && p.available !== false);
  const apiPresets = presets.filter(p => p.apiKeyEnv);
  const isCodex = draft?.provider === "openai-codex";
  const locked = busy || Boolean(current?.running);
  const configured = current?.customPreset ?? presets.find(p => p.id === current?.presetId);

  useEffect(() => {
    let active = true;
    Promise.all([window.hermes.modelPresets(), window.hermes.agentStates()]).then(([models, agents]) => {
      if (active) { setPresets(models); setStates(agents); }
    }).catch(error => { if (active) setResult({ tone: "error", text: String(error) }); });
    const stopModels = window.hermes.onModelsUpdated(setPresets);
    void window.hermes.modelSyncStatus().then(value => { if (active) setSyncStatus(value); }).catch(() => {});
    const stopSync = window.hermes.onModelSyncUpdated(setSyncStatus);
    const stopSelection = window.hermes.onAgentModelUpdated(state => setStates(old => [...old.filter(s => s.agentId !== state.agentId), state]));
    const stopEvents = window.hermes.onAgentEvent(event => { if (!["start", "exit", "done", "error"].includes(event.type)) return; void window.hermes.agentStates().then(value => { if (active) setStates(value); }).catch(() => {}); });
    return () => { active = false; stopModels(); stopSync(); stopSelection(); stopEvents(); };
  }, []);

  useEffect(() => {
    const saved = states.find(s => s.agentId === agentId);
    const preset = saved?.customPreset ?? presets.find(p => p.id === saved?.presetId && p.available !== false) ?? presets.find(p => p.provider === "openai-codex" && p.available !== false);
    if (!preset) return;
    setDraft(draftFromPreset(preset));
    setApiModels([]);
    setResult({ tone: "idle", text: "选择模型后点击测试，自动保存并连接。" });
    selectionRef.current += 1;
  }, [agentId, presets.length > 0, states.length > 0]);

  function choose(preset: ModelPreset) {
    selectionRef.current += 1;
    setDraft(draftFromPreset(preset));
    setApiModels([]);
    setResult({ tone: "idle", text: "配置待保存。点击测试即可保存并验证连接。" });
  }

  async function save(testConnection: boolean) {
    if (!draft || locked) return;
    const preset = isCodex ? codexPresets.find(p => p.model === draft.model) : presetFromDraft(draft);
    if (!preset) { setResult({ tone: "error", text: "请选择可用的 ChatGPT / Codex 模型。" }); return; }
    setBusy(true);
    setResult({ tone: "testing", text: testConnection ? "正在保存配置并测试连接…" : "正在保存配置…" });
    try {
      const saved = await window.hermes.configureAgentModel(agentId, preset, isCodex ? undefined : draft.apiKey);
      if (!saved.ok) throw new Error(saved.reason ?? "配置保存失败。");
      setDraft(old => old ? { ...old, apiKey: "" } : old);
      if (testConnection) {
        const checked = await window.hermes.verifyAgentModel(agentId);
        setResult({ tone: checked.ok ? "ok" : "error", text: checked.message ?? checked.reason ?? "测试失败。" });
      } else setResult({ tone: "idle", text: "配置已保存，下一轮对话生效。" });
    } catch (error) { setResult({ tone: "error", text: error instanceof Error ? error.message : "模型配置失败。" }); }
    finally { setBusy(false); }
  }

  return <section id="model-configuration-center" className="panel agent-model-panel observatory-model-center">
    <header><div className="panel-title"><Cpu size={18} /><h2>模型配置中心</h2></div></header>
    <p className="soft">为当前 Agent 配置模型。保留聊天记录、记忆、技能和知识库；切换模型后开启新的运行上下文。</p>
    <div className="model-center-columns">
      <div className="model-center-form">
        <label>配置对象<select value={agentId} disabled={busy} onChange={e => setAgentId(e.target.value as AgentSlotId)}>{agentTemplates.map(a => <option key={a.id} value={a.id}>{names[a.id].name}</option>)}</select></label>
        <label>连接方式<select value={!draft || isCodex ? "codex" : "api"} disabled={locked || !draft} onChange={e => {
          const preset = e.target.value === "codex" ? codexPresets[0] : apiPresets.find(p => p.id === "openai-api-custom");
          if (preset) choose(preset);
        }}><option value="codex">ChatGPT / Codex 登录态（默认）</option><option value="api">其他模型 · API Key</option></select></label>
        {draft && isCodex ? <>
          <label>ChatGPT 模型<select value={draft.model} disabled={locked} onChange={e => { const preset = codexPresets.find(p => p.model === e.target.value); if (preset) choose(preset); }}>{codexPresets.map(p => <option key={p.id} value={p.model}>{p.label}</option>)}</select></label>
          <div className="model-login-note"><strong>自动使用本机 ChatGPT / Codex 登录态</strong><p>无需填写 API Key 或接口地址。自动更新账号可用模型目录，保留你选择的模型。</p><small>每 30 秒检查更新，遵循服务端缓存时间；对应 Codex 可用模型。</small><p role="status">{syncStatus.source === "online" ? "已连接在线模型目录" : syncStatus.source === "cache" ? "使用上次同步的模型目录" : "使用内置离线模型列表"}{syncStatus.checkedAt ? ` · 最近检查 ${new Date(syncStatus.checkedAt).toLocaleTimeString()}` : ""}{syncStatus.reason ? `。${syncStatus.reason}` : ""}</p><button type="button" className="secondary" disabled={refreshing} onClick={async () => { setRefreshing(true); try { setSyncStatus(await window.hermes.refreshModels()); } catch { setSyncStatus(old => ({ ...old, reason: "刷新失败，稍后自动重试。" })); } finally { setRefreshing(false); } }}>{refreshing ? "正在刷新…" : "立即同步模型"}</button></div>
        </> : draft ? <>
          <label>服务商 / 已保存模型<select value={matchingDraftPresetId(draft, apiPresets)} disabled={locked} onChange={e => { if (e.target.value === "__custom") { choose({ id: "new-api", label: "", model: "", provider: "openai", providerLabel: "自定义 API", baseUrl: "", apiKeyEnv: "OPENAI_API_KEY", custom: true }); return; } const preset = apiPresets.find(p => p.id === e.target.value); if (preset) choose(preset); }}><option value="__custom">＋ 自定义 OpenAI 兼容 API</option>{apiPresets.map(p => <option key={p.id} value={p.id}>{p.providerLabel} · {p.model}</option>)}</select></label>
          <label>API 接口地址<input value={draft.baseUrl} disabled={locked} onChange={e => { selectionRef.current += 1; setApiModels([]); setDraft({ ...draft, baseUrl: e.target.value }); }} placeholder="https://api.example.com/v1" /></label>
          <label>API Key<input type="password" autoComplete="off" value={draft.apiKey} disabled={locked} onChange={e => setDraft({ ...draft, apiKey: e.target.value })} placeholder="输入密钥；已有配置可留空沿用" /></label>
          <button type="button" className="secondary" disabled={locked} onClick={async () => {
            const revision = selectionRef.current;
            setBusy(true);
            try {
              const found = await window.hermes.discoverModels(presetFromDraft({ ...draft, model: draft.model || "catalog" }), draft.apiKey);
              if (selectionRef.current !== revision) return;
              setApiModels(found.models ?? []);
              setResult({ tone: found.ok ? "idle" : "error", text: found.ok ? `读取到 ${found.models?.length ?? 0} 个模型，请在模型输入框选择。` : found.reason ?? "请手动填写模型名称。" });
            } catch { setResult({ tone: "error", text: "读取失败，请手动填写模型名称。" }); }
            finally { setBusy(false); }
          }}>读取可用模型</button>
          <label>模型名称<input list="model-center-api-models" value={draft.model} disabled={locked} onChange={e => setDraft({ ...draft, model: e.target.value })} placeholder="选择或输入服务商提供的模型 ID" /></label>
          <datalist id="model-center-api-models">{apiModels.map(model => <option key={model} value={model} />)}</datalist>
          <small>Hugging Face 等 API 服务使用各自的密钥。密钥在本机加密保存，并同步至当前 Agent 的运行配置。</small>
        </> : <p>正在读取模型配置…</p>}
        <div className="model-actions"><button type="button" disabled={locked || !draft?.model.trim()} onClick={() => void save(true)}>{busy ? "正在处理…" : "测试并连接"}</button><button type="button" className="secondary" disabled={locked || !draft?.model.trim()} onClick={() => void save(false)}>保存配置</button></div>
      </div>
      <aside className="model-center-summary">
        <div className="active-model-facts"><small>当前已保存 · {names[agentId].name}</small><b>{configured?.model || "正在读取"}</b><span>{configured?.providerLabel || "ChatGPT / Codex"}</span></div>
        <div className={`model-connection-state ${result.tone}`} role="status" aria-live="polite"><span /><div><small>连接测试</small><b>{result.text}</b></div></div>
        {current?.running ? <p>当前 Agent 正在运行，请结束本轮后配置模型。</p> : null}
      </aside>
    </div>
  </section>;
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function MissingHermesNotice() {
  return (
    <section className="notice">
      <div>
        <p className="eyebrow">Setup required</p>
        <h2>这台电脑还没有可用的 Hermes CLI</h2>
        <p>安装 Hermes Agent 后，确认 `hermes` 位于 `~/.local/bin/hermes`、`/opt/homebrew/bin/hermes`、`/usr/local/bin/hermes` 或系统 PATH，然后重新打开 Hermes Console。</p>
      </div>
    </section>
  );
}

function GatewayPanel({ snapshot, onAction }: { snapshot: Snapshot | null; onAction: (action: "start" | "stop" | "restart" | "status") => void }) {
  return (
    <div className="stack">
      <section className="command-row">
        <button onClick={() => onAction("start")}>
          <PlugZap size={16} />
          Start
        </button>
        <button onClick={() => onAction("restart")}>
          <ListRestart size={16} />
          Restart
        </button>
        <button onClick={() => onAction("stop")}>
          <Activity size={16} />
          Stop
        </button>
      </section>
      <TextPanel icon={<PlugZap size={18} />} title="Gateway 状态" text={output(snapshot?.gateway)} />
    </div>
  );
}

function ToolsPanel({ snapshot }: { snapshot: Snapshot | null }) {
  return (
    <div className="stack">
      <VoiceChatPanel />
      <section className="grid two">
        <TextPanel compact icon={<Wrench size={18} />} title="工具集" text={output(snapshot?.tools)} />
        <TextPanel compact icon={<Sparkles size={18} />} title="技能" text={output(snapshot?.skills)} />
      </section>
    </div>
  );
}

function VoiceChatPanel() {
  const [voice, setVoice] = useState<RealtimeVoice>("marin");
  const [mode, setMode] = useState<"vad" | "push-to-talk">("vad");
  const [status, setStatus] = useState("未连接");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [messages, setMessages] = useState<VoiceMessage[]>([
    {
      id: "voice-ready",
      role: "system",
      text: "点击开始语音后，我会用实时语音与你对话，并在这里显示双方文字。",
      at: nowLabel()
    }
  ]);
  const [error, setError] = useState("");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => stopVoice, []);

  function addVoiceMessage(role: VoiceMessage["role"], text: string) {
    setMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random()}`,
        role,
        text,
        at: nowLabel()
      }
    ]);
  }

  function appendAssistantDelta(delta: string) {
    if (!delta) {
      return;
    }

    setMessages((current) => {
      const last = current[current.length - 1];
      if (last?.role === "assistant") {
        return [...current.slice(0, -1), { ...last, text: `${last.text}${delta}` }];
      }
      return [
        ...current,
        {
          id: `${Date.now()}-${Math.random()}`,
          role: "assistant",
          text: delta,
          at: nowLabel()
        }
      ];
    });
  }

  function sendRealtimeEvent(payload: Record<string, unknown>) {
    const channel = channelRef.current;
    if (channel?.readyState === "open") {
      channel.send(JSON.stringify(payload));
    }
  }

  function handleRealtimeEvent(raw: string) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = String(event.type ?? "");
    if (type === "session.created" || type === "session.updated") {
      setStatus("已连接，正在听你说话");
    }
    if (type === "input_audio_buffer.speech_started") {
      setSpeaking(true);
      setStatus("正在听你说话");
    }
    if (type === "input_audio_buffer.speech_stopped") {
      setSpeaking(false);
      setStatus("正在生成回复");
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      const transcript = typeof event.transcript === "string" ? event.transcript.trim() : "";
      if (transcript) {
        addVoiceMessage("user", transcript);
      }
    }
    if (type === "response.audio_transcript.delta" || type === "response.text.delta" || type === "response.output_text.delta") {
      appendAssistantDelta(typeof event.delta === "string" ? event.delta : "");
    }
    if (type === "response.done") {
      setStatus("已连接，正在听你说话");
    }
    if (type === "error") {
      const detail = event.error && typeof event.error === "object" && "message" in event.error ? String((event.error as { message?: unknown }).message) : "Realtime 连接返回错误。";
      setError(detail);
      setStatus("连接错误");
    }
  }

  async function startVoice() {
    setConnecting(true);
    setError("");
    setStatus("正在创建 Realtime 会话");
    try {
      const session = await window.hermes.createRealtimeSession({ voice, mode });
      if (!session.ok) {
        throw new Error(session.reason);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      peer.onconnectionstatechange = () => {
        setStatus(peer.connectionState === "connected" ? "已连接，正在听你说话" : `连接状态：${peer.connectionState}`);
        setConnected(peer.connectionState === "connected");
      };
      peer.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
          void audioRef.current.play().catch(() => undefined);
        }
      };

      stream.getTracks().forEach((track) => {
        track.enabled = mode === "vad";
        peer.addTrack(track, stream);
      });
      setMuted(mode !== "vad");

      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onopen = () => {
        setStatus(mode === "vad" ? "已连接，正在听你说话" : "已连接，按住说话");
        addVoiceMessage("system", `语音会话已启动：${session.model} / ${session.voice}`);
      };
      channel.onmessage = (event) => handleRealtimeEvent(String(event.data));
      channel.onerror = () => {
        setError("Realtime data channel 连接异常。");
        setStatus("连接错误");
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.clientSecret}`,
          "Content-Type": "application/sdp"
        },
        body: offer.sdp
      });
      const answerSdp = await sdpResponse.text();
      if (!sdpResponse.ok) {
        throw new Error(answerSdp || `Realtime WebRTC 连接失败：HTTP ${sdpResponse.status}`);
      }
      await peer.setRemoteDescription({
        type: "answer",
        sdp: answerSdp
      });
      setConnected(true);
    } catch (err) {
      stopVoice();
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("未连接");
      addVoiceMessage("system", message);
    } finally {
      setConnecting(false);
    }
  }

  function stopVoice() {
    channelRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    setConnected(false);
    setConnecting(false);
    setMuted(false);
    setSpeaking(false);
    setStatus("未连接");
  }

  function toggleMute() {
    const nextMuted = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
    setStatus(nextMuted ? "麦克风已静音" : "已连接，正在听你说话");
  }

  function cancelResponse() {
    sendRealtimeEvent({ type: "response.cancel" });
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => undefined);
    }
    setStatus("已打断，继续说即可");
  }

  function holdToTalk(active: boolean) {
    if (mode !== "push-to-talk" || !connected) {
      return;
    }
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = active;
    });
    setMuted(!active);
    setStatus(active ? "正在录音" : "正在生成回复");
    if (!active) {
      sendRealtimeEvent({ type: "input_audio_buffer.commit" });
      sendRealtimeEvent({ type: "response.create" });
    }
  }

  return (
    <section className="voice-panel">
      <div className="voice-hero">
        <div>
          <p className="eyebrow">Realtime voice</p>
          <h2>语音对话</h2>
          <span>{status}</span>
        </div>
        <div className={speaking ? "voice-orb speaking" : connected ? "voice-orb live" : "voice-orb"}>
          <Radio size={30} />
        </div>
      </div>

      <div className="voice-controls">
        <label>
          <Volume2 size={15} />
          <select value={voice} onChange={(event) => setVoice(event.target.value as RealtimeVoice)} disabled={connected || connecting}>
            {realtimeVoices.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <div className="voice-toggle" role="group" aria-label="语音模式">
          <button className={mode === "vad" ? "selected" : ""} onClick={() => setMode("vad")} disabled={connected || connecting}>
            自动
          </button>
          <button className={mode === "push-to-talk" ? "selected" : ""} onClick={() => setMode("push-to-talk")} disabled={connected || connecting}>
            按住说话
          </button>
        </div>
        {!connected ? (
          <button className="primary-action" onClick={startVoice} disabled={connecting}>
            {connecting ? <LoaderCircle className="spin" size={16} /> : <Mic size={16} />}
            开始语音
          </button>
        ) : (
          <>
            <button onClick={toggleMute}>{muted ? <MicOff size={16} /> : <Mic size={16} />}{muted ? "取消静音" : "静音"}</button>
            <button onClick={cancelResponse}>
              <CircleStop size={16} />
              打断
            </button>
            <button onClick={stopVoice}>
              <Pause size={16} />
              停止
            </button>
          </>
        )}
      </div>

      {mode === "push-to-talk" && connected ? (
        <button
          className="hold-button"
          onPointerDown={() => holdToTalk(true)}
          onPointerUp={() => holdToTalk(false)}
          onPointerLeave={() => holdToTalk(false)}
        >
          <Mic size={18} />
          按住说话
        </button>
      ) : null}

      {error ? <div className="voice-error">{error}</div> : null}

      <div className="voice-transcript">
        {messages.map((message) => (
          <article className={`voice-message ${message.role}`} key={message.id}>
            <span>{message.role === "user" ? "你" : message.role === "assistant" ? "Hermes Voice" : "Console"} · {message.at}</span>
            <p>{message.text}</p>
          </article>
        ))}
      </div>
      <audio ref={audioRef} autoPlay />
    </section>
  );
}

function SecurityPanel({ status }: { status?: StatusSummary }) {
  const checks = [
    "写操作全部通过 Hermes CLI 执行，避免绕开 Hermes 的审批系统。",
    "前端不接触 shell，只能调用白名单 IPC。",
    "状态输出会自动隐藏疑似 API key 和长 token。",
    "建议保持 approvals.mode 为 manual 或 smart。"
  ];

  return (
    <div className="stack">
      <section className="hero-band security">
        <div>
          <p className="eyebrow">Security posture</p>
          <h2>本地优先，显式控制</h2>
          <p className="soft">{status?.project ?? "Hermes Home 尚未读取"}</p>
        </div>
        <div className="hero-symbol">
          <KeyRound size={34} />
        </div>
      </section>
      <section className="checklist">
        {checks.map((check) => (
          <article key={check}>
            <ShieldCheck size={18} />
            <span>{check}</span>
          </article>
        ))}
      </section>
    </div>
  );
}

function TextPanel({
  icon,
  title,
  text,
  action,
  compact = false
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "panel compact" : "panel"}>
      <header>
        <div className="panel-title">
          {icon}
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      <div className="output">
        {lines(text, compact ? 18 : 42).map((line, index) => (
          <p key={`${line}-${index}`}>{line}</p>
        ))}
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
