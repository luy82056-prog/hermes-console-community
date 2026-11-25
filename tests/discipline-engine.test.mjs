import assert from "node:assert/strict";
import test from "node:test";
import {
  checkInDisciplineGoal,
  createDefaultDisciplineProfile,
  disciplineStats,
  updateDisciplineGoal
} from "../dist/main/discipline-engine.js";

test("starts with five editable long-term goals", () => {
  const profile = createDefaultDisciplineProfile("2026-07-15T00:00:00.000Z");
  assert.equal(profile.goals.length, 5);
  assert.equal(profile.goals[0].mode, "avoid");
});

test("daily check-in replaces the same day instead of duplicating it", () => {
  let profile = createDefaultDisciplineProfile("2026-07-15T00:00:00.000Z");
  profile = checkInDisciplineGoal(profile, "clarity-boundary", "kept", "", "2026-07-15T12:00:00.000Z", "2026-07-15").profile;
  profile = checkInDisciplineGoal(profile, "clarity-boundary", "slipped", "重新开始", "2026-07-15T13:00:00.000Z", "2026-07-15").profile;
  assert.equal(profile.checkIns.length, 1);
  assert.equal(profile.checkIns[0].status, "slipped");
});

test("streak resets without erasing total success or longest streak", () => {
  let profile = createDefaultDisciplineProfile("2026-07-10T00:00:00.000Z");
  for (const date of ["2026-07-10", "2026-07-11", "2026-07-12"]) {
    profile = checkInDisciplineGoal(profile, "clarity-boundary", "kept", "", `${date}T12:00:00.000Z`, date).profile;
  }
  profile = checkInDisciplineGoal(profile, "clarity-boundary", "slipped", "", "2026-07-13T12:00:00.000Z", "2026-07-13").profile;
  const goal = profile.goals[0];
  const stats = disciplineStats(profile, goal, "2026-07-13");
  assert.equal(stats.currentStreak, 0);
  assert.equal(stats.longestStreak, 3);
  assert.equal(stats.totalSuccess, 3);
});

test("goal settings remain editable", () => {
  const profile = createDefaultDisciplineProfile("2026-07-15T00:00:00.000Z");
  const result = updateDisciplineGoal(profile, "writing", { title: "每日创作", minimumAction: "写 200 字" });
  assert.equal(result.goal.title, "每日创作");
  assert.equal(result.goal.minimumAction, "写 200 字");
});
