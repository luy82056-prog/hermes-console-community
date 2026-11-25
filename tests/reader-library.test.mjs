import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import { ReaderLibrary } from "../dist/main/reader-library.js";

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "hermes-reader-"));
  const reader = new ReaderLibrary(root);
  reader.initialize();
  return { root, reader };
}

async function minimalEpub() {
  const zip = new JSZip();
  zip.file("META-INF/container.xml", `<?xml version="1.0"?>
    <container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`);
  zip.file("OEBPS/content.opf", `<?xml version="1.0"?>
    <package><metadata><dc:title>测试之书</dc:title><dc:creator>作者</dc:creator></metadata>
    <manifest>
      <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
      <item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/>
      <item id="img" href="cover.png" media-type="image/png"/>
    </manifest><spine><itemref idref="c1"/></spine></package>`);
  zip.file("OEBPS/nav.xhtml", `<nav epub:type="toc"><ol><li><a href="chapter.xhtml">第一章</a></li></ol></nav>`);
  zip.file("OEBPS/chapter.xhtml", `<html><body><h1>第一章</h1><script>bad()</script><p>值得划线的内容</p><img src="cover.png"></body></html>`);
  zip.file("OEBPS/cover.png", Buffer.from([137, 80, 78, 71]));
  return zip.generateAsync({ type: "uint8array" });
}

test("imports text documents and persists progress and highlights", async () => {
  const { root, reader } = fixture();
  try {
    const imported = reader.importBuffer({
      name: "focus.md",
      data: new TextEncoder().encode("---\ntitle: 专注阅读\n---\n# 正文\n\n保持注意力。")
    });
    assert.equal(imported.path, "Books/focus.md");
    const opened = await reader.open(imported.path);
    assert.equal(opened.title, "专注阅读");
    assert.match(opened.content, /保持注意力/);

    const progress = reader.updateProgress(imported.path, { scrollRatio: 0.62, fontScale: 130, theme: "night" });
    assert.equal(progress.scrollRatio, 0.62);
    assert.equal(progress.fontScale, 130);
    assert.equal(progress.theme, "night");

    const highlighted = reader.addHighlight(imported.path, "保持注意力。");
    assert.equal(highlighted.highlights.length, 1);
    const exported = reader.exportHighlights(imported.path);
    assert.match(readFileSync(path.join(root, exported.path), "utf8"), /保持注意力/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parses EPUB chapters, toc and images while removing active content", async () => {
  const { root, reader } = fixture();
  try {
    const imported = reader.importBuffer({ name: "book.epub", data: await minimalEpub() });
    const opened = await reader.open(imported.path);
    assert.equal(opened.type, "epub");
    assert.equal(opened.title, "测试之书");
    assert.equal(opened.author, "作者");
    assert.deepEqual(opened.toc.map((item) => item.label), ["第一章"]);
    assert.match(opened.html, /data:image\/png;base64/);
    assert.doesNotMatch(opened.html, /<script|bad\(\)/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects unsupported files and paths outside the vault", async () => {
  const { root, reader } = fixture();
  try {
    assert.throws(() => reader.importBuffer({ name: "payload.html", data: new Uint8Array([1]) }), /只支持/);
    await assert.rejects(() => reader.open("../outside.epub"), /当前知识库/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
