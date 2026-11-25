import assert from "node:assert/strict";
import test from "node:test";
import {
  addHealthRecord,
  applyHealthInterview,
  buildHealthInterviewPrompt,
  cleanHealthAssistantText,
  createDefaultHealthProfile,
  healthAgentContext,
  healthPayload,
  normalizeHealthProfile,
  updateHealthPersonalProfile
} from "../dist/main/health-engine.js";

const emptyRecord = {
  date: "2026-07-28",
  weightKg: 70,
  sleepHours: 7.5,
  sleepQuality: 4,
  energy: 4,
  restingHeartRate: 58,
  steps: 8500,
  trainingMinutes: 50,
  strengthTraining: true,
  symptoms: "",
  note: "训练状态稳定"
};

test("normalizes unsafe or invalid health profile values", () => {
  const profile = normalizeHealthProfile({
    personal: {
      ...createDefaultHealthProfile().personal,
      birthYear: 1800,
      heightCm: 500,
      checkInTime: "99:99",
      shareSummaryWithAgents: true
    }
  });
  assert.equal(profile.personal.birthYear, null);
  assert.equal(profile.personal.heightCm, null);
  assert.equal(profile.personal.checkInTime, "21:30");
  assert.equal(profile.personal.shareSummaryWithAgents, true);
});

test("replaces a same-day record and computes a bounded weekly summary", () => {
  const first = addHealthRecord(createDefaultHealthProfile(), emptyRecord, "2026-07-28T10:00:00.000Z");
  const second = addHealthRecord(first.profile, { ...emptyRecord, sleepHours: 8, energy: 5 }, "2026-07-28T22:00:00.000Z");
  const payload = healthPayload(second.profile, new Date("2026-07-28T12:00:00"));
  assert.equal(payload.profile.records.length, 1);
  assert.equal(payload.summary.sleepAverage, 8);
  assert.equal(payload.summary.energyAverage, 5);
  assert.deepEqual(payload.summary.proteinRange, { minimum: 84, maximum: 119 });
});

test("flags urgent symptoms without attempting a diagnosis", () => {
  const result = addHealthRecord(
    createDefaultHealthProfile(),
    { ...emptyRecord, symptoms: "突然胸痛并且呼吸困难" },
    "2026-07-28T10:00:00.000Z"
  );
  assert.equal(result.urgent, true);
  assert.equal(healthPayload(result.profile).summary.urgentRecent, true);
});

test("shares only a compact health summary after explicit consent", () => {
  const source = addHealthRecord(createDefaultHealthProfile(), emptyRecord).profile;
  assert.equal(healthAgentContext(source), "");
  const shared = updateHealthPersonalProfile(source, {
    shareSummaryWithAgents: true,
    conditions: "膝关节旧伤"
  });
  const context = healthAgentContext(shared, new Date("2026-07-28T12:00:00"));
  assert.match(context, /明确授权/);
  assert.match(context, /膝关节旧伤/);
  assert.match(context, /不得据此诊断/);
});

test("archives only health fields backed by an exact quote from the user", () => {
  const response = [
    "已经记下睡眠和精力。今天是否安排了训练？",
    '<health-update>{"record":{"sleepHours":6,"energy":2,"steps":99999},"evidence":{"sleepHours":"昨晚睡了6小时","energy":"今天精力2分","steps":"我走了99999步"}}</health-update>'
  ].join("\n");
  const result = applyHealthInterview(
    createDefaultHealthProfile(),
    "昨晚睡了6小时，今天精力2分。",
    response,
    "2026-07-28T12:00:00.000Z"
  );
  assert.equal(result.profile.records[0].sleepHours, 6);
  assert.equal(result.profile.records[0].energy, 2);
  assert.equal(result.profile.records[0].steps, null);
  assert.deepEqual(new Set(result.applied), new Set(["date", "sleepHours", "energy"]));
});

test("preserves same-day values and keeps readable interview paragraphs", () => {
  const source = addHealthRecord(createDefaultHealthProfile(), emptyRecord, "2026-07-28T08:00:00.000Z").profile;
  const response = [
    "已更新今天的睡眠。",
    "",
    "还想了解你今天是否训练。",
    '<health-update>{"record":{"date":"2026-07-28","sleepHours":8},"evidence":{"date":"今天是2026-07-28","sleepHours":"睡了8小时"}}</health-update>'
  ].join("\n");
  const result = applyHealthInterview(
    source,
    "今天是2026-07-28，我睡了8小时。",
    response,
    "2026-07-28T12:00:00.000Z"
  );
  assert.equal(result.profile.records[0].sleepHours, 8);
  assert.equal(result.profile.records[0].weightKg, 70);
  assert.match(result.profile.interviews.at(-1).text, /\n\n/);
  assert.doesNotMatch(result.profile.interviews.at(-1).text, /health-update/);
  assert.equal(cleanHealthAssistantText(response), "已更新今天的睡眠。\n\n还想了解你今天是否训练。");
});

test("routes health interviews through the evidence skill and preserves medical boundaries", () => {
  const prompt = buildHealthInterviewPrompt(createDefaultHealthProfile(), "我最近肩膀不舒服，想用中药调理。");
  assert.match(prompt, /personal-health-companion/);
  assert.match(prompt, /当前官方来源/);
  assert.match(prompt, /不凭照片诊断骨骼错位/);
  assert.match(prompt, /草药按可能具有药理活性的产品处理/);
});

test("falls back to local evidence extraction when the agent omits the machine block", () => {
  const result = applyHealthInterview(
    createDefaultHealthProfile(),
    "我是男，身高172cm，现在体重是56.5kg。医生建议我少吃甜食。",
    "已更新：体重 56.5 kg，并记录了医生的饮食建议。",
    "2026-07-29T12:00:00.000Z"
  );
  assert.equal(result.profile.personal.sex, "male");
  assert.equal(result.profile.personal.heightCm, 172);
  assert.equal(result.profile.personal.dietaryRestrictions, "少吃甜食（医生建议）");
  assert.equal(result.profile.records[0].date, "2026-07-29");
  assert.equal(result.profile.records[0].weightKg, 56.5);
  assert.equal(result.archiveSource, "local");
  assert.deepEqual(new Set(result.applied), new Set(["sex", "heightCm", "dietaryRestrictions", "weightKg", "date"]));
});

test("extracts explicit symptom signals without copying sensitive free text into the record", () => {
  const userText = "最近疲劳感明显加重，食欲下降，反复口腔溃疡，偶尔胸闷和左手麻。联系电话 13800138000。";
  const result = applyHealthInterview(
    createDefaultHealthProfile(),
    userText,
    "这些症状建议尽快由医生面诊评估。",
    "2026-07-29T12:00:00.000Z"
  );
  assert.match(result.profile.records[0].symptoms, /疲劳或乏力/);
  assert.match(result.profile.records[0].symptoms, /食欲下降/);
  assert.match(result.profile.records[0].symptoms, /反复口腔溃疡/);
  assert.match(result.profile.records[0].symptoms, /胸闷或气短/);
  assert.match(result.profile.records[0].symptoms, /手麻/);
  assert.doesNotMatch(result.profile.records[0].symptoms, /13800138000/);
});

test("does not infer measurements from generic health discussion", () => {
  const result = applyHealthInterview(
    createDefaultHealthProfile(),
    "体重和睡眠都很重要，今天想聊聊训练计划。",
    "可以，我们先从目标开始。",
    "2026-07-29T12:00:00.000Z"
  );
  assert.equal(result.profile.records.length, 0);
  assert.equal(result.archiveSource, "none");
  assert.deepEqual(result.applied, []);
});
