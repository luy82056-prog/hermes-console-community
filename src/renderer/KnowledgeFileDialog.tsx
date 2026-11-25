import { useEffect, useRef, useState } from "react";

export type FileAction = {
  kind: "rename" | "move" | "delete";
  note: { path: string; title: string; folder: string; mtimeMs: number; backlinks: number };
};

export function KnowledgeFileDialog({ action, folders, onClose, onComplete }: {
  action: FileAction;
  folders: string[];
  onClose: () => void;
  onComplete: (path?: string) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(action.note.title);
  const [folder, setFolder] = useState(action.note.folder);
  const [deleteOriginal, setDeleteOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = { rename: "重命名笔记", move: "移动笔记", delete: "删除笔记" }[action.kind];
  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (action.kind === "delete") {
        const result = await window.hermes.knowledgeRemove(action.note.path, action.note.path, { deleteOriginal, expectedMtimeMs: action.note.mtimeMs });
        if (!result.ok) throw new Error(result.reason || "删除失败");
        await onComplete();
      } else {
        const result = await window.hermes.knowledgeRename(action.note.path, { title: title.trim(), folder: folder.trim() || "." }, action.note.mtimeMs);
        if (!result.ok || !result.note) throw new Error(result.reason || "修改失败");
        await onComplete(result.note.path);
      }
      onClose();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  return <dialog ref={ref} className="knowledge-file-dialog" aria-labelledby="file-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <h2 id="file-dialog-title">{label}</h2>
      <p className="knowledge-file-path">{action.note.path}</p>
      {action.kind === "delete" ? <>
        <p>从知识库移除「{action.note.title}」。</p>
        <label className="knowledge-delete-option"><input type="checkbox" checked={deleteOriginal} onChange={event => setDeleteOriginal(event.target.checked)} disabled={busy} />同时删除原文件（移入回收站）</label>
        <p className="knowledge-dialog-hint">{deleteOriginal ? "这份 Markdown 会移入知识库的 .trash 文件夹，可在访达中恢复。外部导入来源和附件保持不变。" : "原文件保留在当前位置，仅从 Hermes 的列表、搜索和星图中移除。可在「已移除」中恢复显示。"}</p>
        {action.note.backlinks > 0 ? <p className="knowledge-dialog-hint">有 {action.note.backlinks} 篇笔记引用它；这些引用会保留。</p> : null}
      </> : <>
        <label>笔记标题<input autoFocus value={title} onChange={event => setTitle(event.target.value)} disabled={busy} required maxLength={100} onFocus={event => event.target.select()} /></label>
        {action.kind === "move" ? <label>目标文件夹<input list="knowledge-target-folders" value={folder} onChange={event => setFolder(event.target.value)} disabled={busy} placeholder="留空表示知识库根目录" /><datalist id="knowledge-target-folders">{folders.map(item => <option key={item} value={item} />)}</datalist></label> : null}
        <p className="knowledge-dialog-hint">同步更新文件名、标题和库内引用。Enter 保存，Esc 取消。</p>
      </>}
      {error ? <p role="alert" className="error">{error}</p> : null}
      <footer><button type="button" autoFocus={action.kind === "delete"} disabled={busy} onClick={onClose}>取消</button><button className={action.kind === "delete" ? "danger" : "primary-action"} disabled={busy || (action.kind !== "delete" && !title.trim())}>{busy ? "处理中…" : action.kind === "delete" ? deleteOriginal ? "移入回收站" : "仅从知识库移除" : "保存"}</button></footer>
    </form>
  </dialog>;
}
