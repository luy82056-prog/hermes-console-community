import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { InsightsHome } from "./InsightsPanel";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  Clock3,
  FileText,
  History,
  LoaderCircle,
  MessageSquare,
  Radio,
  Search,
  Sparkles,
  Target
} from "lucide-react";

export type PersonalAgentDestination = "sessions" | "cron" | "heartprint" | "knowledge" | "growth";

export type PersonalAgentSessionItem = {
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

type HomeTask = {
  id: string;
  title: string;
  body?: string;
  status?: string;
  assignee?: string | null;
  updated_at?: string;
  created_at?: string;
};

type HomeBoard = { slug: string; name: string; is_current?: boolean };
type HomeJob = {
  id: string;
  name?: string;
  prompt?: string;
  enabled?: boolean;
  state?: string;
  schedule_display?: string;
  next_run_at?: string | null;
};
type HomeMemory = {
  id: string;
  category: "fact" | "preference" | "goal" | "boundary";
  text: string;
  updatedAt: string;
};
type HomeAgent = { agentId: string; running: boolean; paused: boolean; startedAt: number; sessionId: string | null };
type HomeKnowledge = {
  enabled: boolean;
  captureCount: number;
  knowledgeCount: number;
  lastCapture: { title: string; at: string; outcome: "completed" | "cancelled" | "failed" } | null;
};

// A read-only subset of the existing preload bridge keeps the homepage independent
// of App.tsx's model, chat, and runtime implementation types.
export type PersonalAgentHomeBridge = {
  kanbanBoards: () => Promise<{ ok: boolean; data: HomeBoard[]; reason?: string }>;
  kanbanList: (board?: string) => Promise<{ ok: boolean; data: HomeTask[]; reason?: string }>;
  schedulerList: () => Promise<{ ok: boolean; jobs: HomeJob[]; reason?: string; output?: string }>;
  sessionHistory: (agentId?: string, limit?: number) => Promise<{ ok: boolean; sessions: PersonalAgentSessionItem[]; reason?: string }>;
  heartprintGet: (range?: "7d" | "30d" | "all") => Promise<{ ok: boolean; profile: { items: HomeMemory[]; updatedAt: string }; reason?: string }>;
  secondBrainStatus: () => Promise<HomeKnowledge>;
  agentStates: () => Promise<HomeAgent[]>;
};

export type PersonalAgentHomeProps = {
  bridge: PersonalAgentHomeBridge;
  onCompose: (prompt: string) => void;
  onOpenSession: (item: PersonalAgentSessionItem) => void;
  onNavigate: (destination: PersonalAgentDestination) => void;
  refreshKey?: string;
  unavailable?: boolean;
};

type Resource<T> = { phase: "loading" | "ready" | "error"; data: T | null; error: string };
type WorkSummary = { board: HomeBoard; tasks: HomeTask[] };
type TaskFilter = "running" | "waiting" | "done";

const initialResource = <T,>(): Resource<T> => ({ phase: "loading", data: null, error: "" });
const memoryLabels: Record<HomeMemory["category"], string> = { fact: "关于你", preference: "协作偏好", goal: "长期目标", boundary: "明确边界" };
const agentLabels: Record<string, string> = {
  parent: "主 Agent",
  "child-a": "研究 Agent",
  "child-b": "执行 Agent",
  consoleparent: "主 Agent",
  consolea: "研究 Agent",
  consoleb: "执行 Agent"
};
const taskLabels: Record<string, string> = {
  triage: "收件箱",
  todo: "待规划",
  ready: "待执行",
  scheduled: "等待时间",
  running: "进行中",
  review: "待审核",
  blocked: "待处理",
  done: "已完成",
  archived: "已归档"
};
const filters: Array<{ id: TaskFilter; label: string }> = [
  { id: "running", label: "进行中" },
  { id: "waiting", label: "待处理" },
  { id: "done", label: "已完成" }
];
const templates = [
  { title: "安排今天", description: "从目标里找出下一步", icon: Target, prompt: "帮我安排今天：先问我今天的时间、目标和必须完成的事，再结合你已了解的长期目标，整理 3 个优先行动和一个可执行的时间安排。" },
  { title: "研究一个主题", description: "查资料，形成自己的判断", icon: Search, prompt: "我想研究一个主题。先问我主题是什么、希望解决什么问题和已有的线索，再查找可信来源，比较不同观点，给出结论、依据和仍然不确定的部分。" },
  { title: "复盘并沉淀", description: "让一次经历成为长期记忆", icon: FileText, prompt: "帮我复盘最近的一件事：先问我发生了什么、预期与实际结果，再一起找出经验和下一步行动，并整理成适合沉淀到知识库的笔记。" }
];

function taskGroup(task: HomeTask): TaskFilter {
  if (task.status === "running") return "running";
  if (task.status === "done") return "done";
  return "waiting";
}

function dateLabel(value?: string | null) {
  if (!value) return "尚未安排";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待确认";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function ResourceNotice<T>({ resource, empty, detail }: { resource: Resource<T>; empty: string; detail?: string }) {
  if (resource.phase === "loading") {
    return <div className="pa-empty pa-loading" role="status"><LoaderCircle size={18} className="pa-spin" /><span>正在读取本地数据…</span></div>;
  }
  if (resource.phase === "error") {
    return <div className="pa-error" role="alert"><strong>暂时无法读取</strong><span>{resource.error}</span></div>;
  }
  return <div className="pa-empty"><strong>{empty}</strong>{detail ? <span>{detail}</span> : null}</div>;
}

export function PersonalAgentHome({ bridge, onCompose, onOpenSession, onNavigate, refreshKey, unavailable = false }: PersonalAgentHomeProps) {
  const [prompt, setPrompt] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("waiting");
  const [work, setWork] = useState<Resource<WorkSummary>>(initialResource);
  const [sessions, setSessions] = useState<Resource<PersonalAgentSessionItem[]>>(initialResource);
  const [memory, setMemory] = useState<Resource<HomeMemory[]>>(initialResource);
  const [jobs, setJobs] = useState<Resource<HomeJob[]>>(initialResource);
  const [knowledge, setKnowledge] = useState<Resource<HomeKnowledge>>(initialResource);
  const [agents, setAgents] = useState<Resource<HomeAgent[]>>(initialResource);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    let requestId = 0;
    let refreshing = false;

    async function refresh() {
      if (refreshing || !active) return;
      refreshing = true;
      const currentId = ++requestId;
      const isCurrent = () => active && currentId === requestId;
      async function read<T>(loader: () => Promise<T>, commit: Dispatch<SetStateAction<Resource<T>>>) {
        if (isCurrent()) commit((previous) => previous.data === null ? { phase: "loading", data: null, error: "" } : previous);
        try {
          if (unavailable || !bridge) throw new Error("Hermes 尚未连接，请先在观测台检查本机配置。");
          const data = await loader();
          if (isCurrent()) commit({ phase: "ready", data, error: "" });
        } catch (error) {
          if (isCurrent()) commit({ phase: "error", data: null, error: errorMessage(error) });
        }
      }

      // Each resource commits as it arrives; a slow CLI call cannot hide local
      // memories or prevent a separate source's error from being shown.
      await Promise.allSettled([
        read(async () => {
          const boards = await bridge.kanbanBoards();
          if (!boards.ok) throw new Error(boards.reason || "无法读取 Hermes 看板。");
          const board = boards.data.find((item) => item.is_current) ?? boards.data[0] ?? { slug: "default", name: "默认看板" };
          const result = await bridge.kanbanList(board.slug);
          if (!result.ok) throw new Error(result.reason || "无法读取 Hermes 任务。");
          return { board, tasks: result.data };
        }, setWork),
        read(async () => {
          const result = await bridge.sessionHistory("parent", 30);
          if (!result.ok) throw new Error(result.reason || "无法读取主 Agent 的对话历史。");
          return result.sessions.filter((session) => !/^\s*\[IMPORTANT:.*scheduled/i.test(session.title)).slice(0, 4);
        }, setSessions),
        read(async () => {
          const result = await bridge.heartprintGet("30d");
          if (!result.ok) throw new Error(result.reason || "无法读取心迹。");
          return [...result.profile.items].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
        }, setMemory),
        read(async () => {
          const result = await bridge.schedulerList();
          if (!result.ok) throw new Error(result.reason || result.output || "无法读取例行任务。");
          return result.jobs.filter((job) => job.enabled === true).sort((left, right) => {
            const leftTime = left.next_run_at ? Date.parse(left.next_run_at) : Infinity;
            const rightTime = right.next_run_at ? Date.parse(right.next_run_at) : Infinity;
            return leftTime - rightTime;
          });
        }, setJobs),
        read(() => bridge.secondBrainStatus(), setKnowledge),
        read(() => bridge.agentStates(), setAgents)
      ]);
      refreshing = false;
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      requestId += 1;
      window.clearInterval(timer);
    };
  }, [bridge, refreshKey, unavailable]);

  const tasks = (work.data?.tasks ?? []).filter((task) => task.status !== "archived");
  const filteredTasks = tasks.filter((task) => taskGroup(task) === filter);
  const runningAgents = agents.data?.filter((agent) => agent.running || agent.paused) ?? [];
  const emptyTasks = tasks.length === 0 ? "把第一件事交给 Hermes" : filter === "running" ? "目前没有进行中的任务" : filter === "done" ? "这里还没有已完成的任务" : "当前没有待处理的任务";

  function useTemplate(value: string) {
    setPrompt(value);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  return <div className="pa-home">
    <InsightsHome />
    <section className="pa-hero">
      <p className="pa-eyebrow"><Sparkles size={14} /> PERSONAL AGENT</p>
      <h2>把下一件事<br />交给 Hermes。</h2>
      <p className="pa-subtitle">从一个想法开始，让对话、行动与记忆在这里连起来。</p>
    </section>

    <form className="pa-composer" onSubmit={(event) => {
      event.preventDefault();
      const value = prompt.trim();
      if (value && !unavailable) onCompose(value);
    }}>
      <label className="pa-composer-label" htmlFor="pa-prompt">你想一起完成什么？</label>
      <textarea ref={composerRef} id="pa-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="整理今天的重点、研究一个想法，或说说最近发生的事…" rows={3} disabled={unavailable} />
      <div className="pa-composer-footer">
        <span className="pa-composer-hint"><MessageSquare size={14} />进入对话后，你可以确认并发送。</span>
        <button className="pa-submit" type="submit" disabled={!prompt.trim() || unavailable}>交给 Hermes <ArrowRight size={16} /></button>
      </div>
    </form>

    <div className="pa-template-grid" aria-label="快速开始">
      {templates.map((template) => {
        const Icon = template.icon;
        return <button className="pa-template" type="button" key={template.title} onClick={() => useTemplate(template.prompt)} disabled={unavailable}>
          <Icon size={17} /><span><strong className="pa-template-title">{template.title}</strong><small className="pa-template-desc">{template.description}</small></span><ArrowRight size={14} />
        </button>;
      })}
    </div>

    <div className="pa-columns">
      <div className="pa-main">
        <section className="pa-card" aria-labelledby="pa-work-heading">
          <header className="pa-card-header"><div><h3 className="pa-card-title" id="pa-work-heading">手头的事</h3><p className="pa-card-subtitle">{work.data ? work.data.board.name || work.data.board.slug : "Hermes 当前看板"}</p></div><button className="pa-card-action" type="button" onClick={() => onNavigate("cron")}>任务中心 <ArrowRight size={14} /></button></header>
          <div className="pa-filters" aria-label="筛选任务状态">
            {filters.map((item) => <button className={filter === item.id ? "is-active" : ""} type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span className="pa-count">{work.phase === "ready" ? tasks.filter((task) => taskGroup(task) === item.id).length : "—"}</span></button>)}
          </div>
          <div className="pa-card-body pa-task-list">
            {work.phase === "ready" && filteredTasks.length > 0 ? filteredTasks.slice(0, 6).map((task) => <button className="pa-row" type="button" key={task.id} onClick={() => onNavigate("cron")}>
              <span className="pa-row-icon">{taskGroup(task) === "done" ? <Check size={16} /> : task.status === "running" ? <Radio size={16} /> : <Clock3 size={16} />}</span>
              <span><strong className="pa-row-title">{task.title || "未命名任务"}</strong><small className="pa-row-meta">{task.assignee ? agentLabels[task.assignee] ?? task.assignee : "待分配"}{task.updated_at ? ` · ${dateLabel(task.updated_at)}` : ""}</small></span>
              <span className={`pa-status is-${taskGroup(task) === "waiting" ? "waiting" : taskGroup(task)}`}>{taskLabels[task.status || "todo"] ?? task.status}</span>
            </button>) : <ResourceNotice resource={work} empty={emptyTasks} detail={tasks.length === 0 ? "在任务中心创建目标，Hermes 会记录执行状态。" : undefined} />}
          </div>
          {filteredTasks.length > 6 ? <button className="pa-link-row" type="button" onClick={() => onNavigate("cron")}>查看全部 {filteredTasks.length} 个任务 <ArrowRight size={14} /></button> : null}
        </section>

        <section className="pa-card" aria-labelledby="pa-sessions-heading">
          <header className="pa-card-header"><div><h3 className="pa-card-title" id="pa-sessions-heading">最近对话</h3><p className="pa-card-subtitle">回看主 Agent 的聊天记录</p></div><button className="pa-card-action" type="button" onClick={() => onNavigate("sessions")}>全部对话 <ArrowRight size={14} /></button></header>
          <div className="pa-card-body pa-session-list">
            {sessions.phase === "ready" && sessions.data?.length ? sessions.data.slice(0, 4).map((session) => <button className="pa-row" type="button" key={`${session.agentId}:${session.id}`} onClick={() => onOpenSession(session)}>
              <span className="pa-row-icon"><History size={17} /></span><span><strong className="pa-row-title">{session.title || "未命名对话"}</strong>{session.source === "session" && session.preview ? <span className="pa-row-preview">{session.preview}</span> : null}<small className="pa-row-meta">{session.source === "request-dump" ? "请求记录 · " : ""}{dateLabel(session.updatedAt)} · {session.messageCount} 条消息</small></span><ArrowRight className="pa-row-action" size={15} />
            </button>) : <ResourceNotice resource={sessions} empty="你的第一段对话，从这里开始" detail="聊过的想法会留在本机，方便随时回看。" />}
          </div>
        </section>

        <section className="pa-card pa-running-card" aria-labelledby="pa-agents-heading">
          <header className="pa-card-header"><div><h3 className="pa-card-title" id="pa-agents-heading">Agent 状态</h3><p className="pa-card-subtitle">来自本机运行时</p></div><button className="pa-card-action" type="button" onClick={() => onNavigate("sessions")}>打开工作区 <ArrowRight size={14} /></button></header>
          <div className="pa-card-body">
            {agents.phase === "ready" && runningAgents.length ? runningAgents.slice(0, 3).map((agent) => <button className="pa-row" type="button" key={agent.agentId} onClick={() => onNavigate("sessions")}>
              <span className="pa-row-icon"><Radio size={17} /></span><span><strong className="pa-row-title">{agentLabels[agent.agentId] ?? agent.agentId}</strong><small className="pa-row-meta">{agent.startedAt > 0 ? `开始于 ${dateLabel(new Date(agent.startedAt).toISOString())}` : "已连接本地运行时"}</small></span><span className={`pa-status ${agent.paused ? "is-waiting" : "is-running"}`}>{agent.paused ? "已暂停" : "运行中"}</span>
            </button>) : <ResourceNotice resource={agents} empty="目前没有 Agent 正在执行" detail="准备好下一件事，就可以从上方开始。" />}
          </div>
        </section>
      </div>

      <aside className="pa-aside">
        <section className="pa-card" aria-labelledby="pa-memory-heading">
          <header className="pa-card-header"><div><h3 className="pa-card-title" id="pa-memory-heading"><Sparkles size={16} />越来越了解你</h3><p className="pa-card-subtitle">心迹里的稳定记忆</p></div><button className="pa-card-action" type="button" onClick={() => onNavigate("heartprint")} aria-label="查看心迹"><ArrowRight size={15} /></button></header>
          <div className="pa-card-body">
            {memory.phase === "ready" && memory.data?.length ? memory.data.slice(0, 3).map((item) => <article className="pa-memory" key={item.id}><span className="pa-memory-label">{memoryLabels[item.category]}</span><p className="pa-memory-content">{item.text}</p></article>) : <ResourceNotice resource={memory} empty="了解，从你的表达开始" detail="聊聊你的目标、偏好和边界，精炼后的记忆会留在心迹。" />}
          </div>
          <button className="pa-link-row" type="button" onClick={() => onNavigate("growth")}>回看我的成长 <ArrowRight size={14} /></button>
        </section>

        <section className="pa-card" aria-labelledby="pa-jobs-heading">
          <header className="pa-card-header"><div><h3 className="pa-card-title" id="pa-jobs-heading"><CalendarClock size={16} />例行任务</h3><p className="pa-card-subtitle">已启用的计划</p></div><button className="pa-card-action" type="button" onClick={() => onNavigate("cron")} aria-label="管理例行任务"><ArrowRight size={15} /></button></header>
          <div className="pa-card-body pa-routine-list">
            {jobs.phase === "ready" && jobs.data?.length ? jobs.data.slice(0, 3).map((job) => <button className="pa-row" type="button" key={job.id} onClick={() => onNavigate("cron")}><span className="pa-row-icon"><Clock3 size={16} /></span><span><strong className="pa-row-title">{job.name || job.prompt?.split("\n")[0] || "未命名计划"}</strong><small className="pa-row-meta">下一次 · {dateLabel(job.next_run_at)}</small>{job.schedule_display ? <small className="pa-row-meta">{job.schedule_display}</small> : null}</span></button>) : <ResourceNotice resource={jobs} empty="还没有启用的例行任务" detail="把重复的事设成计划，到了时间再处理。" />}
          </div>
        </section>

        <section className="pa-card" aria-labelledby="pa-knowledge-heading">
          <header className="pa-card-header"><div><h3 className="pa-card-title" id="pa-knowledge-heading"><BookOpen size={16} />让经验留下来</h3><p className="pa-card-subtitle">对话里的知识沉淀</p></div><button className="pa-card-action" type="button" onClick={() => onNavigate("knowledge")} aria-label="打开知识库"><ArrowRight size={15} /></button></header>
          <div className="pa-card-body">
            {knowledge.phase === "ready" && knowledge.data ? <>
              <div className="pa-knowledge-stats"><div className="pa-stat"><strong>{knowledge.data.knowledgeCount}</strong><span>知识笔记</span></div><div className="pa-stat"><strong>{knowledge.data.captureCount}</strong><span>沉淀记录</span></div></div>
              <p className="pa-card-subtitle">{knowledge.data.enabled ? "自动沉淀已开启" : "自动沉淀尚未开启"}</p>
              {knowledge.data.lastCapture ? <div className="pa-memory"><span className="pa-memory-label">最近记录 · {knowledge.data.lastCapture.outcome === "completed" ? "已完成" : knowledge.data.lastCapture.outcome === "cancelled" ? "已取消" : "未完成"}</span><p className="pa-memory-content">{knowledge.data.lastCapture.title}</p><small className="pa-row-meta">{dateLabel(knowledge.data.lastCapture.at)}</small></div> : <p className="pa-card-subtitle">完成一次对话后，让值得保留的内容成为下一次的起点。</p>}
            </> : <ResourceNotice resource={knowledge} empty="还没有知识沉淀" />}
          </div>
          <button className="pa-link-row" type="button" onClick={() => onNavigate("knowledge")}>打开知识库 <ArrowRight size={14} /></button>
        </section>
      </aside>
    </div>
  </div>;
}
