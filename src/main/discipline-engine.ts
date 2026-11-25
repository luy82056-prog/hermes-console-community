import { randomUUID } from "node:crypto";

export type DisciplineMode = "avoid" | "build";
export type DisciplineStatus = "kept" | "slipped" | "done" | "skipped";

export type DisciplineGoal = {
  id: string;
  title: string;
  mode: DisciplineMode;
  reason: string;
  minimumAction: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DisciplineCheckIn = {
  id: string;
  goalId: string;
  date: string;
  status: DisciplineStatus;
  note: string;
  at: string;
};

export type DisciplineProfile = {
  version: 1;
  revision: number;
  updatedAt: string;
  goals: DisciplineGoal[];
  checkIns: DisciplineCheckIn[];
};

export type DisciplineStats = {
  currentStreak: number;
  longestStreak: number;
  totalSuccess: number;
  xp: number;
  level: number;
  todayStatus: DisciplineStatus | null;
  recent: Array<{ date: string; status: DisciplineStatus | null; success: boolean }>;
};

const defaultGoals: Array<Pick<DisciplineGoal, "id" | "title" | "mode" | "reason" | "minimumAction">> = [
  { id: "clarity-boundary", title: "戒色", mode: "avoid", reason: "保护注意力与真实关系，不用羞耻驱动改变。", minimumAction: "冲动出现时离开触发环境 10 分钟" },
  { id: "fitness", title: "持续健身", mode: "build", reason: "积累力量、体能和稳定精力。", minimumAction: "至少活动 10 分钟" },
  { id: "sleep", title: "规律睡眠", mode: "build", reason: "用稳定节律支持第二天的状态。", minimumAction: "目标睡前 30 分钟开始收尾" },
  { id: "writing", title: "每日写作", mode: "build", reason: "用持续输出训练表达与判断。", minimumAction: "写下至少 100 字" },
  { id: "deep-learning", title: "深度学习", mode: "build", reason: "让知识通过专注练习真正留下。", minimumAction: "完成 25 分钟专注学习" }
];

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const value = new Date(year, month - 1, day + days, 12);
  return localDateKey(value);
}

function successFor(goal: DisciplineGoal, status: DisciplineStatus | null) {
  return goal.mode === "avoid" ? status === "kept" : status === "done";
}

export function createDefaultDisciplineProfile(now = new Date().toISOString()): DisciplineProfile {
  return {
    version: 1,
    revision: 0,
    updatedAt: now,
    goals: defaultGoals.map((goal) => ({ ...goal, active: true, createdAt: now, updatedAt: now })),
    checkIns: []
  };
}

export function normalizeDisciplineProfile(value: Partial<DisciplineProfile> | null | undefined, now = new Date().toISOString()) {
  const fallback = createDefaultDisciplineProfile(now);
  if (!value || !Array.isArray(value.goals)) return fallback;
  const goals = value.goals.slice(0, 5).map((goal, index) => ({
    ...fallback.goals[index],
    ...goal,
    id: String(goal.id || fallback.goals[index]?.id || `goal-${index + 1}`),
    title: String(goal.title || fallback.goals[index]?.title || `长期目标 ${index + 1}`).slice(0, 20),
    mode: goal.mode === "avoid" ? "avoid" as const : "build" as const,
    reason: String(goal.reason || "").slice(0, 180),
    minimumAction: String(goal.minimumAction || "").slice(0, 120),
    active: goal.active !== false,
    createdAt: goal.createdAt || now,
    updatedAt: goal.updatedAt || now
  }));
  while (goals.length < 5) goals.push({ ...fallback.goals[goals.length], createdAt: now, updatedAt: now });
  return {
    version: 1 as const,
    revision: Math.max(0, Math.floor(Number(value.revision) || 0)),
    updatedAt: value.updatedAt || now,
    goals,
    checkIns: Array.isArray(value.checkIns) ? value.checkIns.filter((item) => item && typeof item.goalId === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date)).slice(0, 2500) : []
  };
}

