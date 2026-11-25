/*
 * EPUB reading behavior is adapted from BabyReader:
 * https://github.com/KingJing1/babyreader
 * Copyright (c) 2026 一龙小包子, MIT License.
 */
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import JSZip from "jszip";
import sanitizeHtml from "sanitize-html";

export type ReaderDocumentType = "markdown" | "text" | "epub";
export type ReaderTheme = "paper" | "night";

export type ReaderHighlight = {
  id: string;
  text: string;
  createdAt: string;
  chapter?: string;
};

export type ReaderProgress = {
  scrollRatio: number;
  fontScale: number;
  theme: ReaderTheme;
  updatedAt: string;
  highlights: ReaderHighlight[];
};

export type ReaderDocumentSummary = {
  path: string;
  name: string;
  title: string;
  author: string;
  type: ReaderDocumentType;
  size: number;
  updatedAt: string;
  progress: ReaderProgress;
};

export type ReaderTocItem = {
  label: string;
  target: string;
  depth: number;
};

export type ReaderDocument = ReaderDocumentSummary & {
  content: string;
  html: string;
  toc: ReaderTocItem[];
};

type ReaderStateFile = {
  version: 1;
  documents: Record<string, ReaderProgress>;
};

const SUPPORTED_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".epub"]);
const MAX_DOCUMENT_BYTES = 80 * 1024 * 1024;

function posixPath(value: string) {
  return value.split(path.sep).join("/");
}

function xmlAttribute(tag: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2] || "";
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeZipPath(value: string) {
  const parts: string[] = [];
  for (const part of value.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function resolveZipPath(baseDirectory: string, reference: string) {
  const clean = decodeURIComponent(reference.split("#")[0] || "").replace(/^\/+/, "");
  return normalizeZipPath(`${baseDirectory}/${clean}`);
}

function mimeFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".svg") return "image/svg+xml";
  return "image/jpeg";
}

function safeEpubBody(body: string) {
  return sanitizeHtml(body, {
    allowedTags: [
      "article", "aside", "blockquote", "br", "caption", "code", "col", "colgroup",
      "dd", "del", "div", "dl", "dt", "em", "figcaption", "figure", "h1", "h2", "h3",
      "h4", "h5", "h6", "hr", "i", "img", "li", "mark", "ol", "p", "pre", "q",
      "s", "section", "small", "span", "strong", "sub", "sup", "table", "tbody", "td",
      "tfoot", "th", "thead", "tr", "u", "ul"
    ],
    allowedAttributes: {
      "*": ["id", "class", "title"],
      img: ["src", "alt", "width", "height"]
    },
    allowedSchemes: ["data"],
    allowProtocolRelative: false,
    transformTags: {
      a: "span"
    }
  });
}

function defaultProgress(): ReaderProgress {
  return {
    scrollRatio: 0,
    fontScale: 100,
    theme: "paper",
    updatedAt: new Date(0).toISOString(),
    highlights: []
  };
}

