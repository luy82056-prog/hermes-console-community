import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  CircleStop,
  Database,
  Dumbbell,
  ExternalLink,
  HeartPulse,
  Leaf,
  LoaderCircle,
  MessageCircle,
  MoonStar,
  RefreshCcw,
  Save,
  Send,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type HealthRecord = {
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

type HealthInterviewMessage = {
  id: string;
  at: string;
  role: "user" | "assistant" | "system";
  text: string;
};

type HealthPersonalProfile = {
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

type HealthEvidenceSource = {
  id: string;
  title: string;
  organization: string;
  url: string;
  category: "sleep" | "activity" | "nutrition" | "strength" | "anatomy" | "medicine" | "tcm";
  summary: string;
  checkedAt: string;
  reachable: boolean | null;
};

type HealthPayload = {
  ok: boolean;
  urgent?: boolean;
  profile: {
    revision: number;
    updatedAt: string;
    personal: HealthPersonalProfile;
    records: HealthRecord[];
    interviews: HealthInterviewMessage[];
    evidence: HealthEvidenceSource[];
  };
  summary: {
    latest: HealthRecord | null;
    recordsThisWeek: number;
    sleepAverage: number | null;
    energyAverage: number | null;
    strengthDays: number;
    trainingMinutes: number;
    proteinRange: { minimum: number; maximum: number } | null;
    urgentRecent: boolean;
  };
};

type HealthBridge = {
  healthGet: () => Promise<HealthPayload>;
  healthUpdateProfile: (input: Partial<HealthPersonalProfile>) => Promise<HealthPayload>;
  healthAddRecord: (input: Omit<HealthRecord, "id" | "at">) => Promise<HealthPayload>;
  healthRefreshEvidence: () => Promise<HealthPayload>;
  healthStartInterview: (userText: string) => Promise<{ ok: boolean; reason?: string; startedAt?: number }>;
  healthArchiveInterview: (userText: string, assistantText: string) => Promise<HealthPayload & {
    assistantText: string;
    applied: string[];
    archiveSource: "model" | "local" | "mixed" | "none";
    urgent?: boolean;
  }>;
  agentState: (agentId?: string) => Promise<{ running: boolean; paused: boolean }>;
  interruptAgent: (agentId?: string) => Promise<{ ok: boolean; reason?: string }>;
  onAgentEvent: (callback: (event: {
    type: "start" | "session" | "stdout" | "stderr" | "error" | "close";
    agentId?: string;
    chunk?: string;
    signal?: string | null;
    hadOutput?: boolean;
  }) => void) => () => void;
  onHealthUpdated: (callback: () => void) => () => void;
  openExternal: (url: string) => Promise<unknown>;
};

const bridge = () => window.hermes as unknown as HealthBridge;

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function numberOrNull(value: string) {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) ? number : null;
}

function displayNumber(value: number | null, suffix = "") {
  return value === null ? "--" : `${value}${suffix}`;
}

function categoryLabel(category: HealthEvidenceSource["category"]) {
  return {
    sleep: "睡眠",
    activity: "活动",
    nutrition: "营养",
    strength: "力量",
    anatomy: "人体基础",
    medicine: "医学安全",
    tcm: "中医药"
  }[category];
}

function healthFieldLabel(field: string) {
  const labels: Record<string, string> = {
    birthYear: "出生年份",
    sex: "生理性别",
    heightCm: "身高",
    conditions: "健康关注",
    medications: "药物或补充剂",
    injuries: "旧伤与运动限制",
    dietaryRestrictions: "饮食限制",
    trainingExperience: "训练经验",
    date: "记录日期",
    weightKg: "体重",
    sleepHours: "睡眠时长",
    sleepQuality: "睡眠质量",
    energy: "精力",
    restingHeartRate: "静息心率",
    steps: "步数",
    trainingMinutes: "训练时长",
    strengthTraining: "力量训练",
    symptoms: "身体感受",
    note: "健康备注"
  };
  return labels[field] || field;
}

export function HealthPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [interviewOpen, setInterviewOpen] = useState(true);
  const [interviewInput, setInterviewInput] = useState("");
  const [interviewRunning, setInterviewRunning] = useState(false);
  const [interviewStream, setInterviewStream] = useState("");
  const [interviewError, setInterviewError] = useState("");
  const [lastApplied, setLastApplied] = useState<string[]>([]);
  const [lastArchiveSource, setLastArchiveSource] = useState<"model" | "local" | "mixed" | "none" | null>(null);
  const [draftProfile, setDraftProfile] = useState<HealthPersonalProfile | null>(null);
  const pendingInterviewRef = useRef("");
  const assistantStreamRef = useRef("");
  const [record, setRecord] = useState({
    date: localDate(),
    weightKg: "",
    sleepHours: "",
    sleepQuality: "",
    energy: "",
    restingHeartRate: "",
    steps: "",
    trainingMinutes: "",
    strengthTraining: false,
    symptoms: "",
    note: ""
  });

  async function refresh() {
    const next = await bridge().healthGet();
    setData(next);
    setDraftProfile(next.profile.personal);
  }

  useEffect(() => {
    void refresh();
    return bridge().onHealthUpdated(() => void refresh());
  }, []);

  useEffect(() => bridge().onAgentEvent((event) => {
    if (event.agentId !== "child-a" || !pendingInterviewRef.current) return;
    if (event.type === "start") {
      setInterviewRunning(true);
      return;
    }
    if (event.type === "stdout" && event.chunk) {
      assistantStreamRef.current += event.chunk;
      setInterviewStream(assistantStreamRef.current);
      return;
    }
    if (event.type === "error" && event.chunk) {
      setInterviewError(event.chunk);
      return;
    }
    if (event.type !== "close") return;

    const userText = pendingInterviewRef.current;
    const rawAssistant = assistantStreamRef.current || (event.signal === "cancelled" ? "本轮健康访谈已取消。" : "本轮没有返回可显示回复。");
    pendingInterviewRef.current = "";
    assistantStreamRef.current = "";
    setInterviewRunning(false);
    void bridge().healthArchiveInterview(userText, rawAssistant).then((next) => {
      setData(next);
      setDraftProfile(next.profile.personal);
      setLastApplied(next.applied);
      setLastArchiveSource(next.archiveSource);
      setInterviewStream("");
      if (next.urgent) {
        setInterviewError("你刚才提到的情况可能需要及时由医生评估；如果症状严重或正在加重，请立即就医。");
      }
    }).catch((error) => {
      setInterviewError(error instanceof Error ? error.message : String(error));
    });
  }), []);

  async function sendInterview() {
    const userText = interviewInput.trim();
    if (!userText || interviewRunning) return;
    setInterviewError("");
    setLastApplied([]);
    setLastArchiveSource(null);
    const state = await bridge().agentState("child-a");
    if (state.running) {
      setInterviewError("子 Agent A 正在处理另一项任务。等它完成或在会话页取消后，再开始健康访谈。");
      return;
    }
    pendingInterviewRef.current = userText;
    assistantStreamRef.current = "";
    setInterviewStream("");
    setInterviewRunning(true);
    setInterviewInput("");
    const result = await bridge().healthStartInterview(userText);
    if (!result.ok) {
      pendingInterviewRef.current = "";
      setInterviewRunning(false);
      setInterviewError(result.reason || "子 Agent A 暂时无法开始健康访谈。");
    }
  }

  async function cancelInterview() {
    const result = await bridge().interruptAgent("child-a");
    if (!result.ok) setInterviewError(result.reason || "当前没有可取消的健康访谈。");
  }

  const recentRecords = useMemo(
    () => [...(data?.profile.records || [])].slice(0, 7).reverse(),
    [data?.profile.records]
  );

  if (!data || !draftProfile) {
    return <div className="knowledge-loading"><LoaderCircle className="spin" /> 正在读取本地健康档案</div>;
  }

  const { summary, profile } = data;
  return <section className="health-page">
    <header className="health-hero">
      <div>
        <p className="eyebrow">Private health companion</p>
        <h2>健康与精力</h2>
        <p>记录事实，观察趋势，再做小幅调整。这里提供循证健康协作，不替代医生诊断、检查或处方。</p>
      </div>
      <div className="health-hero-actions">
        <span><ShieldCheck size={16} />档案文件仅存本机</span>
        <div>
          <button className="health-interview-entry" onClick={() => setInterviewOpen((value) => !value)}><MessageCircle size={15} />与子 Agent A 聊聊</button>
          <button onClick={() => setProfileOpen((value) => !value)}>{profileOpen ? "收起档案" : "基础档案"}</button>
        </div>
      </div>
    </header>

    {summary.urgentRecent ? <div className="health-urgent">
      <AlertTriangle size={20} />
      <div><strong>近期记录中出现需要优先确认的症状</strong><p>如果胸痛、呼吸困难、昏厥、意识异常或其他严重症状正在发生，请立即联系急救或前往医院，不要等待 Agent 回复。</p></div>
    </div> : null}

    {interviewOpen ? <section className="health-interview">
      <header>
        <div className="health-interview-identity">
          <span><MessageCircle size={18} /></span>
          <div><p className="eyebrow">Guided health interview</p><h3>和子 Agent A 做一次健康访谈</h3><small>循证健康知识包已接入 · 按问题核验官方资料 · 每次只补问一两个关键问题</small></div>
        </div>
        <button className="icon-button" title="收起健康访谈" onClick={() => setInterviewOpen(false)}><ChevronUp size={17} /></button>
      </header>
      <div className="health-interview-body">
        {profile.interviews.length === 0 && !interviewStream ? <div className="health-interview-empty">
          <MessageCircle size={23} />
          <strong>不必先填表，直接说就好</strong>
          <p>例如：“昨晚睡了 6 小时，今天有点累，晚上准备练腿。”Agent 会整理明确事实，再询问真正缺少的项目。</p>
        </div> : null}
        {profile.interviews.slice(-20).map((item) => <article className={`health-interview-message ${item.role}`} key={item.id}>
          <header><span>{item.role === "user" ? "你" : item.role === "assistant" ? "子 Agent A" : "Console"}</span><time>{new Date(item.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></header>
          {item.role === "assistant"
            ? <div className="health-interview-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown></div>
            : <p>{item.text}</p>}
        </article>)}
        {interviewRunning ? <article className="health-interview-message assistant streaming">
          <header><span>子 Agent A</span><small>正在整理</small></header>
          <div className="health-interview-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{interviewStream.replace(/<health-update>[\s\S]*$/i, "").trim() || "正在理解你的情况..."}</ReactMarkdown></div>
        </article> : null}
      </div>
      {lastApplied.length ? <div className="health-archive-result">
        <Database size={15} />
        <span>
          本轮已同步：{lastApplied.map(healthFieldLabel).join("、")}
          <small>{lastArchiveSource === "local" ? "本地证据识别" : lastArchiveSource === "mixed" ? "Agent + 本地校验" : "Agent 结构化归档"}</small>
        </span>
      </div> : lastArchiveSource === "none" ? <div className="health-archive-result warning">
        <AlertTriangle size={15} />
        <span>对话已保存，但本轮没有识别出可以安全写入档案的明确数据。</span>
      </div> : null}
      {interviewError ? <div className="health-interview-error"><AlertTriangle size={15} />{interviewError}</div> : null}
      <div className="health-interview-composer">
        <textarea
          value={interviewInput}
          disabled={interviewRunning}
          onChange={(event) => setInterviewInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void sendInterview();
            }
          }}
          placeholder={interviewRunning ? "子 Agent A 正在回复..." : "说说最近的睡眠、精力、饮食、训练或不舒服的地方…"}
        />
        <button
          className={interviewRunning ? "health-interview-cancel" : "primary-command"}
          disabled={!interviewRunning && !interviewInput.trim()}
          onClick={() => void (interviewRunning ? cancelInterview() : sendInterview())}
          title={interviewRunning ? "取消本轮访谈" : "发送给子 Agent A"}
        >
          {interviewRunning ? <CircleStop size={19} /> : <Send size={18} />}
        </button>
      </div>
      <footer><ShieldCheck size={13} />发送即表示本轮健康内容会交给当前配置的子 Agent A；只有带原句证据的字段才会写入本地档案。</footer>
    </section> : <button className="health-interview-collapsed" onClick={() => setInterviewOpen(true)}><MessageCircle size={17} /><span>打开健康访谈</span><ChevronDown size={16} /></button>}

    <div className="health-metrics">
      <article><span>最近体重</span><strong>{displayNumber(summary.latest?.weightKg ?? null, " kg")}</strong><small>{summary.latest?.date || "等待记录"}</small></article>
      <article><span>近 7 天睡眠</span><strong>{displayNumber(summary.sleepAverage, " h")}</strong><small>成年人通常至少 7 小时</small></article>
      <article><span>近 7 天精力</span><strong>{displayNumber(summary.energyAverage, " / 5")}</strong><small>{summary.recordsThisWeek} 天有记录</small></article>
      <article><span>力量训练</span><strong>{summary.strengthDays} 天</strong><small>{summary.trainingMinutes} 分钟总训练</small></article>
    </div>

    {profileOpen ? <form className="health-profile" onSubmit={async (event) => {
      event.preventDefault();
      setBusy(true);
      try {
        setData(await bridge().healthUpdateProfile(draftProfile));
        setMessage("基础档案已保存。后续建议会以这些限制条件为前提。");
      } finally {
        setBusy(false);
      }
    }}>
      <div className="section-toolbar"><div><p className="eyebrow">Health baseline</p><h3>基础档案</h3><p>慢性病、药物和旧伤会影响训练与饮食建议。没有把握的地方可以暂时留空。</p></div></div>
      <div className="health-profile-grid">
        <label>出生年份<input type="number" min="1900" max={new Date().getFullYear()} value={draftProfile.birthYear ?? ""} onChange={(event) => setDraftProfile({ ...draftProfile, birthYear: numberOrNull(event.target.value) })} /></label>
        <label>生理性别<select value={draftProfile.sex} onChange={(event) => setDraftProfile({ ...draftProfile, sex: event.target.value as HealthPersonalProfile["sex"] })}><option value="unspecified">暂不填写</option><option value="male">男</option><option value="female">女</option><option value="other">其他</option></select></label>
        <label>身高（cm）<input type="number" min="80" max="250" value={draftProfile.heightCm ?? ""} onChange={(event) => setDraftProfile({ ...draftProfile, heightCm: numberOrNull(event.target.value) })} /></label>
        <label>训练经验<select value={draftProfile.trainingExperience} onChange={(event) => setDraftProfile({ ...draftProfile, trainingExperience: event.target.value as HealthPersonalProfile["trainingExperience"] })}><option value="new">刚开始</option><option value="regular">规律训练</option><option value="experienced">有系统经验</option></select></label>
        <label>每日提醒时间<input type="time" value={draftProfile.checkInTime} onChange={(event) => setDraftProfile({ ...draftProfile, checkInTime: event.target.value })} /></label>
        <label className="health-agent-sharing"><input type="checkbox" checked={draftProfile.shareSummaryWithAgents} onChange={(event) => setDraftProfile({ ...draftProfile, shareSummaryWithAgents: event.target.checked })} /><span>允许 Agent 读取最小健康摘要</span><small>开启后，摘要会随对话发送给当前模型；原始记录仍保留在本机。</small></label>
        <label className="wide">已知疾病或需关注指标<textarea value={draftProfile.conditions} onChange={(event) => setDraftProfile({ ...draftProfile, conditions: event.target.value })} placeholder="例如：高血压、血糖异常；没有可留空" /></label>
        <label className="wide">正在使用的药物或补充剂<textarea value={draftProfile.medications} onChange={(event) => setDraftProfile({ ...draftProfile, medications: event.target.value })} /></label>
        <label>旧伤或运动限制<textarea value={draftProfile.injuries} onChange={(event) => setDraftProfile({ ...draftProfile, injuries: event.target.value })} /></label>
        <label>饮食限制<textarea value={draftProfile.dietaryRestrictions} onChange={(event) => setDraftProfile({ ...draftProfile, dietaryRestrictions: event.target.value })} /></label>
      </div>
      <button className="primary-command" disabled={busy}><Save size={16} />保存基础档案</button>
    </form> : null}

    <div className="health-workbench">
      <form className="health-checkin" onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          const next = await bridge().healthAddRecord({
            date: record.date,
            weightKg: numberOrNull(record.weightKg),
            sleepHours: numberOrNull(record.sleepHours),
            sleepQuality: numberOrNull(record.sleepQuality),
            energy: numberOrNull(record.energy),
            restingHeartRate: numberOrNull(record.restingHeartRate),
            steps: numberOrNull(record.steps),
            trainingMinutes: numberOrNull(record.trainingMinutes),
            strengthTraining: record.strengthTraining,
            symptoms: record.symptoms,
            note: record.note
          });
          setData(next);
          setMessage(next.urgent ? "记录已保存。你填写的症状可能需要及时由医生评估。" : "今天的健康记录已保存。");
          setRecord({ ...record, symptoms: "", note: "" });
        } finally {
          setBusy(false);
        }
      }}>
        <div className="section-toolbar"><div><p className="eyebrow">Daily check-in</p><h3>今天怎么样</h3><p>只填你确实知道的项目。空白比猜测更有价值。</p></div><HeartPulse size={21} /></div>
        <div className="health-checkin-grid">
          <label>日期<input type="date" value={record.date} onChange={(event) => setRecord({ ...record, date: event.target.value })} /></label>
          <label>体重 kg<input type="number" step="0.1" min="20" max="400" value={record.weightKg} onChange={(event) => setRecord({ ...record, weightKg: event.target.value })} /></label>
          <label>睡眠小时<input type="number" step="0.1" min="0" max="24" value={record.sleepHours} onChange={(event) => setRecord({ ...record, sleepHours: event.target.value })} /></label>
          <label>睡眠质量<select value={record.sleepQuality} onChange={(event) => setRecord({ ...record, sleepQuality: event.target.value })}><option value="">未记录</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
          <label>今日精力<select value={record.energy} onChange={(event) => setRecord({ ...record, energy: event.target.value })}><option value="">未记录</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
          <label>静息心率<input type="number" min="25" max="240" value={record.restingHeartRate} onChange={(event) => setRecord({ ...record, restingHeartRate: event.target.value })} /></label>
          <label>步数<input type="number" min="0" max="200000" value={record.steps} onChange={(event) => setRecord({ ...record, steps: event.target.value })} /></label>
          <label>训练分钟<input type="number" min="0" max="600" value={record.trainingMinutes} onChange={(event) => setRecord({ ...record, trainingMinutes: event.target.value })} /></label>
          <label className="health-strength"><input type="checkbox" checked={record.strengthTraining} onChange={(event) => setRecord({ ...record, strengthTraining: event.target.checked })} /><span>今天进行了力量训练</span></label>
          <label className="wide">症状或不适<textarea value={record.symptoms} onChange={(event) => setRecord({ ...record, symptoms: event.target.value })} placeholder="描述时间、部位、程度和变化；严重症状请直接就医" /></label>
          <label className="wide">备注<textarea value={record.note} onChange={(event) => setRecord({ ...record, note: event.target.value })} placeholder="饮食、压力、训练感受或其他值得观察的事情" /></label>
        </div>
        <button className="primary-command" disabled={busy}><Check size={16} />{busy ? "保存中..." : "保存今日记录"}</button>
        {message ? <p className="health-message">{message}</p> : null}
      </form>

      <aside className="health-trend">
        <div className="section-toolbar"><div><p className="eyebrow">Seven-day signal</p><h3>近期节奏</h3><p>只看变化，不把单日波动当成结论。</p></div><Activity size={20} /></div>
        <div className="health-week">
          {recentRecords.length ? recentRecords.map((item) => <article key={item.id}>
            <time>{item.date.slice(5)}</time>
            <div title={`睡眠 ${displayNumber(item.sleepHours, "h")}`}><span>睡</span><i style={{ height: `${Math.min(100, (item.sleepHours || 0) / 9 * 100)}%` }} /></div>
            <div title={`精力 ${displayNumber(item.energy, "/5")}`}><span>能</span><i style={{ height: `${Math.min(100, (item.energy || 0) / 5 * 100)}%` }} /></div>
            <small>{item.strengthTraining ? "力量" : item.trainingMinutes ? `${item.trainingMinutes}m` : "休息"}</small>
          </article>) : <div className="health-empty">保存第一条记录后，这里会出现睡眠与精力趋势。</div>}
        </div>
      </aside>
    </div>

    <section className="health-plan">
      <div className="section-toolbar"><div><p className="eyebrow">Evidence-based baseline</p><h3>高精力与增肌的起步框架</h3><p>先连续记录两周，再根据真实趋势调整。以下是健康成年人的一般起点，不是个人医疗处方。</p></div><Sparkles size={20} /></div>
      <div className="health-plan-grid">
        <article><MoonStar size={20} /><strong>睡眠优先</strong><p>把固定起床时间作为锚点，先争取每晚至少 7 小时；连续疲劳时不要用更高训练量硬顶。</p><span>CDC · 睡眠</span></article>
        <article><Dumbbell size={20} /><strong>力量训练</strong><p>先做到每周至少 2 次、覆盖主要肌群并逐步增加负荷。增肌阶段再逐渐接近每肌群每周约 10 组。</p><span>ACSM 2026</span></article>
        <article><Activity size={20} /><strong>活动与心肺</strong><p>逐步积累每周 150–300 分钟中等强度活动；工作中减少久坐，任何活动都比完全不动更好。</p><span>WHO 2020</span></article>
        <article><Leaf size={20} /><strong>饮食基础</strong><p>先保证食物多样和规律进餐。{summary.proteinRange ? `按最近体重估算，规律训练者蛋白质参考约 ${summary.proteinRange.minimum}–${summary.proteinRange.maximum}g/日。` : "填写体重后可显示训练人群的蛋白质参考范围。"}有肾脏疾病等情况时先咨询医生。</p><span>中国营养学会 · ACSM</span></article>
      </div>
    </section>

    <section className="health-evidence">
      <div className="section-toolbar">
        <div><p className="eyebrow">Verified knowledge</p><h3>循证知识源</h3><p>只保留官方机构与专业学会来源。检查更新只验证原始页面，不让未经审核的文章自动改写你的计划。</p></div>
        <button disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            setData(await bridge().healthRefreshEvidence());
            setMessage("已重新检查权威来源。");
          } finally {
            setBusy(false);
          }
        }}><RefreshCcw className={busy ? "spin" : ""} size={16} />检查更新</button>
      </div>
      <div className="health-source-list">
        {profile.evidence.map((source) => <button key={source.id} onClick={() => void bridge().openExternal(source.url)}>
          <span>{categoryLabel(source.category)}</span>
          <div><strong>{source.title}</strong><small>{source.organization}</small><p>{source.summary}</p></div>
          <footer><i className={source.reachable === false ? "offline" : source.reachable ? "online" : ""} />{source.checkedAt ? `核验 ${new Date(source.checkedAt).toLocaleDateString("zh-CN")}` : "等待首次核验"}<ExternalLink size={14} /></footer>
        </button>)}
      </div>
    </section>
  </section>;
}
