import assert from "node:assert/strict";
import test from "node:test";
import {
  createCapabilityFromPrompt,
  createCapabilityFromDefinition,
  createDefaultGrowthProfile,
  ingestGrowthEvidence,
  toggleGrowthCapability
} from "../dist/main/growth-engine.js";

test("default profile offers reusable foundational capabilities", () => {
  const profile = createDefaultGrowthProfile("2026-07-14T00:00:00.000Z");
  assert.equal(profile.capabilities.length, 6);
  assert.deepEqual(profile.capabilities.filter((item) => item.enabled).map((item) => item.id), ["expression", "time-management", "learning", "execution"]);
});

test("writing produces small traceable progress and duplicate text is idempotent", () => {
  const profile = createDefaultGrowthProfile("2026-07-14T00:00:00.000Z");
  const text = "今天我写了一篇文章，先整理结构，再说明观点和论证，最后完成发布。";
  const first = ingestGrowthEvidence(profile, { text, source: "writing", at: "2026-07-14T08:00:00.000Z" });
  assert.ok(first.added.some((item) => item.capabilityId === "expression"));
  assert.ok(first.profile.capabilities.find((item) => item.id === "expression").progress > 0);
  assert.ok(first.profile.capabilities.find((item) => item.id === "expression").progress < 3);
  const second = ingestGrowthEvidence(first.profile, { text, source: "writing", at: "2026-07-14T09:00:00.000Z" });
  assert.equal(second.added.length, 0);
  assert.equal(second.profile.observations.length, 2);
});

test("every meaningful Agent input is observed and implicit phrasing is classified", () => {
  const profile = createDefaultGrowthProfile("2026-07-14T00:00:00.000Z");
  const result = ingestGrowthEvidence(profile, {
    text: "你帮我看看这件事为什么会发生，并且把原因梳理清楚，再给出下一步。",
    agentId: "child-b",
    source: "conversation",
    at: "2026-07-15T01:00:00.000Z"
  });
  assert.equal(result.observed, true);
  assert.equal(result.profile.observations[0].agentId, "child-b");
  assert.ok(result.added.some((item) => item.capabilityId === "learning"));
  assert.ok(result.added.some((item) => item.capabilityId === "execution"));
});

test("disabled capabilities and secrets are not analyzed", () => {
  let profile = createDefaultGrowthProfile("2026-07-14T00:00:00.000Z");
  profile = toggleGrowthCapability(profile, "expression", false).profile;
  const disabled = ingestGrowthEvidence(profile, { text: "写作文章表达结构", source: "writing" });
  assert.equal(disabled.added.some((item) => item.capabilityId === "expression"), false);
  const secret = ingestGrowthEvidence(profile, { text: "API_KEY=secret 写作文章表达结构", source: "writing" });
  assert.equal(secret.added.length, 0);
});

test("natural language creates or enables a capability", () => {
  let profile = createDefaultGrowthProfile("2026-07-14T00:00:00.000Z");
  profile = toggleGrowthCapability(profile, "self-awareness", false).profile;
  const known = createCapabilityFromPrompt(profile, "我想提升情绪觉察和边界能力", "2026-07-14T08:00:00.000Z");
  assert.equal(known.capability.id, "self-awareness");
  assert.equal(known.capability.enabled, true);
  const custom = createCapabilityFromPrompt(known.profile, "我想培养摄影构图能力", "2026-07-14T09:00:00.000Z");
  assert.equal(custom.capability.category, "custom");
  assert.ok(custom.capability.nodes.length >= 5);
});

test("Hermes definitions are normalized before entering the growth map", () => {
  const profile = createDefaultGrowthProfile("2026-07-14T00:00:00.000Z");
  const result = createCapabilityFromDefinition(profile, {
    title: "审美判断力",
    description: "识别、比较并说明作品质量。",
    signals: ["审美", "比较", "判断", "作品"],
    nodes: ["观察", "比较", "解释", "创作"]
  }, "我想培养审美判断力", "2026-07-14T10:00:00.000Z");
  assert.equal(result.capability.title, "审美判断力");
  assert.deepEqual(result.capability.nodes.map((node) => node.title), ["观察", "比较", "解释", "创作"]);
  assert.ok(result.capability.signals.includes("审美"));
});
