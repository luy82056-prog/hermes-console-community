import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { classifyJournalDetail, classifyLegacyJournal, journalRulesVersion, journalTextKey, journalTopics, type JournalEntry, type JournalTopic } from "../shared/heart-journal";

type Store = { version: 2; sources: Record<string, string[]>; entries: JournalEntry[] };
export class HeartJournal {
  constructor(private file: string) {}
  private read(): Store {
    if (!existsSync(this.file)) return { version: 2, sources: {}, entries: [] };
    const store = JSON.parse(readFileSync(this.file, "utf8"));
    if (![1, 2].includes(store.version) || !Array.isArray(store.entries) || !store.sources) throw new Error("心迹档案格式异常，已停止写入以保护原始数据");
    let changed = store.version === 1;
    for (const entry of store.entries as JournalEntry[]) {
      if (store.version === 1 && !entry.classificationSource && entry.topic !== classifyLegacyJournal(entry.text)) {
        entry.classificationSource = "manual";
        entry.classificationReason = "保留旧版中不同于自动规则的分类";
      }
    }
    for (const entry of store.entries as JournalEntry[]) {
      if (entry.classificationSource !== "manual" && entry.rulesVersion !== journalRulesVersion) {
        Object.assign(entry, this.classification(store, entry.text));
        changed = true;
      }
    }
    if (changed) {
      const backup = `${this.file}.before-rules-v${journalRulesVersion}`;
      if (!existsSync(backup)) copyFileSync(this.file, backup);
      store.version = 2;
      this.write(store);
    }
    return store;
  }
  private write(store: Store) {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
    renameSync(temp, this.file);
  }
  private classification(store: Store, text: string) {
    const manual = [...store.entries].reverse().find(e => e.classificationSource === "manual" && journalTextKey(e.text) === journalTextKey(text));
    const decision = classifyJournalDetail(text);
    return { topic: manual?.topic ?? decision.topic, classificationSource: manual ? "manual" as const : "auto" as const,
      classificationReason: manual ? "沿用你对相同内容的手动分类" : decision.reason, rulesVersion: journalRulesVersion };
  }
  sync(source: string, texts: string[], at = new Date().toISOString(), sourceAt?: string) {
    const store = this.read();
    const current = [...new Set(texts.map(t => t.trim()).filter(t => t && !/(?:api[_ -]?key|password|密码|access[_ -]?token|secret)\s*[:=]|sk-[A-Za-z0-9_-]{16,}/i.test(t)))];
    const previous = store.sources[source];
    if (previous && JSON.stringify(previous) === JSON.stringify(current)) return;
    for (const text of current.filter(t => !previous?.includes(t))) {
      store.entries.push({ id: randomUUID(), text, source, at, sourceAt, ...this.classification(store, text), kind: previous ? "added" : "baseline" });
    }
    for (const text of (previous ?? []).filter(t => !current.includes(t))) {
      store.entries.push({ id: randomUUID(), text, source, at, ...this.classification(store, text), kind: "removed" });
    }
    store.sources[source] = current;
    this.write(store);
  }
  // Console's bounded working memory is additive here: eviction is not a change in belief.
  capture(texts: string[], at = new Date().toISOString()) {
    const store = this.read();
    const originalCount = store.entries.length;
    const known = new Set(store.entries.filter(e => e.source === "Console 对话").map(e => e.text));
    for (const text of texts) {
      if (known.has(text)) continue;
      known.add(text);
      store.entries.push({ id: createHash("sha256").update(`console:${text}`).digest("hex"), text, source: "Console 对话", at, ...this.classification(store, text), kind: "added" });
    }
    if (store.entries.length !== originalCount) this.write(store);
  }
  categorize(id: string, topic: JournalTopic) {
    if (!Object.hasOwn(journalTopics, topic)) throw new Error("未知心迹分类");
    const store = this.read();
    const entry = store.entries.find(e => e.id === id);
    if (!entry) throw new Error("找不到这条心迹");
    for (const related of store.entries.filter(e => journalTextKey(e.text) === journalTextKey(entry.text))) {
      related.topic = topic;
      related.classificationSource = "manual";
      related.classificationReason = "你手动设置的分类";
      related.rulesVersion = journalRulesVersion;
    }
    this.write(store);
  }
  entries() { return this.read().entries.slice().reverse(); }
}
export function parseNativeMemories(content: string) {
  return content.split(/\n§\n/).map(t => t.trim()).filter(Boolean);
}
