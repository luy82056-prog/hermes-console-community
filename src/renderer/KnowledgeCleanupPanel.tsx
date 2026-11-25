import { useEffect, useState } from "react";
import { LoaderCircle, Sparkles, Undo2 } from "lucide-react";
import type { CleanupProgress } from "../shared/knowledge-cleanup";

export function KnowledgeCleanupPanel({ dirty, onBusy, onFinished }: { dirty: boolean; onBusy: (busy: boolean) => void; onFinished: () => Promise<void> }) {
  const [state, setState] = useState<CleanupProgress>({ running: false, message: "" });
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    let disposed = false;
    const update = (next: CleanupProgress) => { if (!disposed) { setState(next); onBusy(next.running); } };
    void window.hermes.knowledgeCleanupStatus().then(update).catch(error => setError(String(error)));
    const unsubscribe = window.hermes.onKnowledgeCleanup(update);
    return () => { disposed = true; unsubscribe(); };
  }, [onBusy]);
  async function organize() {
    if (dirty || state.running || restoring) return;
    setError(""); setState(current => ({ ...current, running: true, message: "开始整理…" })); onBusy(true);
    try {
      const result = await window.hermes.knowledgeCleanup();
      if (!result.ok || !result.report) throw new Error(result.reason || "整理未完成");
      setState({ running: false, message: "整理完成", report: result.report });
      await onFinished();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setState(current => ({ ...current, running: false })); onBusy(false); }
  }
  async function restore() {
    if (!state.report || dirty || restoring || state.running) return;
    setRestoring(true); onBusy(true); setError("");
    try {
      const result = await window.hermes.knowledgeCleanupRestore(state.report.id);
      if (!result.ok || !result.report) throw new Error(result.reason || "撤销失败");
      setState({ running: false, message: "已撤销整理", report: result.report });
      await onFinished();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setRestoring(false); onBusy(false); }
  }
  const report = state.report;
  const removed = report?.changes.filter(item => item.action === "remove").length || 0;
  const merged = report?.changes.filter(item => item.action === "merge").length || 0;
  const folders = report?.changes.filter(item => item.action === "folder").length || 0;
  return <section className="knowledge-cleanup" aria-label="知识库整理">
    <div className="knowledge-cleanup-toolbar">
      <button className="knowledge-cleanup-start" disabled={dirty || state.running || restoring} onClick={() => void organize()} title="Hermes 审阅低信息量内容、合并重复笔记、清理空文件夹；完成后可撤销">
        {state.running ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />} {state.running ? "正在整理…" : "一键整理"}
      </button>
      <span role="status">{state.running ? state.message : report ? report.state === "restored" ? "上次整理已撤销" : report.state === "interrupted" ? "上次整理意外中断，可撤销恢复" : report.state === "failed" ? "上次整理未完成，文件变更已回滚" : `上次整理：清理 ${removed} 篇 · 合并 ${merged} 组 · 清理 ${folders} 个空文件夹` : "清理空白与低信息量内容，合并重复笔记；可撤销"}</span>
      {state.running ? <button onClick={() => void window.hermes.knowledgeCleanupCancel().catch(error => setError(String(error)))}>取消整理</button> : null}
      {report && (report.state === "interrupted" || report.state === "completed" && report.changes.length > 0) ? <button disabled={dirty || state.running || restoring} onClick={() => void restore()}><Undo2 size={14} />{restoring ? "撤销中…" : "撤销上次整理"}</button> : null}
    </div>
    {dirty ? <small>正文保存完成后即可整理。</small> : null}
    {error ? <p role="alert" className="error">{error}</p> : null}
    {report && !state.running ? <details><summary>查看整理记录{report.warnings.length ? ` · ${report.warnings.length} 条说明` : ""}</summary>
      <p>扫描 {report.scanned} 篇，Hermes 审阅 {report.reviewed} 篇。{new Date(report.at).toLocaleString("zh-CN")}</p>
      {report.warnings.map((warning,index) => <p key={index} className="knowledge-cleanup-warning">{warning}</p>)}
      {!report.changes.length ? <p>本轮没有确定需要清理的内容。</p> : <ul>{report.changes.map((change,index) => <li key={index}><strong>{change.action === "merge" ? "合并" : change.action === "folder" ? "空文件夹" : "清理"}：{change.target || change.paths.join("、")}</strong><span>{change.reason}</span>{change.action === "merge" ? <small>{change.paths.join(" ← ")}</small> : null}</li>)}</ul>}
      <p>整理前的原文已保留。项目资料、个人偏好、日志与正式内容不参与低信息量自动删除。</p>
    </details> : null}
  </section>;
}