export class ReaderLibrary {
  readonly root: string;
  private readonly statePath: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.statePath = path.join(this.root, ".hermes-console", "reader-state.json");
  }

  initialize() {
    mkdirSync(path.dirname(this.statePath), { recursive: true });
    if (!existsSync(this.statePath)) this.atomicWrite(this.statePath, JSON.stringify({ version: 1, documents: {} }, null, 2));
  }

  private safePath(relativePath: string) {
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\0")) {
      throw new Error("无效的阅读文件路径。");
    }
    const absolute = path.resolve(this.root, path.normalize(relativePath));
    const relation = path.relative(this.root, absolute);
    if (!relation || relation.startsWith("..") || path.isAbsolute(relation)) {
      throw new Error("阅读文件必须位于当前知识库中。");
    }
    return absolute;
  }

  private atomicWrite(target: string, content: string | Buffer) {
    mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(descriptor, content);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, target);
  }

  private readState(): ReaderStateFile {
    try {
      const parsed = JSON.parse(readFileSync(this.statePath, "utf8")) as Partial<ReaderStateFile>;
      return {
        version: 1,
        documents: typeof parsed.documents === "object" && parsed.documents ? parsed.documents : {}
      };
    } catch {
      return { version: 1, documents: {} };
    }
  }

  private writeState(state: ReaderStateFile) {
    this.atomicWrite(this.statePath, JSON.stringify(state, null, 2));
  }

  private files(directory = this.root): string[] {
    const result: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".hermes-console" || entry.name === "assets") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) result.push(...this.files(absolute));
      else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) result.push(absolute);
    }
    return result;
  }

  private typeFor(filePath: string): ReaderDocumentType {
    const extension = path.extname(filePath).toLowerCase();
    return extension === ".epub" ? "epub" : extension === ".txt" ? "text" : "markdown";
  }

  list(): ReaderDocumentSummary[] {
    const state = this.readState();
    return this.files()
      .map((absolute) => {
        const relative = posixPath(path.relative(this.root, absolute));
        const stats = statSync(absolute);
        const type = this.typeFor(absolute);
        let title = path.basename(relative, path.extname(relative));
        if (type === "markdown") {
          try {
            const parsed = matter(readFileSync(absolute, "utf8"));
            title = String(parsed.data.title || parsed.content.match(/^#\s+(.+)$/m)?.[1] || title).trim();
          } catch {}
        }
        return {
          path: relative,
          name: path.basename(relative),
          title,
          author: "",
          type,
          size: stats.size,
          updatedAt: stats.mtime.toISOString(),
          progress: { ...defaultProgress(), ...(state.documents[relative] || {}) }
        };
      })
      .sort((a, b) => b.progress.updatedAt.localeCompare(a.progress.updatedAt) || b.updatedAt.localeCompare(a.updatedAt));
  }

  importBuffer(input: { name: string; data: Uint8Array }) {
    const extension = path.extname(input.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error("只支持 Markdown、TXT 和 EPUB 文件。");
    const data = Buffer.from(input.data);
    if (!data.length || data.length > MAX_DOCUMENT_BYTES) throw new Error("阅读文件必须小于 80MB。");
    const safeName = path.basename(input.name).replace(/[/:\\]/g, "-");
    let relative = posixPath(path.join("Books", safeName));
    let counter = 2;
    while (existsSync(this.safePath(relative))) {
      relative = posixPath(path.join("Books", `${path.basename(safeName, extension)} ${counter}${extension}`));
      counter += 1;
    }
    this.atomicWrite(this.safePath(relative), data);
    return { ok: true, path: relative };
  }

  importFile(sourcePath: string) {
    const stats = statSync(sourcePath);
    if (!stats.isFile() || stats.size > MAX_DOCUMENT_BYTES) throw new Error("阅读文件必须是小于 80MB 的普通文件。");
    const extension = path.extname(sourcePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error("只支持 Markdown、TXT 和 EPUB 文件。");
    return this.importBuffer({ name: path.basename(sourcePath), data: readFileSync(sourcePath) });
  }

  async open(relativePath: string): Promise<ReaderDocument> {
    const absolute = this.safePath(relativePath);
    const extension = path.extname(absolute).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error("不支持的阅读文件类型。");
    const summary = this.list().find((item) => item.path === posixPath(relativePath));
    if (!summary) throw new Error("找不到这个阅读文件。");

    if (summary.type !== "epub") {
      const raw = readFileSync(absolute, "utf8");
      const parsed = summary.type === "markdown" ? matter(raw) : null;
      return {
        ...summary,
        title: String(parsed?.data.title || summary.title),
        content: parsed?.content ?? raw,
        html: "",
        toc: []
      };
    }

    const parsed = await this.parseEpub(readFileSync(absolute));
    return {
      ...summary,
      title: parsed.title || summary.title,
      author: parsed.author,
      content: "",
      html: parsed.html,
      toc: parsed.toc
    };
  }

  updateProgress(relativePath: string, patch: Partial<Omit<ReaderProgress, "highlights">>) {
    this.safePath(relativePath);
    const state = this.readState();
    const current = { ...defaultProgress(), ...(state.documents[relativePath] || {}) };
    state.documents[relativePath] = {
      ...current,
      ...patch,
      scrollRatio: Math.min(1, Math.max(0, Number(patch.scrollRatio ?? current.scrollRatio))),
      fontScale: Math.min(180, Math.max(70, Number(patch.fontScale ?? current.fontScale))),
      theme: patch.theme === "night" ? "night" : patch.theme === "paper" ? "paper" : current.theme,
      updatedAt: new Date().toISOString()
    };
    this.writeState(state);
    return state.documents[relativePath];
  }

  addHighlight(relativePath: string, text: string, chapter?: string) {
    this.safePath(relativePath);
    const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 4000);
    if (cleaned.length < 2) throw new Error("请先选择一段文字。");
    const state = this.readState();
    const current = { ...defaultProgress(), ...(state.documents[relativePath] || {}) };
    if (!current.highlights.some((item) => item.text === cleaned)) {
      current.highlights.push({ id: randomUUID(), text: cleaned, chapter, createdAt: new Date().toISOString() });
    }
    current.updatedAt = new Date().toISOString();
    state.documents[relativePath] = current;
    this.writeState(state);
    return current;
  }

  removeHighlight(relativePath: string, highlightId: string) {
    this.safePath(relativePath);
    const state = this.readState();
    const current = { ...defaultProgress(), ...(state.documents[relativePath] || {}) };
    current.highlights = current.highlights.filter((item) => item.id !== highlightId);
    current.updatedAt = new Date().toISOString();
    state.documents[relativePath] = current;
    this.writeState(state);
    return current;
  }

  exportHighlights(relativePath: string) {
    const document = this.list().find((item) => item.path === relativePath);
    if (!document) throw new Error("找不到这个阅读文件。");
    const highlights = document.progress.highlights;
    if (!highlights.length) throw new Error("这份文档还没有划线。");
    const title = document.title.replace(/[/:\\]/g, "-");
    const outputRelative = posixPath(path.join("Books", "Highlights", `${title} 划线.md`));
    const lines = [
      "---",
      `title: "${title.replace(/"/g, "\\\"")} 划线"`,
      `source: "${relativePath.replace(/"/g, "\\\"")}"`,
      `updated: "${new Date().toISOString()}"`,
      "tags:",
      "  - 阅读划线",
      "---",
      "",
      `# 《${title}》划线`,
      ""
    ];
    for (const highlight of highlights) {
      lines.push(`> ${highlight.text.replace(/\n/g, "\n> ")}`, "", `<small>${highlight.createdAt}</small>`, "");
    }
    this.atomicWrite(this.safePath(outputRelative), lines.join("\n"));
    return { ok: true, path: outputRelative };
  }

  private async parseEpub(data: Buffer) {
    const zip = await JSZip.loadAsync(data);
    const container = await zip.file("META-INF/container.xml")?.async("text");
    const opfPath = container?.match(/full-path\s*=\s*(["'])([^"']+\.opf)\1/i)?.[2];
    if (!opfPath) throw new Error("EPUB 中缺少 OPF 目录文件。");
    const opfXml = await zip.file(opfPath)?.async("text");
    if (!opfXml) throw new Error("无法读取 EPUB 目录。");
    const opfDirectory = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";
    const title = decodeXml(opfXml.match(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1] || "");
    const author = decodeXml(opfXml.match(/<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/i)?.[1] || "");

    const manifest = new Map<string, { fullPath: string; mediaType: string; properties: string }>();
    for (const match of opfXml.matchAll(/<item\b[^>]*>/gi)) {
      const id = xmlAttribute(match[0], "id");
      const href = xmlAttribute(match[0], "href");
      if (!id || !href) continue;
      manifest.set(id, {
        fullPath: resolveZipPath(opfDirectory, href),
        mediaType: xmlAttribute(match[0], "media-type"),
        properties: xmlAttribute(match[0], "properties")
      });
    }

    const spine: string[] = [];
    for (const match of opfXml.matchAll(/<itemref\b[^>]*>/gi)) {
      const id = xmlAttribute(match[0], "idref");
      if (id) spine.push(id);
    }

    const chapterTargets = new Map<string, string>();
    const chapters: string[] = [];
    for (const id of spine) {
      const item = manifest.get(id);
      if (!item) continue;
      const source = await zip.file(item.fullPath)?.async("text");
      if (!source) continue;
      const body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || source;
      const chapterId = `reader-chapter-${chapters.length + 1}`;
      chapterTargets.set(item.fullPath, `#${chapterId}`);
      const directory = item.fullPath.includes("/") ? item.fullPath.slice(0, item.fullPath.lastIndexOf("/")) : "";
      let bodyWithAssets = body;
      const imageSources = [...bodyWithAssets.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi)];
      for (const image of imageSources) {
        const reference = image[2] || "";
        if (!reference || reference.startsWith("data:")) continue;
        const imagePath = resolveZipPath(directory, reference);
        const imageFile = zip.file(imagePath);
        if (!imageFile) continue;
        const base64 = await imageFile.async("base64");
        bodyWithAssets = bodyWithAssets.split(reference).join(`data:${mimeFromPath(imagePath)};base64,${base64}`);
      }
      const safeBody = safeEpubBody(bodyWithAssets);
      chapters.push(`<section class="reader-epub-chapter" id="${chapterId}">${safeBody}</section>`);
    }
    if (!chapters.length) throw new Error("EPUB 中没有可阅读章节。");

    const toc: ReaderTocItem[] = [];
    const nav = [...manifest.values()].find((item) => /\bnav\b/i.test(item.properties));
    if (nav) {
      const navXml = await zip.file(nav.fullPath)?.async("text");
      const navDirectory = nav.fullPath.includes("/") ? nav.fullPath.slice(0, nav.fullPath.lastIndexOf("/")) : "";
      const tocBody = navXml?.match(/<nav\b[^>]*(?:epub:type|type)\s*=\s*(["'])[^"']*\btoc\b[^"']*\1[^>]*>([\s\S]*?)<\/nav>/i)?.[2] || "";
      for (const match of tocBody.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
        const fullPath = resolveZipPath(navDirectory, match[2] || "");
        const target = chapterTargets.get(fullPath);
        const label = decodeXml(match[3] || "");
        if (target && label) toc.push({ label, target, depth: 0 });
      }
    }
    if (!toc.length) {
      chapters.forEach((_chapter, index) => toc.push({ label: `第 ${index + 1} 章`, target: `#reader-chapter-${index + 1}`, depth: 0 }));
    }
    return { title, author, html: chapters.join("<hr class=\"reader-chapter-break\">"), toc };
  }
}
