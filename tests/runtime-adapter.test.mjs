import assert from "node:assert/strict";
import test from "node:test";
import { OpenClawRuntimeAdapter, RuntimeRegistry } from "../dist/main/runtime-adapter.js";

test("registry supports an OpenClaw-compatible gateway without UI changes", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async listAgents() {
      return [{ agentId: "claw-a", name: "Claw A", model: "model-a", status: "idle" }];
    },
    async startSession(input) {
      return { agentId: input.agentId, sessionId: "session-1", createdAt: new Date(0).toISOString() };
    },
    async send(sessionId, prompt) { calls.push(["send", sessionId, prompt]); return { ok: true }; },
    async interrupt(sessionId) { calls.push(["interrupt", sessionId]); return { ok: true }; },
    subscribe() { return () => {}; }
  };
  const registry = new RuntimeRegistry();
  const adapter = registry.register(new OpenClawRuntimeAdapter(client));
  await registry.connectAll();
  assert.equal(registry.list()[0].id, "openclaw");
  assert.equal((await adapter.listAgents())[0].runtimeId, "openclaw");
  const session = await adapter.startSession({ agentId: "claw-a" });
  assert.equal(session.runtimeId, "openclaw");
  await adapter.send(session.sessionId, "hello");
  await adapter.interrupt(session.sessionId);
  assert.deepEqual(calls, ["connect", ["send", "session-1", "hello"], ["interrupt", "session-1"]]);
});
