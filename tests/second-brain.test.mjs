import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { KnowledgeVault } from "../dist/main/knowledge-vault.js";
import { SecondBrainEngine, distillConversation } from "../dist/main/second-brain.js";

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "hermes-second-brain-"));
  const vault = new KnowledgeVault(root);
  vault.initialize();
  const engine = new SecondBrainEngine(vault);
  engine.initialize();
  return { root, vault, engine };
}

test("distills structured conclusions, actions and domain tags", () => {
  const result = distillConversation(
    "请帮我制定一个学习金融估值的计划",
    "## 核心概念\n- 现金流折现是估值基础。\n- 风险决定折现率。\n## 下一步\n- 建立一份公司现金流练习表。"
  );
  assert.equal(result.substantial, true);
  assert.ok(result.summary.some((item) => item.includes("现金流")));
  assert.ok(result.actions.some((item) => item.includes("建立")));
  assert.ok(result.tags.includes("金融"));
  assert.ok(result.tags.includes("学习"));
});

test("captures every useful turn in a daily note and creates a knowledge card", async () => {
  const { root, engine } = fixture();
  const captured = await engine.capture({
    agentId: "child-a",
    agentName: "子 Agent A",
    sessionId: "session-1",
    model: "gpt-test",
    userText: "请帮我整理写文章时如何建立清晰结构，并给出今天可以练习的步骤。",
    assistantText: "## 核心方法\n- 先明确读者和结论。\n- 每一段只承担一个论点。\n## 下一步\n- 写一份三段式提纲。\n- 完成后检查段落之间的因果关系。",
    completedAt: "2026-07-25T08:30:00.000Z"
  });
  assert.ok(captured);
  assert.ok(existsSync(path.join(root, captured.dailyPath)));
  assert.ok(existsSync(path.join(root, captured.knowledgePath)));
  assert.match(captured.knowledgePath, /^Inbox\/待整理\//);
  assert.match(captured.dailyPath, /^Archive\/对话日志\//);
  const daily = readFileSync(path.join(root, captured.dailyPath), "utf8");
  const card = readFileSync(path.join(root, captured.knowledgePath), "utf8");
  assert.match(daily, /精炼/);
  assert.match(daily, /知识卡片/);
  assert.match(card, /行动项/);
  assert.match(card, /子 Agent A/);
  assert.match(card, /status: inbox/);
  assert.equal(engine.status().captureCount, 1);

  const duplicate = await engine.capture({
    agentId: "child-a",
    agentName: "子 Agent A",
    sessionId: "session-1",
    model: "gpt-test",
    userText: "请帮我整理写文章时如何建立清晰结构，并给出今天可以练习的步骤。",
    assistantText: "## 核心方法\n- 先明确读者和结论。\n- 每一段只承担一个论点。\n## 下一步\n- 写一份三段式提纲。\n- 完成后检查段落之间的因果关系。"
  });
  assert.equal(duplicate, null);
  assert.equal(engine.status().captureCount, 1);
});

test("long operational answers and failed work never become knowledge cards", async () => {
  const { engine } = fixture();
  for (const [index, userText] of ['去GitHub上帮助我自行搜索查找并安装', '已允许', '好的，继续', '你现在有DBS的skill吗'].entries()) {
    const captured = await engine.capture({ agentId: 'parent', agentName: '主 Agent', sessionId: String(index), model: 'test', userText, assistantText: '## 已完成\n- 安装工具并更新配置。\n- 下一步请重试。\n'.repeat(30) });
    assert.equal(captured.knowledgePath, '');
  }
  const failed = await engine.capture({ agentId: 'parent', agentName: '主 Agent', sessionId: 'failed', model: 'test', userText: '请帮我整理一份完整的学习方法并将学习目标拆解为每天可以验证的具体实践。', assistantText: '## 学习方法\n- 先理解完整体系。\n- 再寻找实践反馈。', outcome: 'failed' });
  assert.equal(failed.knowledgePath, '');
});

test("keeps low-value turns only in the daily log and filters credentials", async () => {
  const { root, engine } = fixture();
  const captured = await engine.capture({
    agentId: "parent",
    agentName: "父 Agent",
    sessionId: "session-2",
    model: "gpt-test",
    userText: "你好",
    assistantText: "你好。API_KEY: sk-example-secret-value-123456789，请告诉我今天想学习什么。"
  });
  assert.ok(captured);
  assert.equal(captured.knowledgePath, "");
  const daily = readFileSync(path.join(root, captured.dailyPath), "utf8");
  assert.doesNotMatch(daily, /sk-example/);

  engine.configure(false);
  const skipped = await engine.capture({
    agentId: "parent",
    agentName: "父 Agent",
    sessionId: "session-3",
    model: "gpt-test",
    userText: "学习新主题",
    assistantText: "这里是一段足够长但不应该被写入的完整回答。".repeat(10)
  });
  assert.equal(skipped, null);
});