export function updateDisciplineGoal(profileValue: DisciplineProfile, goalId: string, input: Partial<Pick<DisciplineGoal, "title" | "mode" | "reason" | "minimumAction" | "active">>, at = new Date().toISOString()) {
  const profile = normalizeDisciplineProfile(profileValue, at);
  const goal = profile.goals.find((item) => item.id === goalId);
  if (!goal) return { profile, goal: null };
  if (typeof input.title === "string" && input.title.trim()) goal.title = input.title.trim().slice(0, 20);
  if (input.mode === "avoid" || input.mode === "build") goal.mode = input.mode;
  if (typeof input.reason === "string") goal.reason = input.reason.trim().slice(0, 180);
  if (typeof input.minimumAction === "string") goal.minimumAction = input.minimumAction.trim().slice(0, 120);
  if (typeof input.active === "boolean") goal.active = input.active;
  goal.updatedAt = at;
  profile.updatedAt = at;
  profile.revision += 1;
  return { profile, goal };
}

export function checkInDisciplineGoal(profileValue: DisciplineProfile, goalId: string, status: DisciplineStatus, note = "", at = new Date().toISOString(), date = localDateKey(new Date(at))) {
  const profile = normalizeDisciplineProfile(profileValue, at);
  const goal = profile.goals.find((item) => item.id === goalId);
  if (!goal) return { profile, checkIn: null };
  const validStatus: DisciplineStatus = goal.mode === "avoid" ? (status === "slipped" ? "slipped" : "kept") : (status === "skipped" ? "skipped" : "done");
  const existing = profile.checkIns.find((item) => item.goalId === goalId && item.date === date);
  if (existing) {
    existing.status = validStatus;
    existing.note = note.trim().slice(0, 240);
    existing.at = at;
  } else {
    profile.checkIns.unshift({ id: randomUUID(), goalId, date, status: validStatus, note: note.trim().slice(0, 240), at });
  }
  profile.updatedAt = at;
  profile.revision += 1;
  return { profile, checkIn: profile.checkIns.find((item) => item.goalId === goalId && item.date === date) || null };
}

export function disciplineStats(profileValue: DisciplineProfile, goal: DisciplineGoal, today = localDateKey()) {
  const profile = normalizeDisciplineProfile(profileValue);
  const byDate = new Map(profile.checkIns.filter((item) => item.goalId === goal.id).map((item) => [item.date, item]));
  const successDates = Array.from(byDate.values()).filter((item) => successFor(goal, item.status)).map((item) => item.date).sort();
  let longestStreak = 0;
  let run = 0;
  let previous = "";
  for (const date of successDates) {
    run = previous && shiftDate(previous, 1) === date ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = date;
  }
  const todayCheckIn = byDate.get(today);
  let cursor = todayCheckIn ? (successFor(goal, todayCheckIn.status) ? today : "") : shiftDate(today, -1);
  let currentStreak = 0;
  while (cursor && successFor(goal, byDate.get(cursor)?.status || null)) {
    currentStreak += 1;
    cursor = shiftDate(cursor, -1);
  }
  const totalSuccess = successDates.length;
  const xp = totalSuccess * 10;
  const recent = Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 6)).map((date) => ({
    date,
    status: byDate.get(date)?.status || null,
    success: successFor(goal, byDate.get(date)?.status || null)
  }));
  return {
    currentStreak,
    longestStreak,
    totalSuccess,
    xp,
    level: Math.floor(xp / 100) + 1,
    todayStatus: byDate.get(today)?.status || null,
    recent
  } satisfies DisciplineStats;
}

export function disciplinePayload(profileValue: DisciplineProfile, today = localDateKey()) {
  const profile = normalizeDisciplineProfile(profileValue);
  return {
    profile,
    goals: profile.goals.map((goal) => ({ ...goal, stats: disciplineStats(profile, goal, today) })),
    totalXp: profile.goals.reduce((sum, goal) => sum + disciplineStats(profile, goal, today).xp, 0)
  };
}
