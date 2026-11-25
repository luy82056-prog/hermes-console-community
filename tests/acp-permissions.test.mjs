import assert from "node:assert/strict";
import test from "node:test";
import {
  permissionCommand,
  automaticPermissionOption,
  requestUserPermission,
  trustedNotionPayloadPermissionOption,
  trustedNotionPermissionOption
} from "../dist/main/acp-permissions.js";

const executable = "/Users/test/.hermes/bin/hermes-notion";
const params = (command, options = ["allow_once", "deny"]) => ({
  options: options.map((optionId) => ({ optionId })),
  toolCall: { rawInput: { command } }
});

test("automatic approval chooses an offered allow option, never a rejection", () => {
  assert.equal(automaticPermissionOption(params("test", ["deny", "allow_session", "allow_once"])), "allow_once");
  assert.equal(automaticPermissionOption({ options: [{ optionId: "custom", kind: "allow_once" }] }), "custom");
  assert.equal(automaticPermissionOption({ options: [{ optionId: "allow_once", kind: "reject_once" }] }), null);
  assert.equal(automaticPermissionOption(params("test", ["deny", "deny_always"])), null);
  assert.equal(automaticPermissionOption({ options: [null, {}] }), null);
});

test("long content remains complete and dangerous HTML stays data", async () => {
  const content = '<script>throw Error("untrusted")</script>\n'.repeat(5000);
  await requestUserPermission({
    options: [{ optionId: "allow_once" }],
    toolCall: { rawInput: { content } }
  }, async (dialog) => {
    assert.equal(JSON.parse(dialog.detail).content, content);
    assert.equal(dialog.autoAllowResponse, 1);
    assert.deepEqual(dialog.allowResponses, [1]);
    return { response: 0 };
  });
});

test("ordinary permission waits for user selection and preserves option IDs", async () => {
  let choose;
  let completed = false;
  const pending = requestUserPermission(params("echo approval-test"), async (dialog) => {
    assert.match(dialog.detail, /echo approval-test/);
    assert.deepEqual(dialog.buttons, ["取消", "允许一次", "拒绝"]);
    assert.equal(dialog.defaultId, 0);
    assert.equal(dialog.cancelId, 0);
    return new Promise((resolve) => { choose = resolve; });
  }).then((value) => { completed = true; return value; });
  await Promise.resolve();
  assert.equal(completed, false);
  choose({ response: 1 });
  assert.deepEqual(await pending, { outcome: { outcome: "selected", optionId: "allow_once" } });
});

test("deny, cancel, dialog errors and malformed options never grant permission", async () => {
  assert.deepEqual(await requestUserPermission(params("echo test"), async () => ({ response: 2 })),
    { outcome: { outcome: "selected", optionId: "deny" } });
  for (const response of [0, -1, 99]) {
    assert.deepEqual(await requestUserPermission(params("echo test"), async () => ({ response })),
      { outcome: { outcome: "cancelled" } });
  }
  assert.deepEqual(await requestUserPermission(params("echo test"), async () => { throw new Error("closed"); }),
    { outcome: { outcome: "cancelled" } });
  assert.deepEqual(await requestUserPermission({ options: [null, {}] }, async () => { throw new Error("must not show"); }),
    { outcome: { outcome: "cancelled" } });
});

test("edit approvals show target and content, and accept opaque protocol IDs", async () => {
  const result = await requestUserPermission({
    toolCall: { title: "Write file", rawInput: { tool: "write_file", arguments: { path: "/tmp/example", content: "hello" } } },
    options: [{ optionId: "opaque-allow", name: "Allow edit", kind: "allow_once" }]
  }, async (dialog) => {
    assert.match(dialog.detail, /\/tmp\/example/);
    assert.match(dialog.detail, /hello/);
    assert.equal(dialog.buttons[1], "Allow edit");
    return { response: 1 };
  });
  assert.equal(result.outcome.optionId, "opaque-allow");
});

test("extracts the ACP terminal command", () => {
  assert.equal(permissionCommand(params(`${executable} status`)), `${executable} status`);
});

test("allows the exact restricted Notion wrapper", () => {
  assert.equal(trustedNotionPermissionOption(params(`${executable} search writing`), executable), "allow_once");
  assert.equal(trustedNotionPermissionOption(params(`'${executable}' status`), executable), "allow_once");
});

test("rejects shell chaining and similar executable names", () => {
  assert.equal(trustedNotionPermissionOption(params(`${executable} status; rm -rf /`), executable), null);
  assert.equal(trustedNotionPermissionOption(params(`${executable}-unsafe status`), executable), null);
  assert.equal(trustedNotionPermissionOption(params(`/bin/sh ${executable} status`), executable), null);
});

test("falls back to a supported scoped option", () => {
  assert.equal(
    trustedNotionPermissionOption(params(`${executable} status`, ["allow_session", "deny"]), executable),
    "allow_session"
  );
});

test("allows Notion payload edits only inside the dedicated directory", () => {
  const editParams = (tool, target) => ({
    options: [{ optionId: "allow_once" }, { optionId: "deny" }],
    toolCall: { rawInput: { tool, arguments: { path: target, content: "{}" } } }
  });
  const root = "/Users/test/.hermes/notion-payloads";

  assert.equal(
    trustedNotionPayloadPermissionOption(editParams("write_file", `${root}/weekly-report.json`), root),
    "allow_once"
  );
  assert.equal(
    trustedNotionPayloadPermissionOption(editParams("patch", `${root}/weekly-report.json`), root),
    "allow_once"
  );
  assert.equal(trustedNotionPayloadPermissionOption(editParams("write_file", `${root}/../config.yaml`), root), null);
  assert.equal(trustedNotionPayloadPermissionOption(editParams("write_file", "/tmp/report.json"), root), null);
  assert.equal(trustedNotionPayloadPermissionOption(editParams("read_file", `${root}/report.json`), root), null);
});
