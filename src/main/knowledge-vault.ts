import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  utimesSync,
  watch,
  writeFileSync,
  type FSWatcher
} from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { knowledgeMetadata, KNOWLEDGE_KINDS, KNOWLEDGE_STATUSES, type KnowledgeKind, type KnowledgeStatus } from "../shared/knowledge-taxonomy";

export type KnowledgeNoteSummary = {
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

export type KnowledgeNote = KnowledgeNoteSummary & {
  content: string;
};

export type KnowledgeGraphNode = {
  id: string;
  label: string;
  folder: string;
  tags: string[];
  inbound: number;
  outbound: number;
};

export type KnowledgeGraphLink = {
  source: string;
  target: string;
  kind: "link" | "suggestion";
};

export type KnowledgeSnapshot = {
  root: string;
  excluded: string[];
  folders: string[];
  notes: KnowledgeNoteSummary[];
  graph: {
    nodes: KnowledgeGraphNode[];
    links: KnowledgeGraphLink[];
  };
};

export type KnowledgeSaveResult =
  | { ok: true; note: KnowledgeNote }
  | { ok: false; conflict: true; reason: string; diskContent: string; mtimeMs: number }
  | { ok: false; conflict?: false; reason: string };

type IndexedNote = Omit<KnowledgeNoteSummary, "backlinks"> & {
  rawTargets: string[];
};

// Content directories are created when used, so cleanup stays effective on restart.
const DEFAULT_FOLDERS = ["assets", ".hermes-console"];
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function isoFrom(value: unknown, fallback: Date) {
  const parsed = typeof value === "string" || value instanceof Date ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

function cleanTitle(filePath: string, data: Record<string, unknown>, body: string) {
  if (typeof data.title === "string" && data.title.trim()) {
    return data.title.trim().slice(0, 200);
  }
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return (heading || path.basename(filePath, ".md")).slice(0, 200);
}

function excerptFrom(body: string) {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?]]/g, "$1")
    .replace(/[#>*_`~|\-[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function rawLinkTargets(body: string) {
  const targets = new Set<string>();
  for (const match of body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?]]/g)) {
    const target = match[1]?.trim();
    if (target) targets.add(target);
  }
  for (const match of body.matchAll(/\[[^\]]*]\(([^)#?]+\.md)(?:#[^)]*)?\)/gi)) {
    const target = decodeURIComponent(match[1] || "").trim();
    if (target) targets.add(target);
  }
  return [...targets];
}

function posixPath(value: string) {
  return value.split(path.sep).join("/");
}

export class KnowledgeVault {
  readonly root: string;
  private watcher: FSWatcher | null = null;
  private notifyTimer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(root = path.join(os.homedir(), "Documents", "Hermes Knowledge")) {
    this.root = path.resolve(root);
  }

  initialize() {
    mkdirSync(this.root, { recursive: true });
    for (const folder of DEFAULT_FOLDERS) {
      mkdirSync(path.join(this.root, folder), { recursive: true });
    }

    const welcomePath = path.join(this.root, "Knowledge", "使用指南", "欢迎来到 Hermes Knowledge.md");
    if (!existsSync(welcomePath)) {
      const now = new Date().toISOString();
      const content = matter.stringify(
        "# 欢迎来到 Hermes Knowledge\n\n这里的每一篇笔记都是普通 Markdown 文件。你可以在 Console、Obsidian 或 VS Code 中继续编辑。\n\n## 从这里开始\n\n- 建立一个 `[[学习地图]]`\n- 把图片拖入编辑器\n- 用双向链接连接你的想法\n",
        { title: "欢迎来到 Hermes Knowledge", tags: ["使用指南"], kind: "knowledge", status: "active", topic: "技术工具", created: now, updated: now }
      );
      this.atomicWrite(welcomePath, content);
    }
    return this.snapshot();
  }

  onUpdated(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  startWatching() {
    if (this.watcher) return;
    this.watcher = watch(this.root, { recursive: true }, (_event, filename) => {
      if (!filename || filename.includes(`${path.sep}.hermes-console${path.sep}`) || filename.endsWith(".tmp")) {
        return;
      }
      if (this.notifyTimer) clearTimeout(this.notifyTimer);
      this.notifyTimer = setTimeout(() => {
        for (const listener of this.listeners) listener();
      }, 180);
    });
  }

  stopWatching() {
    this.watcher?.close();
    this.watcher = null;
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    this.notifyTimer = null;
  }

  private safePath(relativePath: string, expectedExtension?: string) {
    if (typeof relativePath !== "string" || !relativePath.trim() || relativePath.includes("\0") || path.isAbsolute(relativePath)) {
      throw new Error("无效的 Vault 相对路径。");
    }
    const normalized = path.normalize(relativePath.trim());
    const absolute = path.resolve(this.root, normalized);
    const relation = path.relative(this.root, absolute);
    if (!relation || relation.startsWith("..") || path.isAbsolute(relation)) {
      throw new Error("路径必须位于当前知识库中。");
    }
    if (expectedExtension && path.extname(absolute).toLowerCase() !== expectedExtension) {
      throw new Error(`文件必须使用 ${expectedExtension} 扩展名。`);
    }
    // A lexical containment check alone does not protect against symlink escapes.
    let current = this.root;
    for (const segment of relation.split(path.sep)) {
      current = path.join(current, segment);
      if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("不能操作符号链接，请使用知识库内的真实文件。");
    }
    return absolute;
  }

  private excludedPaths(): string[] {
    const file = path.join(this.root, ".hermes-console", "excluded.json");
    if (!existsSync(file)) return [];
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(value) || value.some(item => typeof item !== "string")) throw new Error("知识库移除记录损坏，请先恢复 excluded.json。");
    return value;
  }

  restoreExcluded(relativePath: string) {
    this.safePath(relativePath, ".md");
    this.atomicWrite(path.join(this.root, ".hermes-console", "excluded.json"), JSON.stringify(this.excludedPaths().filter(item => item !== relativePath)));
    return { ok: true };
  }

  filePath(relativePath: string) { return this.safePath(relativePath, ".md"); }

  private atomicWrite(target: string, content: string | Buffer) {
    mkdirSync(path.dirname(target), { recursive: true });
    const previousMtime = existsSync(target) ? statSync(target).mtimeMs : 0;
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(descriptor, content);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, target);
    const writtenMtime = statSync(target).mtimeMs;
    if (writtenMtime <= previousMtime) {
      const nextMtime = new Date(previousMtime + 1);
      utimesSync(target, nextMtime, nextMtime);
    }
  }

  private markdownFiles(directory = this.root): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "assets") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...this.markdownFiles(absolute));
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(absolute);
    }
    return files;
  }

  private buildIndex() {
    const excluded = new Set(this.excludedPaths());
    const indexed: IndexedNote[] = this.markdownFiles().filter(absolute => !excluded.has(posixPath(path.relative(this.root, absolute)))).map((absolute) => {
      const relative = posixPath(path.relative(this.root, absolute));
      const stats = statSync(absolute);
      const raw = readFileSync(absolute, "utf8");
      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;
      return {
        path: relative,
        title: cleanTitle(relative, data, parsed.content),
        folder: posixPath(path.dirname(relative)) === "." ? "" : posixPath(path.dirname(relative)),
        tags: normalizeTags(data.tags),
        ...knowledgeMetadata(data, relative, parsed.content),
        createdAt: isoFrom(data.created, stats.birthtime),
        updatedAt: isoFrom(data.updated, stats.mtime),
        mtimeMs: stats.mtimeMs,
        excerpt: excerptFrom(parsed.content),
        links: [],
        rawTargets: rawLinkTargets(parsed.content)
      };
    });

    const byPath = new Map(indexed.map((note) => [note.path.toLowerCase(), note]));
    const byStem = new Map<string, IndexedNote[]>();
    for (const note of indexed) {
      const stem = path.basename(note.path, ".md").toLowerCase();
      byStem.set(stem, [...(byStem.get(stem) || []), note]);
    }

    const resolveTarget = (source: IndexedNote, target: string) => {
      const normalized = posixPath(target.replace(/\.md$/i, ""));
      const candidates = [
        `${normalized}.md`,
        posixPath(path.join(source.folder, `${normalized}.md`))
      ];
      for (const candidate of candidates) {
        const match = byPath.get(candidate.toLowerCase());
        if (match) return match.path;
      }
      return byStem.get(path.basename(normalized).toLowerCase())?.[0]?.path ?? "";
    };

    for (const note of indexed) {
      note.links = [...new Set(note.rawTargets.map((target) => resolveTarget(note, target)).filter(Boolean))];
    }
    return indexed;
  }

  snapshot(): KnowledgeSnapshot {
    const index = this.buildIndex();
    const backlinkCounts = new Map<string, number>();
    for (const note of index) {
      for (const target of note.links) backlinkCounts.set(target, (backlinkCounts.get(target) || 0) + 1);
    }

    const notes = index
      .map(({ rawTargets: _rawTargets, ...note }) => ({ ...note, backlinks: backlinkCounts.get(note.path) || 0 }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const explicit = new Set<string>();
    const links: KnowledgeGraphLink[] = [];
    for (const note of notes) {
      for (const target of note.links) {
        explicit.add(`${note.path}\0${target}`);
        links.push({ source: note.path, target, kind: "link" });
      }
    }

    // Shared tags become reviewable suggestions; they are never written automatically.
    for (let left = 0; left < notes.length; left += 1) {
      for (let right = left + 1; right < notes.length; right += 1) {
        const a = notes[left];
        const b = notes[right];
        if (!a || !b || explicit.has(`${a.path}\0${b.path}`) || explicit.has(`${b.path}\0${a.path}`)) continue;
        if (a.status === "active" && b.status === "active" && a.tags.some((tag) => !["第二大脑", "待整理", "已归档", "每日学习"].includes(tag) && b.tags.includes(tag)) && links.filter((item) => item.kind === "suggestion").length < 80) {
          links.push({ source: a.path, target: b.path, kind: "suggestion" });
        }
      }
    }

    return {
      root: this.root,
      excluded: this.excludedPaths(),
      folders: [...new Set(notes.map((note) => note.folder).filter(Boolean))].sort(),
      notes,
      graph: {
        nodes: notes.map((note) => ({
          id: note.path,
          label: note.title,
          folder: note.folder,
          tags: note.tags,
          inbound: note.backlinks,
          outbound: note.links.length
        })),
        links
      }
    };
  }

  read(relativePath: string): KnowledgeNote {
    const absolute = this.safePath(relativePath, ".md");
    const snapshot = this.snapshot();
    const summary = snapshot.notes.find((note) => note.path === posixPath(path.relative(this.root, absolute)));
    if (!summary) throw new Error("找不到这篇笔记。");
    return { ...summary, content: readFileSync(absolute, "utf8") };
  }

  exists(relativePath: string) {
    try {
      return existsSync(this.safePath(relativePath, ".md"));
    } catch {
      return false;
    }
  }

  readGenerated(relativePath: string) {
    return readFileSync(this.safePath(relativePath, ".md"), "utf8");
  }

  writeGenerated(relativePath: string, content: string) {
    const absolute = this.safePath(relativePath, ".md");
    if (Buffer.byteLength(content, "utf8") > 5 * 1024 * 1024) {
      throw new Error("单篇自动沉淀笔记不能超过 5MB。");
    }
    const parsed = matter(content);
    const now = new Date().toISOString();
    parsed.data.updated = now;
    if (!parsed.data.created) parsed.data.created = now;
    this.atomicWrite(absolute, matter.stringify(parsed.content, parsed.data));
    return { ok: true, path: posixPath(relativePath) };
  }

  create(input?: { folder?: string; title?: string }): KnowledgeNote {
    const folder = input?.folder?.trim() || "Inbox";
    const safeFolder = this.safePath(path.join(folder, ".keep"));
    const title = (input?.title?.trim() || "未命名笔记").replace(/[/:\\]/g, "-").slice(0, 100);
    let relative = posixPath(path.join(path.relative(this.root, path.dirname(safeFolder)), `${title}.md`));
    let counter = 2;
    while (existsSync(this.safePath(relative, ".md"))) {
      relative = posixPath(path.join(folder, `${title} ${counter}.md`));
      counter += 1;
    }
    const now = new Date().toISOString();
    this.atomicWrite(
      this.safePath(relative, ".md"),
      matter.stringify(`# ${title}\n\n开始记录你的想法。\n`, { title, tags: [], kind: "material", status: "inbox", created: now, updated: now })
    );
    return this.read(relative);
  }

  rename(relativePath: string, input: { folder?: string; title: string }, expectedMtimeMs?: number) {
    const source = this.safePath(relativePath, ".md");
    const stats = statSync(source);
    if (expectedMtimeMs && Math.abs(stats.mtimeMs - expectedMtimeMs) > 0.001) {
      return { ok: false, reason: "笔记已被其他程序修改，请刷新后再重命名。" };
    }
    const folder = input.folder?.trim() || posixPath(path.dirname(relativePath));
    const title = input.title.trim().replace(/\.md$/i, "").slice(0, 100);
    if (/[\/:\\?*"<>|\x00-\x1f]/.test(title) || title.startsWith(".") || title.endsWith(".")) return { ok: false, reason: "名称不能以点开头或结尾，也不能包含 /、\\、:、?、*、引号等文件名字符。" };
    if (!title) return { ok: false, reason: "笔记名称不能为空。" };
    const targetRelative = posixPath(path.join(folder === "." ? "" : folder, `${title}.md`));
    const target = this.safePath(targetRelative, ".md");
    if (targetRelative.split("/").some(segment => segment.startsWith(".")) || targetRelative.split("/").includes("assets")) {
      return { ok: false, reason: "笔记不能移入隐藏目录、回收站或附件目录。" };
    }
    if (target !== source && existsSync(target)) return { ok: false, reason: "目标位置已经有同名笔记。" };
    const sourceContent = readFileSync(source, "utf8");
    const parsed = matter(sourceContent);
    const oldTitle = cleanTitle(relativePath, parsed.data, parsed.content);
    parsed.data.title = title;
    parsed.data.updated = new Date().toISOString();
    // Only replace the document title, not unrelated headings in imported articles.
    parsed.content = parsed.content.replace(/^#\s+(.+)$/m, (heading, text: string) => text.trim() === oldTitle ? `# ${title}` : heading);
    const index = this.buildIndex();
    const resolve = (from: string, reference: string, wiki: boolean) => {
      let decoded: string;
      try { decoded = decodeURIComponent(reference); } catch { return ""; }
      if (/^(?:[a-z]+:|\/)/i.test(decoded)) return "";
      const withExtension = /\.md$/i.test(decoded) ? decoded : `${decoded}.md`;
      const local = posixPath(path.normalize(path.join(path.dirname(from), withExtension)));
      const exact = wiki ? [withExtension, local] : [local];
      for (const candidate of exact) if (index.some(item => item.path === candidate)) return candidate;
      const matches = index.filter(item => path.basename(item.path) === withExtension);
      return wiki && matches.length === 1 ? matches[0]!.path : "";
    };
    const rewrite = (body: string, from: string) => body.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part, i) => {
      if (i % 2) return part;
      return part.replace(/\[\[([^\]|#]+)(#[^\]|]*)?(\|[^\]]*)?]]/g, (whole, ref: string, anchor = "", alias = "") => {
        const resolved = resolve(from, ref, true);
        if (resolved !== relativePath && from !== relativePath) return whole;
        if (!resolved) return whole;
        const destination = resolved === relativePath ? targetRelative : resolved;
        return `[[${destination.replace(/\.md$/i, "")}${anchor}${alias}]]`;
      }).replace(/(!?\[[^\]]*]\()([^\s)#]+)(#[^\s)]*)?(\))/g, (whole, prefix: string, ref: string, anchor = "", suffix: string) => {
        if (/^(?:[a-z]+:|\/|#)/i.test(ref)) return whole;
        const resolved = resolve(from, ref, false);
        if (resolved !== relativePath && from !== relativePath) return whole;
        let decoded: string;
        try { decoded = decodeURIComponent(ref); } catch { return whole; }
        const destination = resolved === relativePath ? targetRelative : posixPath(path.normalize(path.join(path.dirname(from), decoded)));
        const nextFrom = from === relativePath ? targetRelative : from;
        const nextRef = posixPath(path.relative(path.dirname(nextFrom), destination));
        return `${prefix}${encodeURI(nextRef).replace(/#/g, "%23")}${anchor}${suffix}`;
      });
    }).join("");
    parsed.content = rewrite(parsed.content, relativePath);
    // Prepare all changes before moving the file, then preserve links and attachments.
    const updates = index.filter(item => item.path !== relativePath).map(item => {
      const original = readFileSync(this.safePath(item.path), "utf8");
      const document = matter(original);
      const body = rewrite(document.content, item.path);
      return { path: item.path, original, content: body === document.content ? null : matter.stringify(body, document.data) };
    });
    mkdirSync(path.dirname(target), { recursive: true });
    renameSync(source, target);
    const written: typeof updates = [];
    try {
      this.atomicWrite(target, matter.stringify(parsed.content, parsed.data));
      for (const update of updates) if (update.content !== null) {
        written.push(update);
        this.atomicWrite(this.safePath(update.path), update.content);
      }
    } catch (error) {
      for (const update of written.reverse()) this.atomicWrite(this.safePath(update.path), update.original);
      if (target !== source) renameSync(target, source);
      this.atomicWrite(source, sourceContent);
      throw error;
    }
    return { ok: true, note: this.read(targetRelative) };
  }

  remove(relativePath: string, confirmation: string, options?: { deleteOriginal?: boolean; expectedMtimeMs?: number }) {
    if (confirmation !== relativePath) return { ok: false, reason: "删除确认不匹配。" };
    const source = this.safePath(relativePath, ".md");
    if (options?.expectedMtimeMs && Math.abs(statSync(source).mtimeMs - options.expectedMtimeMs) > 0.001) return { ok: false, reason: "笔记已被其他程序修改，请重新打开删除窗口。" };
    if (options?.deleteOriginal === false) {
      this.atomicWrite(path.join(this.root, ".hermes-console", "excluded.json"), JSON.stringify([...new Set([...this.excludedPaths(), relativePath])]));
      return { ok: true };
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const trashRelative = posixPath(path.join(".trash", `${stamp}-${randomUUID().slice(0, 8)}`, relativePath));
    const target = this.safePath(trashRelative, ".md");
    mkdirSync(path.dirname(target), { recursive: true });
    renameSync(source, target);
    return { ok: true, trashedPath: trashRelative };
  }

  save(relativePath: string, content: string, expectedMtimeMs?: number): KnowledgeSaveResult {
    try {
      const absolute = this.safePath(relativePath, ".md");
      const stats = existsSync(absolute) ? statSync(absolute) : null;
      if (stats && expectedMtimeMs && Math.abs(stats.mtimeMs - expectedMtimeMs) > 0.001) {
        return {
          ok: false,
          conflict: true,
          reason: "这篇笔记已被其他程序修改，请选择保留哪一版。",
          diskContent: readFileSync(absolute, "utf8"),
          mtimeMs: stats.mtimeMs
        };
      }
      if (Buffer.byteLength(content, "utf8") > 5 * 1024 * 1024) {
        return { ok: false, reason: "单篇笔记不能超过 5MB。" };
      }
      const parsed = matter(content);
      parsed.data.updated = new Date().toISOString();
      if (!parsed.data.created) parsed.data.created = parsed.data.updated;
      this.atomicWrite(absolute, matter.stringify(parsed.content, parsed.data));
      return { ok: true, note: this.read(relativePath) };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  updateMetadata(relativePath: string, input: { tags?: string[]; kind?: string; status?: string; topic?: string }, expectedMtimeMs: number): KnowledgeSaveResult {
    const note = this.read(relativePath);
    if (!Number.isFinite(expectedMtimeMs) || expectedMtimeMs <= 0) return { ok: false, reason: "请刷新笔记后重试。" };
    const parsed = matter(note.content);
    if (input.kind !== undefined && !Object.hasOwn(KNOWLEDGE_KINDS, input.kind)) return { ok: false, reason: "无效的内容类型。" };
    if (input.status !== undefined && !Object.hasOwn(KNOWLEDGE_STATUSES, input.status)) return { ok: false, reason: "无效的整理状态。" };
    if (input.tags !== undefined) parsed.data.tags = [...new Set(normalizeTags(input.tags))].map(tag => tag.slice(0, 40)).slice(0, 12);
    if (input.kind !== undefined) parsed.data.kind = input.kind;
    if (input.status !== undefined) parsed.data.status = input.status;
    if (input.topic !== undefined) parsed.data.topic = input.topic.trim().slice(0, 60) || "通用";
    parsed.data.classification_reason = "用户手动整理";
    return this.save(relativePath, matter.stringify(parsed.content, parsed.data), expectedMtimeMs);
  }

  search(query: string) {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return this.snapshot().notes;
    return this.snapshot().notes.filter((note) =>
      [note.title, note.path, note.excerpt, ...note.tags].some((value) => value.toLocaleLowerCase().includes(needle))
    );
  }

  backlinks(relativePath: string) {
    return this.snapshot().notes.filter((note) => note.links.includes(relativePath));
  }

  importImage(input: { name: string; mime: string; data: Uint8Array }) {
    const extension = path.extname(input.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension) || !input.mime.startsWith("image/")) {
      throw new Error("只支持 PNG、JPEG、GIF、WebP 和 AVIF 图片。");
    }
    const data = Buffer.from(input.data);
    if (!data.length || data.length > MAX_IMAGE_BYTES) {
      throw new Error("图片必须小于 20MB。");
    }
    const now = new Date();
    const relative = posixPath(
      path.join("assets", String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"), `${randomUUID()}${extension}`)
    );
    this.atomicWrite(this.safePath(relative), data);
    return { ok: true, path: relative };
  }

  readAsset(relativePath: string) {
    const absolute = this.safePath(relativePath);
    const extension = path.extname(absolute).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) throw new Error("不支持的附件类型。");
    const mime =
      extension === ".png" ? "image/png" :
        extension === ".gif" ? "image/gif" :
          extension === ".webp" ? "image/webp" :
            extension === ".avif" ? "image/avif" : "image/jpeg";
    return { mime, dataBase64: readFileSync(absolute).toString("base64") };
  }

  acceptSuggestion(sourcePath: string, targetPath: string, expectedMtimeMs?: number) {
    const source = this.read(sourcePath);
    const target = this.read(targetPath);
    if (source.links.includes(target.path)) return { ok: true, note: source };
    const suffix = `\n\n## 相关笔记\n\n- [[${path.basename(target.path, ".md")}]]\n`;
    return this.save(source.path, `${source.content.trimEnd()}${suffix}`, expectedMtimeMs);
  }
}
