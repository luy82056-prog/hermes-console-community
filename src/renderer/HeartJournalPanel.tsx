import { useEffect, useState } from "react";
import { journalTopics, type JournalResult, type JournalTopic } from "../shared/heart-journal";

export function HeartJournalPanel() {
  const [data, setData] = useState<JournalResult | null>(null);
  const [topic, setTopic] = useState<JournalTopic | "all">("all");
  const [range, setRange] = useState("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(30);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await window.hermes.journalGet();
        if (active) { setData(next); setError(""); }
      } catch (e) { if (active) setError(`心迹读取失败：${String(e)}`); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const unsubscribe = window.hermes.onHeartprintUpdated(() => void refresh());
    return () => { active = false; clearInterval(timer); unsubscribe(); };
  }, []);
  useEffect(() => setLimit(30), [topic, range, query]);
  const cutoff = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
  const entries = (data?.entries ?? []).filter(e => (topic === "all" || e.topic === topic) && Date.parse(e.at) >= cutoff && e.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const observations = entries.filter(e => e.kind !== "removed");
  const first = observations.at(-1);
  const latest = observations.find(e => e.kind === "added" && first && Date.parse(e.at) > Date.parse(first.at));
  return <section className="journal-panel" aria-label="分类心迹与成长回顾">
    <div className="section-toolbar"><div><p className="eyebrow">My journal</p><h3>我的心迹</h3><p>让聊天中的理解留下来，看看自己一路如何变化。</p></div><small>{data ? `同步于 ${new Date(data.syncedAt).toLocaleTimeString()}` : "正在同步本地记忆…"}</small></div>
    <div className="journal-topics" aria-label="心迹主题">
      <button aria-pressed={topic === "all"} onClick={() => setTopic("all")}>全部</button>
      {Object.entries(journalTopics).map(([key, label]) => <button key={key} aria-pressed={topic === key} onClick={() => setTopic(key as JournalTopic)}>{label}<small>{data?.entries.filter(e => e.topic === key && e.kind !== "removed").length ?? 0}</small></button>)}
    </div>
    <div className="journal-controls"><input aria-label="搜索心迹" placeholder="搜索想法、目标或关键词" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="心迹时间范围" value={range} onChange={e => setRange(e.target.value)}><option value="all">全部时间</option><option value="7">近 7 天</option><option value="30">近 30 天</option><option value="90">近 90 天</option></select></div>
    {error || data?.errors.length ? <p role="alert">{error || data?.errors.join("；")}</p> : null}
    {first && latest && first.id !== latest.id ? <div className="journal-review"><article><small>较早的记录 · {new Date(first.at).toLocaleDateString()}</small><p>{first.text}</p></article><article><small>最近的记录 · {new Date(latest.at).toLocaleDateString()}</small><p>{latest.text}</p></article><p>并排回看表达的变化；记录数量不代表成长分数。</p></div> : null}
    <p className="journal-hint">按内容用途分类：协作偏好、工具配置单独归档，主题不明确时保留在“其他”。手动修改会应用到相同内容并优先保留。首次导入是现有记忆的起点快照，并不代表这些想法今天才形成。Console 运行时每 30 秒同步 Hermes 原生记忆；关闭期间的最终状态会在下次打开时同步。</p>
    <div className="journal-timeline">{entries.slice(0, limit).map(entry => <article key={entry.id}>
      <header><time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time><span>{entry.kind === "baseline" ? "起点快照" : entry.kind === "removed" ? "原生记忆已移除" : "新增沉淀"}</span><select aria-label={`调整分类：${entry.text.slice(0, 20)}`} value={entry.topic} disabled={busy !== null} onChange={async e => {
        setBusy(entry.id);
        try { setData(await window.hermes.journalCategorize(entry.id, e.target.value as JournalTopic)); setError(""); }
        catch (e) { setError(`分类保存失败：${String(e)}`); }
        finally { setBusy(null); }
      }}>{Object.entries(journalTopics).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></header>
      <p>{entry.text}</p><small className="journal-hint">{entry.classificationSource === "manual" ? "手动分类" : "自动分类"} · {entry.classificationReason ?? "旧版分类"}</small><footer>{entry.source}{entry.kind === "removed" ? " · 保留历史供回顾，不表示你仍持有这一观点" : ""}</footer>
    </article>)}</div>
    {data && !entries.length ? <div className="task-empty"><strong>这里还没有心迹</strong><p>继续在 Hermes 里聊天；被记住的想法会自动汇集到这里。</p></div> : null}
    {entries.length > limit ? <button onClick={() => setLimit(limit + 30)}>再看 30 条（共 {entries.length} 条）</button> : null}
  </section>;
}
