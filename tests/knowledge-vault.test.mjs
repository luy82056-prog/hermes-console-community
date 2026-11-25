import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { KnowledgeVault } from "../dist/main/knowledge-vault.js";
import { knowledgeTopic, matchesKnowledgeView } from "../dist/shared/knowledge-taxonomy.js";

test("metadata updates preserve body and custom frontmatter, reject stale edits", () => {
  const vault = new KnowledgeVault(mkdtempSync(path.join(os.tmpdir(), "hermes-metadata-")));
  vault.initialize();
  vault.writeGenerated('Inbox/材料.md', '---\ntitle: 材料\nsource_url: https://example.com\n---\n# 材料\n\n原始正文。\n');
  const note = vault.read('Inbox/材料.md');
  const result = vault.updateMetadata(note.path, { tags: ['学习方法', '学习方法'], kind: 'knowledge', status: 'active' }, note.mtimeMs);
  assert.equal(result.ok, true);
  assert.deepEqual(result.note.tags, ['学习方法']);
  assert.equal(result.note.status, 'active');
  assert.match(result.note.content, /https:\/\/example.com/);
  assert.match(result.note.content, /原始正文。/);
  assert.equal(vault.updateMetadata(note.path, { status: 'archived' }, note.mtimeMs).ok, false);
  assert.equal(vault.updateMetadata(note.path, { status: 'invalid' }, result.note.mtimeMs).ok, false);
  const archived = vault.updateMetadata(note.path, { status: 'archived' }, result.note.mtimeMs);
  assert.equal(archived.note.status, 'archived');
  assert.match(archived.note.content, /原始正文。/);
});

test("topic classification uses intent; navigation excludes archives and supports child folders", () => {
  assert.equal(knowledgeTopic('学习方法：先博后渊', '金融、健康、AI、写作'), '学习方法');
  const note = { status: 'active', kind: 'project', topic: '职业发展', tags: ['职业发展'], folder: 'Projects/职业/简历' };
  const filters = { status: 'active', kind: 'all', topic: 'all', tag: '', folder: 'Projects' };
  assert.equal(matchesKnowledgeView(note, filters), true);
  assert.equal(matchesKnowledgeView({...note, status:'archived'}, filters), false);
  assert.equal(matchesKnowledgeView(note, {...filters, tag:'健康'}), false);
});

test("initializes a portable markdown vault and derives links", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hermes-knowledge-"));
  const vault = new KnowledgeVault(root);
  const initial = vault.initialize();
  assert.ok(initial.notes.some((note) => note.path.endsWith(".md")));

  const first = vault.create({ folder: "Learning", title: "金融基础" });
  const second = vault.create({ folder: "Learning", title: "资产定价" });
  const saved = vault.save(first.path, `${first.content}\n关联 [[资产定价]]。\n`, first.mtimeMs);
  assert.equal(saved.ok, true);

  const snapshot = vault.snapshot();
  const target = snapshot.notes.find((note) => note.path === second.path);
  assert.equal(target?.backlinks, 1);
  assert.ok(snapshot.graph.links.some((link) => link.source === first.path && link.target === second.path && link.kind === "link"));

  const renamed = vault.rename(second.path, { folder: "Projects", title: "资产定价地图" }, second.mtimeMs);
  assert.equal(renamed.ok, true);
  assert.equal(renamed.note.path, "Projects/资产定价地图.md");
  const removed = vault.remove(renamed.note.path, renamed.note.path);
  assert.equal(removed.ok, true);
  assert.ok(readFileSync(path.join(root, removed.trashedPath), "utf8").includes("资产定价"));
});

test("rejects path traversal and protects external edits with optimistic locking", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hermes-knowledge-"));
  const vault = new KnowledgeVault(root);
  vault.initialize();
  assert.throws(() => vault.read("../outside.md"), /Vault|路径/);

  const note = vault.create({ title: "冲突测试" });
  const firstSave = vault.save(note.path, `${note.content}\n第一版`, note.mtimeMs);
  assert.equal(firstSave.ok, true);
  const staleSave = vault.save(note.path, `${note.content}\n过期版本`, note.mtimeMs);
  assert.equal(staleSave.ok, false);
  assert.equal("conflict" in staleSave && staleSave.conflict, true);
});

test("imports images under assets and keeps bytes intact", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hermes-knowledge-"));
  const vault = new KnowledgeVault(root);
  vault.initialize();
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const result = vault.importImage({ name: "sample.png", mime: "image/png", data: bytes });
  assert.match(result.path, /^assets\/\d{4}\/\d{2}\//);
  assert.deepEqual([...readFileSync(path.join(root, result.path))], [...bytes]);
  assert.equal(vault.readAsset(result.path).mime, "image/png");
});

