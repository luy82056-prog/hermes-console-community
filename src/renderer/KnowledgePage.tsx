import { KnowledgeCleanupPanel } from "./KnowledgeCleanupPanel";
import { InsightsPanel } from "./InsightsPanel";
import { KnowledgeFileDialog, type FileAction } from "./KnowledgeFileDialog";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import {
  BookMarked,
  BookOpen,
  BrainCircuit,
  Check,
  Download,
  FilePlus2,
  FileText,
  MoreHorizontal,
  Copy,
  Folder,
  FolderOpen,
  GitFork,
  GripVertical,
  Highlighter,
  Link2,
  ListTree,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sun,
  Tag,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import ForceGraph2D from "react-force-graph-2d";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { KNOWLEDGE_KINDS, KNOWLEDGE_STATUSES, matchesKnowledgeView, type KnowledgeKind, type KnowledgeStatus } from "../shared/knowledge-taxonomy";

type KnowledgeNoteSummary = {
  path: string;
  title: string;
  folder: string;
  tags: string[];
  kind: KnowledgeKind;
  status: KnowledgeStatus;
  topic: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
  mtimeMs: number;
  excerpt: string;
  links: string[];
  backlinks: number;
};

type KnowledgeNote = KnowledgeNoteSummary & { content: string };
type KnowledgeGraphNode = { id: string; label: string; folder: string; tags: string[]; inbound: number; outbound: number; x?: number; y?: number };
type KnowledgeGraphLink = { source: string | KnowledgeGraphNode; target: string | KnowledgeGraphNode; kind: "link" | "suggestion" };
type KnowledgeSnapshot = {
  root: string;
  excluded: string[];
  folders: string[];
  notes: KnowledgeNoteSummary[];
  graph: { nodes: KnowledgeGraphNode[]; links: KnowledgeGraphLink[] };
};

type SaveResult =
  | { ok: true; note: KnowledgeNote }
  | { ok: false; conflict: true; reason: string; diskContent: string; mtimeMs: number }
  | { ok: false; conflict?: false; reason: string };
type ReaderHighlight = { id: string; text: string; createdAt: string; chapter?: string };
type ReaderProgress = { scrollRatio: number; fontScale: number; theme: "paper" | "night"; updatedAt: string; highlights: ReaderHighlight[] };
type ReaderDocumentSummary = {
  path: string;
  name: string;
  title: string;
  author: string;
  type: "markdown" | "text" | "epub";
  size: number;
  updatedAt: string;
  progress: ReaderProgress;
};
type ReaderDocument = ReaderDocumentSummary & {
  content: string;
  html: string;
  toc: Array<{ label: string; target: string; depth: number }>;
};
type SecondBrainCaptureRecord = {
  id: string;
  title: string;
  at: string;
  agentId: string;
  dailyPath: string;
  knowledgePath: string;
  outcome: "completed" | "cancelled" | "failed";
};

const KNOWLEDGE_LAYOUT_KEY = "hermes-console:knowledge-layout:v1";
const DEFAULT_LEFT_WIDTH = 248;
const DEFAULT_RIGHT_WIDTH = 272;

function clampPanelWidth(value: number, side: "left" | "right") {
  const [minimum, maximum] = side === "left" ? [190, 390] : [210, 420];
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function readKnowledgeLayout() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KNOWLEDGE_LAYOUT_KEY) || "{}") as {
      leftWidth?: number;
      rightWidth?: number;
      leftOpen?: boolean;
      rightOpen?: boolean;
    };
    return {
      leftWidth: clampPanelWidth(saved.leftWidth ?? DEFAULT_LEFT_WIDTH, "left"),
      rightWidth: clampPanelWidth(saved.rightWidth ?? DEFAULT_RIGHT_WIDTH, "right"),
      leftOpen: saved.leftOpen ?? true,
      rightOpen: saved.rightOpen ?? true
    };
  } catch {
    return {
      leftWidth: DEFAULT_LEFT_WIDTH,
      rightWidth: DEFAULT_RIGHT_WIDTH,
      leftOpen: true,
      rightOpen: true
    };
  }
}
type SecondBrainStatus = {
  enabled: boolean;
  captureCount: number;
  knowledgeCount: number;
  lastCapture: SecondBrainCaptureRecord | null;
  recent: SecondBrainCaptureRecord[];
};

function splitDocument(content: string) {
  const match = content.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
  return match ? { frontmatter: match[1] || "", body: match[2] || "" } : { frontmatter: "", body: content };
}

function relativeAssetPath(notePath: string, assetPath: string) {
  const from = notePath.split("/").slice(0, -1);
  const to = assetPath.split("/");
  while (from.length && to.length && from[0] === to[0]) {
    from.shift();
    to.shift();
  }
  return `${"../".repeat(from.length)}${to.join("/")}`;
}

