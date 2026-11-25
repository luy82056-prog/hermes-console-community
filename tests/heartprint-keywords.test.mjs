import assert from "node:assert/strict";
import test from "node:test";
import { buildHeartprintKeywords } from "../dist/main/heartprint-keywords.js";

const now = Date.parse("2026-07-14T12:00:00.000Z");
const at = (daysAgo) => new Date(now - daysAgo * 86_400_000).toISOString();

function profile(overrides = {}) {
  return {
    updatedAt: at(0),
    note: "",
    items: [],
    reflections: [],
    ...overrides
  };
}

test("segments Chinese and English while filtering filler words and model names", () => {
  const words = buildHeartprintKeywords(profile({
    reflections: [{ at: at(0), agentId: "parent", user: "然后我想继续写作 writing，使用 GPT-5.6 和 Hermes 帮助我保持谦卑成长。" }]
  }), "30d", now).map((word) => word.text);
  assert.ok(words.includes("写作"));
  assert.ok(words.includes("writing"));
  assert.ok(words.includes("谦卑"));
  assert.ok(words.includes("成长"));
  assert.ok(!words.includes("然后"));
  assert.ok(!words.some((word) => word.includes("gpt")));
  assert.ok(!words.includes("hermes"));
});

test("never derives keywords from text that looks like a secret assignment", () => {
  const words = buildHeartprintKeywords(profile({
    reflections: [{ at: at(0), agentId: "parent", user: "API_KEY=sk-sensitive 继续写作成长" }]
  }), "30d", now);
  assert.equal(words.length, 0);
});

test("respects seven-day, thirty-day and all-time ranges", () => {
  const input = profile({
    reflections: [
      { at: at(2), agentId: "parent", user: "近期写作写作" },
      { at: at(15), agentId: "parent", user: "月内阅读阅读" },
      { at: at(60), agentId: "parent", user: "旧时旅行旅行" }
    ]
  });
  assert.deepEqual(buildHeartprintKeywords(input, "7d", now).map((word) => word.text), ["写作", "近期"]);
  assert.ok(buildHeartprintKeywords(input, "30d", now).some((word) => word.text === "阅读"));
  assert.ok(buildHeartprintKeywords(input, "all", now).some((word) => word.text === "旅行"));
});

test("caps repetition within one message so repeated conversations can win", () => {
  const repeated = Array.from({ length: 80 }, () => "独占").join(" ");
  const words = buildHeartprintKeywords(profile({
    reflections: [
      { at: at(0), agentId: "parent", user: repeated },
      { at: at(0), agentId: "parent", user: "成长" },
      { at: at(0), agentId: "child-a", user: "成长" },
      { at: at(0), agentId: "child-b", user: "成长" },
      { at: at(0), agentId: "parent", user: "成长" }
    ]
  }), "30d", now);
  assert.equal(words[0].text, "成长");
  assert.ok(words.length <= 24);
});

test("uses semantic category and preserves three newest sources", () => {
  const words = buildHeartprintKeywords(profile({
    reflections: [
      { at: at(0), agentId: "parent", user: "我希望持续写作" },
      { at: at(1), agentId: "child-a", user: "写作是长期目标" },
      { at: at(2), agentId: "child-b", user: "继续写作练习" },
      { at: at(3), agentId: "parent", user: "写作记录" }
    ]
  }), "30d", now);
  const writing = words.find((word) => word.text === "写作");
  assert.equal(writing?.category, "goal");
  assert.equal(writing?.sources.length, 3);
  assert.equal(writing?.sources[0].at, at(0));
});
