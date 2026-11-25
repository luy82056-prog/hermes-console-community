import assert from "node:assert/strict";
import test from "node:test";
import {
  extractHeartprintMemories,
  heartprintMemoryContext,
  ingestHeartprintTurn,
  normalizeHeartprintProfile
} from "../dist/main/heartprint-memory.js";

const now = "2026-07-26T08:00:00.000Z";

test("extracts durable writing preferences instead of storing the full prompt", () => {
  const source = "不错的就是这个思路，以后不要瞎编，尽量按照我输出的文字来写。你是我的美化和辅助助手，不是我的写作主导。请重新写成一篇 800 字文章。";
  const memories = extractHeartprintMemories(source);
  assert.equal(memories.length, 1);
  assert.equal(memories[0].category, "boundary");
  assert.match(memories[0].text, /不要编造/);
  assert.ok(memories[0].text.length < 90);
});

test("keeps transient requests as evidence but not as long-term memory", () => {
  const { profile } = normalizeHeartprintProfile(null, now);
  const next = ingestHeartprintTurn(profile, {
    agentId: "parent",
    userText: "非常好，顺便帮我想几个微信公众号标题吧。",
    assistantText: "这里有五个标题。",
    at: now
  });
  assert.equal(next.items.length, 0);
  assert.equal(next.reflections.length, 1);
  assert.match(next.reflections[0].user, /公众号标题/);
});

test("merges repeated memories and raises confidence", () => {
  const { profile } = normalizeHeartprintProfile(null, now);
  const first = ingestHeartprintTurn(profile, {
    agentId: "parent",
    userText: "以后写文章不要瞎编，要尽量保留我输出的原话。",
    assistantText: "明白。",
    at: now
  });
  const second = ingestHeartprintTurn(first, {
    agentId: "child-a",
    userText: "写作时不要大幅删改，我希望你只是辅助梳理和润色。",
    assistantText: "收到。",
    at: "2026-07-26T09:00:00.000Z"
  });
  assert.equal(second.items.length, 1);
  assert.equal(second.items[0].evidenceCount, 2);
  assert.ok(second.items[0].confidence > first.items[0].confidence);
});

test("migrates legacy raw prompts into a compact version 2 profile", () => {
  const sourceArticle = "开始今天的文章写作吧。" + "电影和文学作品并不直接指导现实生活。".repeat(80);
  const legacy = {
    version: 1,
    updatedAt: now,
    revision: 8,
    note: "",
    reflections: [],
    items: [
      { id: "article", category: "fact", text: sourceArticle, sourceAgent: "parent", createdAt: now, updatedAt: now },
      { id: "rule", category: "boundary", text: "以后不要瞎编，写文章尽量保留我的原话，你只是辅助润色。", sourceAgent: "parent", createdAt: now, updatedAt: now }
    ]
  };
  const { profile, migrated } = normalizeHeartprintProfile(legacy, now);
  assert.equal(migrated, true);
  assert.equal(profile.version, 2);
  assert.equal(profile.items.length, 1);
  assert.ok(profile.items[0].text.length < 90);
  assert.ok(!profile.items.some((item) => item.text.includes("电影和文学作品")));
});

test("agent context contains only high-confidence compact memories", () => {
  const { profile } = normalizeHeartprintProfile(null, now);
  const next = ingestHeartprintTurn(profile, {
    agentId: "parent",
    userText: "我最近最想做的是戒色、健身，以及保持规律睡眠。",
    assistantText: "我会协助你。",
    at: now
  });
  const context = heartprintMemoryContext(next);
  assert.match(context, /戒色、健身并保持规律睡眠/);
  assert.ok(context.length < 400);
  assert.ok(!context.includes("我会协助你"));
});