function resolveVaultReference(notePath: string, reference: string) {
  const stack = notePath.split("/").slice(0, -1);
  for (const part of reference.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function outlineFrom(markdown: string) {
  return [...markdown.matchAll(/^(#{1,4})\s+(.+)$/gm)].map((match, index) => ({
    id: `${index}-${match[2]}`,
    depth: match[1]?.length || 1,
    title: (match[2] || "").replace(/[*_`]/g, "")
  }));
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function KnowledgeEditor({
  note,
  onSaved,
  onDirty,
  onError
}: {
  note: KnowledgeNote;
  onSaved: (note: KnowledgeNote) => void;
  onDirty: (dirty: boolean) => void;
  onError: (message: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mtimeRef = useRef(note.mtimeMs);
  const frontmatterRef = useRef(splitDocument(note.content).frontmatter);
  const latestBodyRef = useRef(splitDocument(note.content).body);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [conflict, setConflict] = useState<{ reason: string; diskContent: string; mtimeMs: number } | null>(null);

  useEffect(() => {
    const document = splitDocument(note.content);
    // Metadata-only edits must survive the next body autosave.
    if (document.body === latestBodyRef.current) {
      frontmatterRef.current = document.frontmatter;
      mtimeRef.current = note.mtimeMs;
    }
  }, [note.content, note.mtimeMs]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let editorReady = false;
    const autoBlockPattern = /<!-- hermes:auto:start -->[^]*?<!-- hermes:auto:end -->/;
    const originalAutoBlock = splitDocument(note.content).body.match(autoBlockPattern)?.[0];
    let serializedAutoBlock: string | undefined;
    mtimeRef.current = note.mtimeMs;
    frontmatterRef.current = splitDocument(note.content).frontmatter;
    latestBodyRef.current = splitDocument(note.content).body;

    const upload = async (file: File) => {
      const result = await window.hermes.knowledgeImportImage({
        name: file.name,
        mime: file.type,
        data: new Uint8Array(await file.arrayBuffer())
      });
      if (!result.ok) throw new Error(result.reason || "图片导入失败。");
      return relativeAssetPath(note.path, result.path);
    };

    const crepe = new Crepe({
      root: host,
      defaultValue: latestBodyRef.current,
      features: {
        [Crepe.Feature.AI]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.TopBar]: false
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: { text: "从这里开始记录。输入 / 可以插入标题、列表、引用、代码和表格。" },
        [Crepe.Feature.ImageBlock]: {
          onUpload: upload,
          inlineOnUpload: upload,
          blockOnUpload: upload,
          proxyDomURL: async (url: string) => {
            if (/^(data:|https?:|blob:)/i.test(url)) return url;
            try {
              const asset = await window.hermes.knowledgeReadAsset(resolveVaultReference(note.path, url));
              return `data:${asset.mime};base64,${asset.dataBase64}`;
            } catch {
              return url;
            }
          }
        }
      }
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, previous) => {
        if (disposed || !editorReady || markdown === previous || markdown === latestBodyRef.current) return;
        // Milkdown normalizes bullets and blank lines. Preserve original generated bytes
        // when the user changed only their supplement; real edits inside the block stay visible.
        const unchangedAuto = originalAutoBlock && serializedAutoBlock && markdown.match(autoBlockPattern)?.[0] === serializedAutoBlock;
        latestBodyRef.current = unchangedAuto ? markdown.replace(autoBlockPattern,()=>originalAutoBlock) : markdown;
        setSaved(false);
        onDirty(true);
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
          setSaving(true);
          const result = await window.hermes.knowledgeSave(
            note.path,
            `${frontmatterRef.current}${latestBodyRef.current}`,
            mtimeRef.current
          ) as SaveResult;
          setSaving(false);
          if (result.ok) {
            mtimeRef.current = result.note.mtimeMs;
            frontmatterRef.current = splitDocument(result.note.content).frontmatter;
            setSaved(true);
            onDirty(false);
            onSaved(result.note);
          } else if (result.conflict) {
            setConflict({ reason: result.reason, diskContent: result.diskContent, mtimeMs: result.mtimeMs });
          } else {
            onError(result.reason);
          }
        }, 500);
      });
    });

    void crepe.create().then(()=>{if(!disposed){serializedAutoBlock=crepe.getMarkdown().match(autoBlockPattern)?.[0];editorReady=true;}}).catch((error) => onError(error instanceof Error ? error.message : String(error)));
    return () => {
      disposed = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void crepe.destroy();
      host.replaceChildren();
    };
  }, [note.path]);

  async function resolveConflict(useMine: boolean) {
    if (!conflict) return;
    if (!useMine) {
      window.location.reload();
      return;
    }
    mtimeRef.current = conflict.mtimeMs;
    const result = await window.hermes.knowledgeSave(note.path, `${frontmatterRef.current}${latestBodyRef.current}`, conflict.mtimeMs) as SaveResult;
    if (result.ok) {
      setConflict(null);
      setSaved(true);
      onDirty(false);
      onSaved(result.note);
    }
  }

  return (
    <div className="knowledge-editor-wrap">
      <div className="knowledge-save-state" aria-live="polite">
        {saving ? <><LoaderCircle className="spin" size={14} /> 保存中</> : saved ? <><Check size={14} /> 已保存</> : "有未保存更改"}
      </div>
      <div className="knowledge-editor" ref={hostRef} />
      {conflict ? (
        <div className="knowledge-conflict">
          <strong>检测到外部修改</strong>
          <p>{conflict.reason}</p>
          <div>
            <button onClick={() => void resolveConflict(false)}>使用磁盘版本</button>
            <button className="primary-action" onClick={() => void resolveConflict(true)}>保留我的版本</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KnowledgeGraphView({
  snapshot,
  currentPath,
  onOpen
}: {
  snapshot: KnowledgeSnapshot;
  currentPath: string | null;
  onOpen: (path: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [localOnly, setLocalOnly] = useState(false);
  const [size, setSize] = useState({ width: 900, height: 620 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: Math.max(420, entry.contentRect.width), height: Math.max(440, entry.contentRect.height) });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const graph = useMemo(() => {
    if (!localOnly || !currentPath) return snapshot.graph;
    const neighbors = new Set([currentPath]);
    for (const link of snapshot.graph.links) {
      const source = typeof link.source === "string" ? link.source : link.source.id;
      const target = typeof link.target === "string" ? link.target : link.target.id;
      if (source === currentPath && target) neighbors.add(target);
      if (target === currentPath && source) neighbors.add(source);
    }
    return {
      nodes: snapshot.graph.nodes.filter((node) => neighbors.has(node.id)),
      links: snapshot.graph.links.filter((link) => {
        const source = typeof link.source === "string" ? link.source : link.source.id;
        const target = typeof link.target === "string" ? link.target : link.target.id;
        return Boolean(source && target && neighbors.has(source) && neighbors.has(target));
      })
    };
  }, [snapshot, currentPath, localOnly]);

  const colors = ["#244735", "#2d6070", "#8a513f", "#796b3d", "#4c4a45"];
  return (
    <section className="knowledge-graph-panel">
      <header>
        <div>
          <p className="eyebrow">Knowledge map</p>
          <h2>{localOnly ? "当前笔记星图" : "全局知识星图"}</h2>
        </div>
        <div className="segmented compact">
          <button className={!localOnly ? "selected" : ""} onClick={() => setLocalOnly(false)}>全局</button>
          <button className={localOnly ? "selected" : ""} disabled={!currentPath} onClick={() => setLocalOnly(true)}>局部</button>
        </div>
      </header>
      <div className="knowledge-graph" ref={hostRef}>
        <ForceGraph2D
          width={size.width}
          height={size.height}
          graphData={graph}
          backgroundColor="#fbf8f1"
          nodeLabel={(node) => `${node.label}\n${node.tags.join(" · ")}\n${node.inbound} 条引用`}
          nodeVal={(node) => 4 + node.inbound * 2}
          nodeColor={(node) => colors[Math.abs(node.folder.length) % colors.length] || colors[0]}
          linkColor={(link) => link.kind === "suggestion" ? "rgba(138,81,63,.32)" : "rgba(36,71,53,.38)"}
          linkWidth={(link) => link.kind === "suggestion" ? 1 : 1.5}
          linkLineDash={(link) => link.kind === "suggestion" ? [5, 5] : null}
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={(node, context, scale) => {
            if (!node.x || !node.y || scale < 1.1) return;
            context.font = `${Math.max(10, 13 / scale)}px "Noto Sans SC", sans-serif`;
            context.fillStyle = "#302e29";
            context.textAlign = "center";
            context.fillText(node.label, node.x, node.y + 11 / scale);
          }}
          onNodeClick={(node) => onOpen(node.id)}
        />
      </div>
      <footer>
        <span><i className="graph-legend solid" /> 已确认链接</span>
        <span><i className="graph-legend dashed" /> 建议关联，不会自动写入</span>
      </footer>
    </section>
  );
}

function applyReaderHighlights(root: HTMLElement | null, highlights: ReaderHighlight[]) {
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const HighlightConstructor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (!root || !registry || !HighlightConstructor) return;
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const highlight of highlights) {
    const needle = highlight.text.replace(/\s+/g, " ").trim();
    if (!needle) continue;
    for (const node of nodes) {
      const source = (node.nodeValue || "").replace(/\s+/g, " ");
      const start = source.indexOf(needle);
      if (start < 0) continue;
      const range = new Range();
      range.setStart(node, start);
      range.setEnd(node, Math.min((node.nodeValue || "").length, start + needle.length));
      ranges.push(range);
      break;
    }
  }
  registry.set("hermes-reader-highlight", new HighlightConstructor(...ranges));
}

function ReaderView({
  library,
  initialPath,
  onLibraryChanged,
  onEditMarkdown,
  onError
}: {
  library: ReaderDocumentSummary[];
  initialPath: string;
  onLibraryChanged: (preferredPath?: string) => Promise<void>;
  onEditMarkdown: (path: string) => void;
  onError: (message: string) => void;
}) {
  const [activePath, setActivePath] = useState(initialPath || library[0]?.path || "");
  const [active, setActive] = useState<ReaderDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const readerRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function openDocument(relativePath: string) {
    if (!relativePath) return;
    setLoading(true);
    setSelectedText("");
    try {
      const opened = await window.hermes.readerOpen(relativePath) as ReaderDocument;
      setActivePath(relativePath);
      setActive(opened);
      requestAnimationFrame(() => {
        const reader = readerRef.current;
        if (!reader) return;
        const maximum = Math.max(0, reader.scrollHeight - reader.clientHeight);
        reader.scrollTop = maximum * opened.progress.scrollRatio;
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialPath && initialPath !== activePath) setActivePath(initialPath);
  }, [initialPath]);

  useEffect(() => {
    if (!activePath && library[0]) setActivePath(library[0].path);
    if (activePath && (!active || active.path !== activePath)) void openDocument(activePath);
  }, [activePath, library.length]);

  useEffect(() => {
    applyReaderHighlights(articleRef.current, active?.progress.highlights || []);
    return () => {
      (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.delete("hermes-reader-highlight");
    };
  }, [active?.path, active?.progress.highlights, active?.html, active?.content]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !active) return;
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        void updateAppearance({ fontScale: active.progress.fontScale + 10 });
      } else if (event.key === "-") {
        event.preventDefault();
        void updateAppearance({ fontScale: active.progress.fontScale - 10 });
      } else if (event.key === "0") {
        event.preventDefault();
        void updateAppearance({ fontScale: 100 });
      } else if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        void addHighlight();
      } else if (event.key.toLowerCase() === "e" && active.type === "markdown") {
        event.preventDefault();
        onEditMarkdown(active.path);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [active, selectedText]);

  async function importDocuments() {
    try {
      const result = await window.hermes.readerImport();
      if (result.ok) await onLibraryChanged(result.paths[0]);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  async function importDropped(files: FileList) {
    try {
      let preferred = "";
      for (const file of Array.from(files)) {
        if (!/\.(md|markdown|txt|epub)$/i.test(file.name)) continue;
        const result = await window.hermes.readerImportBuffer({
          name: file.name,
          data: new Uint8Array(await file.arrayBuffer())
        });
        preferred ||= result.path;
      }
      if (preferred) await onLibraryChanged(preferred);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  async function updateAppearance(patch: { fontScale?: number; theme?: "paper" | "night" }) {
    if (!active) return;
    const progress = await window.hermes.readerProgress(active.path, patch) as ReaderProgress;
    setActive({ ...active, progress });
  }

  function saveScroll() {
    if (!active || !readerRef.current) return;
    const reader = readerRef.current;
    const maximum = Math.max(1, reader.scrollHeight - reader.clientHeight);
    const scrollRatio = Math.min(1, Math.max(0, reader.scrollTop / maximum));
    setActive({ ...active, progress: { ...active.progress, scrollRatio } });
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void window.hermes.readerProgress(active.path, { scrollRatio });
    }, 240);
  }

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !articleRef.current?.contains(selection.anchorNode)) {
      setSelectedText("");
      return;
    }
    setSelectedText(selection.toString().replace(/\s+/g, " ").trim());
  }

  async function addHighlight() {
    if (!active) return;
    const text = selectedText || window.getSelection()?.toString() || "";
    if (text.trim().length < 2) {
      onError("请先在正文中选中一段文字。");
      return;
    }
    const progress = await window.hermes.readerAddHighlight(active.path, text) as ReaderProgress;
    setActive({ ...active, progress });
    setSelectedText("");
    window.getSelection()?.removeAllRanges();
  }

  async function removeHighlight(highlightId: string) {
    if (!active) return;
    const progress = await window.hermes.readerRemoveHighlight(active.path, highlightId) as ReaderProgress;
    setActive({ ...active, progress });
  }

  async function exportHighlights() {
    if (!active) return;
    try {
      const result = await window.hermes.readerExportHighlights(active.path);
      await onLibraryChanged(result.path);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  function jumpTo(target: string) {
    if (!readerRef.current || !target.startsWith("#")) return;
    const element = readerRef.current.querySelector<HTMLElement>(target);
    element?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <section
      className={`reader-studio ${active?.progress.theme === "night" ? "theme-night" : "theme-paper"}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void importDropped(event.dataTransfer.files);
      }}
    >
      <aside className="reader-library">
        <header>
          <div><p className="eyebrow">Reading library</p><h2>阅读书架</h2></div>
          <button className="icon-button" title="导入 Markdown、TXT 或 EPUB" onClick={() => void importDocuments()}><Upload size={17} /></button>
        </header>
        <div className="reader-document-list">
          {library.map((item) => (
            <button key={item.path} className={item.path === activePath ? "active" : ""} onClick={() => void openDocument(item.path)}>
              <span className={`reader-file-kind ${item.type}`}>{item.type === "epub" ? "EPUB" : item.type === "text" ? "TXT" : "MD"}</span>
              <strong>{item.title}</strong>
              <small>{Math.round(item.progress.scrollRatio * 100)}% · {formatDate(item.progress.updatedAt === new Date(0).toISOString() ? item.updatedAt : item.progress.updatedAt)}</small>
              <i><span style={{ width: `${Math.max(2, item.progress.scrollRatio * 100)}%` }} /></i>
            </button>
          ))}
          {!library.length ? <div className="reader-library-empty"><BookMarked size={26} /><p>拖入一本 EPUB，或导入 Markdown、TXT 开始阅读。</p></div> : null}
        </div>
      </aside>

      <main className="reader-surface">
        <header className="reader-toolbar">
          <div className="reader-title">
            <strong>{active?.title || "选择一本书"}</strong>
            <span>{active?.author || active?.name || "本地阅读，不上传任何内容"}</span>
          </div>
          <div className="reader-tools">
            <button title="在独立窗口中阅读" disabled={!active} onClick={() => void window.hermes.readerNewWindow(active?.path)}><PanelsTopLeft size={16} /></button>
            {active?.type === "markdown" ? (
              <button title="切换到编辑模式 (Cmd+E)" onClick={() => onEditMarkdown(active.path)}><Pencil size={16} /></button>
            ) : null}
            <button title="缩小字号 (Cmd+-)" disabled={!active} onClick={() => void updateAppearance({ fontScale: (active?.progress.fontScale || 100) - 10 })}><Minus size={16} /></button>
            <button className="reader-scale" title="重置字号 (Cmd+0)" disabled={!active} onClick={() => void updateAppearance({ fontScale: 100 })}>{active?.progress.fontScale || 100}%</button>
            <button title="放大字号 (Cmd++)" disabled={!active} onClick={() => void updateAppearance({ fontScale: (active?.progress.fontScale || 100) + 10 })}><Plus size={16} /></button>
            <button title="恢复默认阅读位置" disabled={!active} onClick={() => {
              if (readerRef.current) readerRef.current.scrollTop = 0;
              void updateAppearance({});
            }}><RotateCcw size={16} /></button>
            <button title="切换纸张/夜间主题" disabled={!active} onClick={() => void updateAppearance({ theme: active?.progress.theme === "night" ? "paper" : "night" })}>
              {active?.progress.theme === "night" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        {loading ? <div className="reader-loading"><LoaderCircle className="spin" /> 正在打开</div> : active ? (
          <div className="reader-scroll" ref={readerRef} onScroll={saveScroll} onMouseUp={captureSelection}>
            <article
              ref={articleRef}
              className={`reader-article ${active.type}`}
              style={{ fontSize: `${active.progress.fontScale}%` }}
            >
              {active.type === "epub" ? (
                <div dangerouslySetInnerHTML={{ __html: active.html }} />
              ) : active.type === "markdown" ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  skipHtml
                  components={{
                    a: ({ href = "", children }) => (
                      <a href={href} onClick={(event) => {
                        if (/^https?:/i.test(href)) {
                          event.preventDefault();
                          void window.hermes.openExternal(href);
                        }
                      }}>{children}</a>
                    ),
                    table: ({ children }) => <div className="markdown-table-scroll"><table>{children}</table></div>
                  }}
                >{active.content}</ReactMarkdown>
              ) : <div className="reader-plain-text">{active.content}</div>}
            </article>
            {selectedText ? (
              <button className="reader-highlight-pill" onClick={() => void addHighlight()}><Highlighter size={15} /> 划线</button>
            ) : null}
          </div>
        ) : <div className="reader-empty"><BookOpen size={34} /><strong>把长文和书留在一个安静的地方</strong><button onClick={() => void importDocuments()}><Upload size={16} />导入文件</button></div>}
      </main>

      <aside className="reader-notes">
        <section>
          <h3><ListTree size={16} />目录</h3>
          <div className="reader-toc">
            {active?.toc.length ? active.toc.map((item, index) => (
              <button key={`${item.target}-${index}`} style={{ paddingLeft: `${8 + item.depth * 12}px` }} onClick={() => jumpTo(item.target)}>{item.label}</button>
            )) : <p>这份文档没有独立目录。</p>}
          </div>
        </section>
        <section className="reader-highlights">
          <header>
            <h3><Highlighter size={16} />划线</h3>
            <button className="icon-button" title="导出为 Markdown 笔记" disabled={!active?.progress.highlights.length} onClick={() => void exportHighlights()}><Download size={15} /></button>
          </header>
          {active?.progress.highlights.length ? active.progress.highlights.map((item) => (
            <blockquote key={item.id}>
              <p>{item.text}</p>
              <footer><time>{formatDate(item.createdAt)}</time><button title="删除这条划线" onClick={() => void removeHighlight(item.id)}><X size={13} /></button></footer>
            </blockquote>
          )) : <p>选中正文后点击“划线”，它会在这里长期保留。</p>}
        </section>
        <footer className="reader-credit">阅读体验参考 BabyReader · MIT</footer>
      </aside>
    </section>
  );
}

export function KnowledgePage() {
  const launchQuery = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialLayout = useMemo(readKnowledgeLayout, []);
  const launchReaderPath = launchQuery.get("reader") || "";
  const [snapshot, setSnapshot] = useState<KnowledgeSnapshot | null>(null);
  const [readerLibrary, setReaderLibrary] = useState<ReaderDocumentSummary[]>([]);
  const [readerPreferredPath, setReaderPreferredPath] = useState(launchReaderPath);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [note, setNote] = useState<KnowledgeNote | null>(null);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [view, setView] = useState<"note" | "reader" | "graph">(
    launchQuery.get("view") === "reader" || launchReaderPath ? "reader" : "note"
  );
  const [leftOpen, setLeftOpen] = useState(initialLayout.leftOpen);
  const [rightOpen, setRightOpen] = useState(initialLayout.rightOpen);
  const [leftWidth, setLeftWidth] = useState(initialLayout.leftWidth);
  const [rightWidth, setRightWidth] = useState(initialLayout.rightWidth);
  const [focusMode, setFocusMode] = useState(false);
  const [secondBrain, setSecondBrain] = useState<SecondBrainStatus | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [error, setError] = useState("");
  const [browserMode, setBrowserMode] = useState<"files" | "recent">("files");
  const [fileAction, setFileAction] = useState<FileAction | null>(null);
  const [contextMenu, setContextMenu] = useState<{ note: KnowledgeNoteSummary; x: number; y: number } | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const currentRef = useRef({ selectedPath, dirty, note });
  currentRef.current = { selectedPath, dirty, note };
  const requestRef = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!contextMenu) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setContextMenu(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setContextMenu(null); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", escapeMenu);
    function escapeMenu() { setContextMenu(null); }
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", escape); window.removeEventListener("resize", escapeMenu); };
  }, [contextMenu]);
  useEffect(() => { setTagDraft(note?.tags.join("，") || ""); }, [note?.path, note?.tags.join("，")]);

  useEffect(() => {
    window.localStorage.setItem(KNOWLEDGE_LAYOUT_KEY, JSON.stringify({
      leftWidth,
      rightWidth,
      leftOpen,
      rightOpen
    }));
  }, [leftWidth, rightWidth, leftOpen, rightOpen]);

  function beginPanelResize(side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftWidth : rightWidth;
    document.body.classList.add("knowledge-resizing");

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = side === "left" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      const next = clampPanelWidth(startWidth + delta, side);
      if (side === "left") setLeftWidth(next);
      else setRightWidth(next);
    };
    const handleUp = () => {
      document.body.classList.remove("knowledge-resizing");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function resizePanelWithKeyboard(side: "left" | "right", event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const delta = side === "left" ? direction * 16 : direction * -16;
    if (side === "left") setLeftWidth((value) => clampPanelWidth(value + delta, side));
    else setRightWidth((value) => clampPanelWidth(value + delta, side));
  }

  const workspaceStyle = {
    "--knowledge-left-width": `${leftWidth}px`,
    "--knowledge-right-width": `${rightWidth}px`
  } as CSSProperties;

  async function refresh(preferredPath?: string | null) {
    const request = ++requestRef.current;
    const next = await window.hermes.knowledgeSnapshot() as KnowledgeSnapshot;
    if (request !== requestRef.current) return;
    setSnapshot(next);
    const current = currentRef.current;
    // Filesystem notifications must never replace an unsaved editor.
    if (current.dirty) return;
    const candidate = preferredPath === undefined ? current.selectedPath : preferredPath;
    const target = (candidate && next.notes.some(item => item.path === candidate) ? candidate : null) || next.notes.find(item => item.status === "active")?.path || next.notes[0]?.path || null;
    if (!target) { setSelectedPath(null); setNote(null); return; }
    const loaded = await window.hermes.knowledgeRead(target) as KnowledgeNote;
    if (request !== requestRef.current || currentRef.current.dirty) return;
    if (currentRef.current.note?.content !== loaded.content) setEditorRevision(value => value + 1);
    setSelectedPath(target); setNote(loaded);
  }

  async function refreshReader(preferredPath?: string) {
    const next = await window.hermes.readerList() as ReaderDocumentSummary[];
    setReaderLibrary(next);
    const target = preferredPath || readerPreferredPath || next[0]?.path || "";
    if (target) setReaderPreferredPath(target);
  }

  useEffect(() => {
    void refresh().catch(error => setError(String(error)));
    void refreshReader();
    return window.hermes.onKnowledgeUpdated(() => {
      void refresh().catch(error => setError(String(error)));
      void refreshReader();
    });
  }, []);

  useEffect(() => {
    void window.hermes.secondBrainStatus().then((status) => setSecondBrain(status as SecondBrainStatus));
    return window.hermes.onSecondBrainUpdated((status) => setSecondBrain(status as SecondBrainStatus));
  }, []);

  async function openNote(path: string) {
    if (currentRef.current.dirty && path !== currentRef.current.selectedPath) { setError("请等待当前笔记保存完成；如有冲突，请先处理冲突。"); return; }
    const request = ++requestRef.current;
    try {
      const loaded = await window.hermes.knowledgeRead(path) as KnowledgeNote;
      if (request !== requestRef.current || currentRef.current.dirty) return;
      setSelectedPath(path); setNote(loaded); setDirty(false); setView("note");
      setEditorRevision(value => value + 1);
    } catch (error) { setError(String(error)); }
  }

  useEffect(() => {
    if(!snapshot)return;
    const requested=sessionStorage.getItem("hermes:open-note");
    if(requested){sessionStorage.removeItem("hermes:open-note");void openNote(requested);}
  },[Boolean(snapshot)]);

  async function createNote() {
    if (currentRef.current.dirty) { setError("请等待当前笔记保存完成。"); return; }
    try {
      const created = await window.hermes.knowledgeCreate({ folder: folder === "全部" ? "Inbox" : folder }) as KnowledgeNote;
      await refresh(created.path);
      setStatusFilter("all"); setKindFilter("all"); setTopicFilter("all"); setTagFilter(""); setQuery("");
      setView("note");
    } catch (error) { setError(String(error)); }
  }

  async function beginFileAction(kind: FileAction["kind"], target: KnowledgeNoteSummary | null = note) {
    setContextMenu(null);
    if (!target) return;
    if (currentRef.current.dirty) { setError("请等待当前笔记保存完成；如有冲突，请先处理冲突。"); return; }
    try {
      const loaded = await window.hermes.knowledgeRead(target.path) as KnowledgeNote;
      if (currentRef.current.dirty) { setError("正文正在保存，请稍后重试。"); return; }
      setFileAction({ kind, note: loaded });
    } catch (error) { setError(String(error)); }
  }

  function showFileMenu(event: React.MouseEvent, item: KnowledgeNoteSummary) {
    event.preventDefault(); event.stopPropagation();
    setContextMenu({ note: item, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 248)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 290)) });
  }

  function fileKeys(event: ReactKeyboardEvent, item: KnowledgeNoteSummary) {
    if (event.key === "F2") { event.preventDefault(); void beginFileAction("rename", item); }
    if (event.key === "Delete" || ((event.metaKey || event.ctrlKey) && event.key === "Backspace")) { event.preventDefault(); void beginFileAction("delete", item); }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect();
      setContextMenu({ note: item, x: Math.min(rect.left + 20, window.innerWidth - 248), y: Math.max(8, Math.min(rect.bottom, window.innerHeight - 290)) });
    }
  }

  function renderFile(item: KnowledgeNoteSummary, compact = false) {
    return <div className={`knowledge-file-row ${selectedPath === item.path ? "active" : ""}`} key={item.path} onContextMenu={event => showFileMenu(event, item)}>
      <button className="knowledge-file-select" title={item.path} aria-current={selectedPath === item.path ? "page" : undefined} onClick={() => void openNote(item.path)} onKeyDown={event => fileKeys(event, item)}>
        {compact ? <><FileText size={14} /><span>{item.title}</span></> : <><strong>{item.title}</strong><span>{item.excerpt || "空白笔记"}</span><small>{item.path}</small><small>{formatDate(item.updatedAt)}</small></>}
      </button>
      <button className="knowledge-file-more" aria-label={`操作 ${item.title}`} title="笔记操作" onClick={event => showFileMenu(event, item)}><MoreHorizontal size={16} /></button>
    </div>;
  }

  function renderTree(items: KnowledgeNoteSummary[], prefix = "") : React.ReactNode {
    const direct = items.filter(item => item.folder === prefix).sort((a,b) => a.title.localeCompare(b.title, "zh-CN"));
    const children = [...new Set(items.filter(item => item.folder !== prefix).map(item => item.folder.slice(prefix ? prefix.length + 1 : 0).split("/")[0]).filter(Boolean))].sort((a,b) => a.localeCompare(b, "zh-CN"));
    return <>{children.map(child => {
      const childPath = prefix ? `${prefix}/${child}` : child;
      const notes = items.filter(item => item.folder === childPath || item.folder.startsWith(`${childPath}/`));
      return <details className="knowledge-tree-folder" key={childPath} open><summary title={childPath}><Folder size={14} /><span>{child}</span><small>{notes.length}</small></summary><div>{renderTree(notes, childPath)}</div></details>;
    })}{direct.map(item => renderFile(item, true))}</>;
  }

  async function updateMetadata(input: { tags?: string[]; kind?: string; status?: string }) {
    if (!note || dirty || metadataSaving) return;
    setMetadataSaving(true);
    try {
      const result = await window.hermes.knowledgeUpdateMetadata(note.path, input, note.mtimeMs) as SaveResult;
      if (!result.ok) { setError(result.reason); return; }
      setNote(result.note);
      await refresh(result.note.path);
    } catch (error) { setError(String(error)); }
    finally { setMetadataSaving(false); }
  }

  const filteredNotes = useMemo(() => {
    if (!snapshot) return [];
    const needle = query.trim().toLocaleLowerCase();
    return snapshot.notes.filter((item) =>
      matchesKnowledgeView(item, { status: statusFilter, kind: kindFilter, topic: topicFilter, tag: tagFilter, folder }) &&
      (!needle || [item.title, item.path, item.excerpt, ...item.tags].some((value) => value.toLocaleLowerCase().includes(needle)))
    );
  }, [snapshot, query, folder, statusFilter, kindFilter, topicFilter, tagFilter]);
  const visibleGraph = useMemo(() => {
    if (!snapshot) return null;
    const paths = new Set(filteredNotes.map(item => item.path));
    return { ...snapshot, notes: filteredNotes, graph: { nodes: snapshot.graph.nodes.filter(node => paths.has(node.id)), links: snapshot.graph.links.filter(link => paths.has(typeof link.source === "string" ? link.source : link.source.id) && paths.has(typeof link.target === "string" ? link.target : link.target.id)) } };
  }, [snapshot, filteredNotes]);
  const backlinks = snapshot?.notes.filter((item) => item.links.includes(selectedPath || "")) || [];
  const outline = note ? outlineFrom(splitDocument(note.content).body) : [];
  const suggestions = snapshot?.graph.links.filter((link) => {
    const source = typeof link.source === "string" ? link.source : link.source.id;
    const target = typeof link.target === "string" ? link.target : link.target.id;
    return link.kind === "suggestion" && (source === selectedPath || target === selectedPath);
  }).slice(0, 4) || [];

  async function acceptSuggestion(link: KnowledgeGraphLink) {
    if (!note) return;
    const source = typeof link.source === "string" ? link.source : link.source.id;
    const target = typeof link.target === "string" ? link.target : link.target.id;
    const other = source === note.path ? target : source;
    if (!other) return;
    const result = await window.hermes.knowledgeAcceptSuggestion(note.path, other, note.mtimeMs) as SaveResult;
    if (result.ok) {
      setNote(result.note);
      await refresh(result.note.path);
    } else {
      setError(result.reason);
    }
  }

  if (!snapshot) {
    return <div className="knowledge-loading">{error?<><span role="alert">{error}</span><button onClick={()=>{setError("");void refresh().catch(error=>setError(String(error)));}}>重试读取</button></>:<><LoaderCircle className="spin" /> 正在打开本地知识库</>}</div>;
  }

  return (
    <div className="knowledge-page">
      <section className="knowledge-commandbar">
        <div className="knowledge-vault-name">
          <BookOpen size={19} />
          <div><strong>Hermes Knowledge</strong><span>{snapshot.root}</span></div>
          <button className="icon-button" title="在访达中打开知识库" onClick={() => void window.hermes.knowledgeOpenRoot()}><FolderOpen size={16} /></button>
        </div>
        <div className="segmented compact">
          <button className={view === "note" ? "selected" : ""} onClick={() => setView("note")}><BookOpen size={15} />笔记</button>
          <button className={view === "reader" ? "selected" : ""} onClick={() => setView("reader")}><BookMarked size={15} />阅读</button>
          <button className={view === "graph" ? "selected" : ""} onClick={() => setView("graph")}><Network size={15} />星图</button>
        </div>
        <button
          className={`second-brain-toggle ${secondBrain?.enabled ? "active" : ""}`}
          title={secondBrain?.lastCapture
            ? `最近沉淀：${secondBrain.lastCapture.title}`
            : "记录增量汇总为每日概述和知识候选"}
          onClick={async () => setSecondBrain(await window.hermes.secondBrainConfigure(!(secondBrain?.enabled ?? true)) as SecondBrainStatus)}
        >
          <BrainCircuit size={16} />
          <span>{secondBrain?.enabled ? "自动沉淀" : "收集已停"}</span>
          <small>{snapshot.notes.filter(item => item.status === "inbox").length}</small>
        </button>
        {view !== "reader" ? (
          <div className="knowledge-layout-actions" aria-label="知识库布局">
            <button
              className={`icon-button ${leftOpen && !focusMode ? "active" : ""}`}
              title={leftOpen && !focusMode ? "收起笔记列表" : "展开笔记列表"}
              onClick={() => {
                if (focusMode) {
                  setFocusMode(false);
                  setLeftOpen(true);
                } else {
                  setLeftOpen((value) => !value);
                }
              }}
            >
              {leftOpen && !focusMode ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <button
              className={`icon-button ${focusMode ? "active" : ""}`}
              title={focusMode ? "退出专注编辑" : "专注编辑"}
              onClick={() => setFocusMode((value) => !value)}
            >
              {focusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              className={`icon-button ${rightOpen && !focusMode ? "active" : ""}`}
              title={rightOpen && !focusMode ? "收起笔记详情" : "展开笔记详情"}
              onClick={() => {
                if (focusMode) {
                  setFocusMode(false);
                  setRightOpen(true);
                } else {
                  setRightOpen((value) => !value);
                }
              }}
            >
              {rightOpen && !focusMode ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </button>
          </div>
        ) : null}
      </section>

      {view !== "reader" ? <KnowledgeCleanupPanel dirty={dirty || Boolean(fileAction)} onBusy={setCleanupRunning} onFinished={() => refresh()} /> : null}
      {view !== "reader" ? <InsightsPanel onOpenNote={file=>void openNote(file)} /> : null}

      {error ? <div className="error knowledge-error"><span>{error}</span><button onClick={() => setError("")} title="关闭"><X size={15} /></button></div> : null}

      {fileAction ? <KnowledgeFileDialog action={fileAction} folders={snapshot.folders} onClose={() => setFileAction(null)} onComplete={async path => {
        const removedCurrent = fileAction.kind === "delete" && fileAction.note.path === currentRef.current.selectedPath;
        if (removedCurrent) { currentRef.current = { selectedPath: null, note: null, dirty: false }; setSelectedPath(null); setNote(null); }
        await refresh(path || (removedCurrent ? null : undefined));
      }} /> : null}
      {contextMenu ? <div className="knowledge-context-menu" ref={menuRef} role="menu" aria-label={`操作 ${contextMenu.note.title}`} style={{ left: contextMenu.x, top: contextMenu.y }} onKeyDown={event => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
        <small>{contextMenu.note.title}</small>
        <button role="menuitem" disabled={dirty} onClick={() => void beginFileAction("rename", contextMenu.note)}><Pencil size={15} />重命名<span>F2</span></button>
        <button role="menuitem" disabled={dirty} onClick={() => void beginFileAction("move", contextMenu.note)}><Folder size={15} />移动到…</button>
        <button role="menuitem" onClick={() => { void navigator.clipboard.writeText(contextMenu.note.path).catch(error => setError(String(error))); setContextMenu(null); }}><Copy size={15} />复制相对路径</button>
        <button role="menuitem" onClick={() => { void window.hermes.knowledgeReveal(contextMenu.note.path).catch(error => setError(String(error))); setContextMenu(null); }}><FolderOpen size={15} />在访达中显示</button>
        <hr /><button role="menuitem" className="danger" disabled={dirty} onClick={() => void beginFileAction("delete", contextMenu.note)}><Trash2 size={15} />删除…</button>
      </div> : null}
      {view === "reader" ? (
        <ReaderView
          library={readerLibrary}
          initialPath={readerPreferredPath}
          onError={setError}
          onLibraryChanged={async (preferredPath) => {
            await refreshReader(preferredPath);
            if (preferredPath) setReaderPreferredPath(preferredPath);
          }}
          onEditMarkdown={(path) => {
            void openNote(path);
          }}
        />
      ) : (
      <section
        className={[
          "knowledge-workspace",
          leftOpen && !focusMode ? "" : "left-hidden",
          rightOpen && !focusMode ? "" : "right-hidden",
          focusMode ? "focus-mode" : ""
        ].filter(Boolean).join(" ")}
        style={workspaceStyle}
        inert={cleanupRunning}
      >
        {leftOpen && !focusMode ? <aside className="knowledge-browser">
          <div className="knowledge-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、摘要或标签" />
          </div>
          <div className="knowledge-browser-head">
            <span>{filteredNotes.length} 篇笔记</span>
            <button className="icon-button" onClick={() => void createNote()} title="新建笔记"><FilePlus2 size={17} /></button>
          </div>
          <div className="knowledge-browser-modes"><button className={browserMode === "files" ? "active" : ""} onClick={() => setBrowserMode("files")}>文件</button><button className={browserMode === "recent" ? "active" : ""} onClick={() => setBrowserMode("recent")}>最近编辑</button></div>
          <details className="knowledge-filter-panel"><summary>筛选 · {statusFilter === "all" ? "全部笔记" : KNOWLEDGE_STATUSES[statusFilter as KnowledgeStatus]}</summary><div className="knowledge-folders">
            <div className="knowledge-status-tabs">{Object.entries({ ...KNOWLEDGE_STATUSES, all: "全部" }).map(([key, label]) => <button key={key} className={statusFilter === key ? "active" : ""} onClick={() => { setStatusFilter(key); setFolder("全部"); setTagFilter(""); setTopicFilter("all"); setKindFilter("all"); }}><span>{label}</span><small>{snapshot.notes.filter(item => key === "all" || item.status === key).length}</small></button>)}</div>
            <select aria-label="内容类型" value={kindFilter} onChange={event => setKindFilter(event.target.value)}><option value="all">全部类型</option>{Object.entries(KNOWLEDGE_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
            <select aria-label="主题" value={topicFilter} onChange={event => setTopicFilter(event.target.value)}><option value="all">全部主题</option>{[...new Set(snapshot.notes.map(item => item.topic))].sort().map(topic => <option key={topic}>{topic}</option>)}</select>
            <select aria-label="标签筛选" value={tagFilter} onChange={event => setTagFilter(event.target.value)}><option value="">全部标签</option>{[...new Set(snapshot.notes.flatMap(item => item.tags))].sort().map(tag => <option key={tag}>{tag}</option>)}</select>
            <details><summary>按文件夹浏览</summary>{["全部", ...snapshot.folders].map(item => <button key={item} className={folder === item ? "active" : ""} onClick={() => setFolder(item)}><Folder size={14} /><span>{item}</span></button>)}</details>
          </div>
          </details>
          <div className={`knowledge-note-list ${browserMode === "files" ? "knowledge-file-tree" : ""}`}>
            {!filteredNotes.length ? <p className="knowledge-filter-empty">当前筛选下没有笔记。可切换「待整理」或「全部」。</p> : null}
            {browserMode === "files" ? renderTree(filteredNotes) : filteredNotes.map(item => renderFile(item))}
          </div>
          {snapshot.excluded?.length ? <details className="knowledge-excluded"><summary>已移除 · {snapshot.excluded.length}</summary>{snapshot.excluded.map(path => <div key={path}><span title={path}>{path}</span><button onClick={async () => { try { await window.hermes.knowledgeRestoreExcluded(path); await refresh(); } catch (error) { setError(String(error)); } }}>恢复显示</button></div>)}</details> : null}
        </aside> : null}

        {leftOpen && !focusMode ? (
          <div
            className="knowledge-resizer knowledge-resizer-left"
            role="separator"
            aria-label="调整笔记列表宽度"
            aria-orientation="vertical"
            aria-valuemin={190}
            aria-valuemax={390}
            aria-valuenow={leftWidth}
            tabIndex={0}
            title="左右拖动调整宽度，双击恢复默认"
            onPointerDown={(event) => beginPanelResize("left", event)}
            onKeyDown={(event) => resizePanelWithKeyboard("left", event)}
            onDoubleClick={() => setLeftWidth(DEFAULT_LEFT_WIDTH)}
          >
            <GripVertical size={15} />
          </div>
        ) : null}

        <main className="knowledge-main">
          {note && view === "note" ? <div className="knowledge-document-bar"><button title="重命名笔记" disabled={dirty} onClick={() => void beginFileAction("rename")}><strong>{note.title}</strong><Pencil size={13} /></button><span title={note.path}>{note.path}</span><button title="笔记操作" aria-label="当前笔记操作" onClick={event => showFileMenu(event, note)}><MoreHorizontal size={17} /></button></div> : null}
          {view === "graph" ? (
            <KnowledgeGraphView snapshot={visibleGraph || snapshot} currentPath={selectedPath} onOpen={(path) => void openNote(path)} />
          ) : note ? (
            <KnowledgeEditor
              key={`${note.path}:${editorRevision}`}
              note={note}
              onDirty={setDirty}
              onError={setError}
              onSaved={(savedNote) => {
                setNote(savedNote);
                setSnapshot((current) => current ? {
                  ...current,
                  notes: current.notes.map((item) => item.path === savedNote.path ? savedNote : item)
                } : current);
              }}
            />
          ) : (
            <div className="knowledge-empty"><BookOpen size={30} /><strong>选择或新建一篇笔记</strong></div>
          )}
        </main>

        {rightOpen && !focusMode ? (
          <div
            className="knowledge-resizer knowledge-resizer-right"
            role="separator"
            aria-label="调整笔记详情宽度"
            aria-orientation="vertical"
            aria-valuemin={210}
            aria-valuemax={420}
            aria-valuenow={rightWidth}
            tabIndex={0}
            title="左右拖动调整宽度，双击恢复默认"
            onPointerDown={(event) => beginPanelResize("right", event)}
            onKeyDown={(event) => resizePanelWithKeyboard("right", event)}
            onDoubleClick={() => setRightWidth(DEFAULT_RIGHT_WIDTH)}
          >
            <GripVertical size={15} />
          </div>
        ) : null}

        {rightOpen && !focusMode ? (
          <aside className="knowledge-inspector">
            <section>
              <h3><Tag size={16} />属性</h3>
              {note ? (
                <dl>
                  <div><dt>文件夹</dt><dd>{note.folder || "根目录"}</dd></div>
                  <div><dt>更新</dt><dd>{formatDate(note.updatedAt)}</dd></div>
                  <div><dt>标签</dt><dd>{note.tags.length ? note.tags.join(" · ") : "暂无"}</dd></div>
                  <div><dt>主题</dt><dd>{note.topic}</dd></div>
                  <div><dt>状态</dt><dd>{KNOWLEDGE_STATUSES[note.status]}</dd></div>
                </dl>
              ) : <p>选择一篇笔记查看属性。</p>}
              {note ? <div className="knowledge-organize">
                <small>{note.reason}</small>
                <label>内容类型<select aria-label="修改内容类型" value={note.kind} disabled={dirty || metadataSaving} onChange={event => void updateMetadata({ kind: event.target.value })}>{Object.entries(KNOWLEDGE_KINDS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label>标签<input aria-label="编辑标签" value={tagDraft} onChange={event => setTagDraft(event.target.value)} placeholder="用逗号分隔，建议 1–3 个" /></label>
                <button disabled={dirty || metadataSaving} onClick={() => void updateMetadata({ tags: tagDraft.split(/[,，]/).map(tag => tag.trim()).filter(Boolean) })}>保存标签</button>
                <div>{note.status !== "active" ? <button disabled={dirty || metadataSaving} onClick={() => void updateMetadata({ status: "active", ...(note.kind === "material" ? { kind: "knowledge" } : {}) })}>确认收录</button> : null}{note.status !== "inbox" ? <button disabled={dirty || metadataSaving} onClick={() => void updateMetadata({ status: "inbox" })}>移回待整理</button> : null}{note.status !== "archived" ? <button disabled={dirty || metadataSaving} onClick={() => void updateMetadata({ status: "archived" })}>归档</button> : null}</div>
                {dirty ? <small>正文保存后即可整理属性。</small> : null}
              </div> : null}
            </section>
            <section>
              <h3><ListTree size={16} />目录</h3>
              <div className="knowledge-outline">
                {outline.length ? outline.map((item) => <span key={item.id} style={{ paddingLeft: `${(item.depth - 1) * 10}px` }}>{item.title}</span>) : <p>暂无标题</p>}
              </div>
            </section>
            <section>
              <h3><GitFork size={16} />反向链接</h3>
              <div className="knowledge-related">
                {backlinks.length ? backlinks.map((item) => <button key={item.path} onClick={() => void openNote(item.path)}>{item.title}</button>) : <p>还没有其他笔记引用这里。</p>}
              </div>
            </section>
            <section>
              <h3><Link2 size={16} />建议关联</h3>
              <div className="knowledge-related">
                {suggestions.length ? suggestions.map((link, index) => {
                  const source = typeof link.source === "string" ? link.source : link.source.id;
                  const target = typeof link.target === "string" ? link.target : link.target.id;
                  const other = source === selectedPath ? target : source;
                  const related = snapshot.notes.find((item) => item.path === other);
                  return related ? (
                    <div className="knowledge-suggestion" key={`${source}-${target}-${index}`}>
                      <button onClick={() => void openNote(related.path)}>{related.title}</button>
                      <button className="icon-button" title="确认并写入双向链接" onClick={() => void acceptSuggestion(link)}><Check size={14} /></button>
                    </div>
                  ) : null;
                }) : <p>暂无建议。相同标签会形成待确认的虚线关联。</p>}
              </div>
            </section>
            <section>
              <h3><FolderOpen size={16} />文件操作</h3>
              <div className="knowledge-file-actions">
                <button disabled={!note || dirty} onClick={() => void beginFileAction("move")}><Folder size={14} />重命名或移动</button>
                <button className="danger" disabled={!note || dirty} onClick={() => void beginFileAction("delete")}><Trash2 size={14} />删除…</button>
              </div>
            </section>
          </aside>
        ) : null}
      </section>
      )}
    </div>
  );
}