test("rename synchronizes title, heading, inbound links and moved attachments", () => {
  const vault = new KnowledgeVault(mkdtempSync(path.join(os.tmpdir(), "hermes-rename-")));
  vault.initialize();
  const note = vault.create({ folder: 'Notes', title: '旧标题' });
  vault.writeGenerated(note.path, note.content + '\n![图](../assets/image.png)\n[[Notes/旧标题#章节|别名]]\n');
  vault.writeGenerated('Notes/引用.md', '# 引用\n\n[[旧标题|别名]] [链接](旧标题.md#章节)\n`[[旧标题]]`\n');
  const before = vault.read(note.path);
  const result = vault.rename(note.path, { folder: 'Projects/项目', title: '新标题' }, before.mtimeMs);
  assert.equal(result.ok, true);
  assert.equal(result.note.title, '新标题');
  assert.match(result.note.content, /# 新标题/);
  assert.match(result.note.content, /!\[图\]\(\.\.\/\.\.\/assets\/image.png\)/);
  assert.match(result.note.content, /\[\[Projects\/项目\/新标题#章节\|别名\]\]/);
  const ref = vault.read('Notes/引用.md');
  assert.match(ref.content, /\[\[Projects\/项目\/新标题\|别名\]\]/);
  assert.match(ref.content, /`\[\[旧标题\]\]`/);
  assert.ok(ref.links.includes(result.note.path));
  assert.ok(ref.content.includes(encodeURI('../Projects/项目/新标题.md')));
  assert.equal(vault.rename(result.note.path, { title: '再改' }, before.mtimeMs).ok, false);
});

test("remove without deleting preserves exact bytes and survives restart; restore reindexes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hermes-exclude-"));
  const vault = new KnowledgeVault(root);
  vault.initialize();
  const note = vault.create({ title: '保留原文' });
  const before = readFileSync(path.join(root, note.path), 'utf8');
  assert.equal(vault.remove(note.path, note.path, { deleteOriginal: false, expectedMtimeMs: note.mtimeMs }).ok, true);
  assert.equal(readFileSync(path.join(root, note.path), 'utf8'), before);
  const reopened = new KnowledgeVault(root);
  assert.ok(!reopened.snapshot().notes.some(item => item.path === note.path));
  assert.ok(!reopened.snapshot().graph.nodes.some(item => item.id === note.path));
  assert.deepEqual(reopened.snapshot().excluded, [note.path]);
  reopened.restoreExcluded(note.path);
  assert.equal(reopened.read(note.path).content, before);
});

test("delete checks external changes and trash stays outside index", () => {
  const vault = new KnowledgeVault(mkdtempSync(path.join(os.tmpdir(), "hermes-trash-")));
  vault.initialize();
  const note = vault.create({ title: '删除保护' });
  const changed = vault.save(note.path, note.content + '\n外部编辑', note.mtimeMs).note;
  assert.equal(vault.remove(note.path, note.path, { deleteOriginal: true, expectedMtimeMs: note.mtimeMs }).ok, false);
  assert.equal(vault.remove(note.path, 'wrong').ok, false);
  const removed = vault.remove(note.path, note.path, { deleteOriginal: true, expectedMtimeMs: changed.mtimeMs });
  assert.equal(removed.ok, true);
  assert.match(removed.trashedPath, /^\.trash\//);
  assert.ok(!vault.snapshot().notes.some(item => item.title === note.title));
  assert.match(readFileSync(path.join(vault.root, removed.trashedPath), 'utf8'), /外部编辑/);
});

test("rename rejects reserved destinations, unsafe names and collisions without losing source", () => {
  const vault = new KnowledgeVault(mkdtempSync(path.join(os.tmpdir(), 'hermes-name-')));
  vault.initialize();
  const note = vault.create({ title: '原文' });
  const taken = vault.create({ title: '已存在' });
  for (const input of [{title:'.隐藏'}, {title:'bad/name'}, {title:'原文',folder:'.trash'}, {title:'原文',folder:'assets'}, {title:taken.title}]) {
    assert.equal(vault.rename(note.path, input, note.mtimeMs).ok, false);
    assert.equal(vault.read(note.path).content, note.content);
  }
});

test("symlinks cannot move or delete a file outside the vault", async () => {
  const {symlinkSync,writeFileSync} = await import('node:fs');
  const root=mkdtempSync(path.join(os.tmpdir(),'hermes-symlink-'));
  const outside=mkdtempSync(path.join(os.tmpdir(),'hermes-outside-'));
  writeFileSync(path.join(outside,'external.md'),'external');
  const vault=new KnowledgeVault(root);vault.initialize();
  symlinkSync(outside,path.join(root,'linked'),'dir');
  assert.throws(()=>vault.remove('linked/external.md','linked/external.md'),/符号链接/);
  assert.equal(readFileSync(path.join(outside,'external.md'),'utf8'),'external');
});
