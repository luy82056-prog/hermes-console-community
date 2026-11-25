import { contextBridge, ipcRenderer } from "electron";

type GatewayAction = "start" | "stop" | "restart" | "status";
type LogName = "agent" | "errors" | "gateway";
type OpenTarget = "home" | "config" | "logs";
type RealtimeVoice = "marin" | "cedar" | "alloy" | "shimmer" | "verse";

const hermes = {
  insightsStatus: () => ipcRenderer.invoke("hermes:insights:status"),
  insightsRun: () => ipcRenderer.invoke("hermes:insights:run"),
  insightsPause: (paused:boolean) => ipcRenderer.invoke("hermes:insights:pause",paused),
  insightsSource: (id:string,enabled:boolean) => ipcRenderer.invoke("hermes:insights:source",id,enabled),
  insightsTimeline: (query?:string,day?:string,offset?:number) => ipcRenderer.invoke("hermes:insights:timeline",query,day,offset),
  insightsEvidence: (id:string) => ipcRenderer.invoke("hermes:insights:evidence",id),
  insightsMemory: (id:string,action:"confirm"|"reject"|"forget") => ipcRenderer.invoke("hermes:insights:memory",id,action),
  insightsProposal: (id:string,action:"apply"|"reject"|"revert") => ipcRenderer.invoke("hermes:insights:proposal",id,action),
  insightsNative: (item:import("../shared/insights").NativePending,action:"approve"|"reject"|"undo") => ipcRenderer.invoke("hermes:insights:native",item,action),
  onInsightsUpdated: (callback:()=>void) => { const listener=()=>callback();ipcRenderer.on("hermes:insights:updated",listener);return()=>ipcRenderer.removeListener("hermes:insights:updated",listener); },
  snapshot: () => ipcRenderer.invoke("hermes:snapshot"),
  status: () => ipcRenderer.invoke("hermes:status"),
  updateInfo: () => ipcRenderer.invoke("hermes:updateInfo"),
  updateHermes: () => ipcRenderer.invoke("hermes:update"),
  gateway: (action: GatewayAction) => ipcRenderer.invoke("hermes:gateway", action),
  cron: (action: "list" | "status" | "tick") => ipcRenderer.invoke("hermes:cron", action),
  schedulerList: () => ipcRenderer.invoke("hermes:scheduler:list"),
  schedulerCreate: (input: unknown) => ipcRenderer.invoke("hermes:scheduler:create", input),
  schedulerUpdate: (jobId: string, input: unknown) => ipcRenderer.invoke("hermes:scheduler:update", jobId, input),
  schedulerPause: (jobId: string) => ipcRenderer.invoke("hermes:scheduler:pause", jobId),
  schedulerResume: (jobId: string) => ipcRenderer.invoke("hermes:scheduler:resume", jobId),
  schedulerRun: (jobId: string) => ipcRenderer.invoke("hermes:scheduler:run", jobId),
  schedulerRemove: (jobId: string) => ipcRenderer.invoke("hermes:scheduler:remove", jobId),
  schedulerStatus: () => ipcRenderer.invoke("hermes:scheduler:status"),
  kanbanBoards: () => ipcRenderer.invoke("hermes:kanban:boards"),
  kanbanList: (board?: string) => ipcRenderer.invoke("hermes:kanban:list", board),
  kanbanStats: (board?: string) => ipcRenderer.invoke("hermes:kanban:stats", board),
  kanbanCreate: (input: unknown) => ipcRenderer.invoke("hermes:kanban:create", input),
  kanbanShow: (board: string, taskId: string) => ipcRenderer.invoke("hermes:kanban:show", board, taskId),
  kanbanRuns: (board: string, taskId: string) => ipcRenderer.invoke("hermes:kanban:runs", board, taskId),
  kanbanLink: (board: string, parentId: string, childId: string) => ipcRenderer.invoke("hermes:kanban:link", board, parentId, childId),
  kanbanAssign: (board: string, taskId: string, assignee: string) => ipcRenderer.invoke("hermes:kanban:assign", board, taskId, assignee),
  kanbanBlock: (board: string, taskId: string, reason?: string) => ipcRenderer.invoke("hermes:kanban:block", board, taskId, reason),
  kanbanRetry: (board: string, taskId: string) => ipcRenderer.invoke("hermes:kanban:retry", board, taskId),
  kanbanCancel: (board: string, taskId: string) => ipcRenderer.invoke("hermes:kanban:cancel", board, taskId),
  automationPause: () => ipcRenderer.invoke("hermes:automation:pause"),
  automationResume: () => ipcRenderer.invoke("hermes:automation:resume"),
  runtimeList: () => ipcRenderer.invoke("runtime:list"),
  runtimeAgents: (runtimeId: string) => ipcRenderer.invoke("runtime:agents", runtimeId),
  runtimeStartSession: (runtimeId: string, input: { agentId: string; modelPresetId?: string }) =>
    ipcRenderer.invoke("runtime:startSession", runtimeId, input),
  runtimeSend: (runtimeId: string, sessionId: string, prompt: string) =>
    ipcRenderer.invoke("runtime:send", runtimeId, sessionId, prompt),
  runtimeInterrupt: (runtimeId: string, sessionId: string) =>
    ipcRenderer.invoke("runtime:interrupt", runtimeId, sessionId),
  knowledgeCleanup: () => ipcRenderer.invoke("hermes:knowledge:cleanup"),
  knowledgeCleanupStatus: () => ipcRenderer.invoke("hermes:knowledge:cleanupStatus"),
  knowledgeCleanupCancel: () => ipcRenderer.invoke("hermes:knowledge:cleanupCancel"),
  knowledgeCleanupRestore: (id: string) => ipcRenderer.invoke("hermes:knowledge:cleanupRestore", id),
  onKnowledgeCleanup: (callback: (state: import("../shared/knowledge-cleanup").CleanupProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: import("../shared/knowledge-cleanup").CleanupProgress) => callback(state);
    ipcRenderer.on("hermes:knowledge:cleanupProgress", listener);
    return () => ipcRenderer.removeListener("hermes:knowledge:cleanupProgress", listener);
  },
  knowledgeSnapshot: () => ipcRenderer.invoke("hermes:knowledge:snapshot"),
  knowledgeUpdateMetadata: (relativePath: string, input: { tags?: string[]; kind?: string; status?: string; topic?: string }, expectedMtimeMs: number) => ipcRenderer.invoke("hermes:knowledge:metadata", relativePath, input, expectedMtimeMs),
  knowledgeRead: (relativePath: string) => ipcRenderer.invoke("hermes:knowledge:read", relativePath),
  knowledgeCreate: (input?: { folder?: string; title?: string }) => ipcRenderer.invoke("hermes:knowledge:create", input),
  knowledgeRename: (relativePath: string, input: { folder?: string; title: string }, expectedMtimeMs?: number) =>
    ipcRenderer.invoke("hermes:knowledge:rename", relativePath, input, expectedMtimeMs),
  knowledgeRemove: (relativePath: string, confirmation: string, options?: { deleteOriginal?: boolean; expectedMtimeMs?: number }) =>
    ipcRenderer.invoke("hermes:knowledge:remove", relativePath, confirmation, options),
  knowledgeRestoreExcluded: (relativePath: string) => ipcRenderer.invoke("hermes:knowledge:restoreExcluded", relativePath),
  knowledgeReveal: (relativePath: string) => ipcRenderer.invoke("hermes:knowledge:reveal", relativePath),
  knowledgeSave: (relativePath: string, content: string, expectedMtimeMs?: number) =>
    ipcRenderer.invoke("hermes:knowledge:save", relativePath, content, expectedMtimeMs),
  knowledgeSearch: (query: string) => ipcRenderer.invoke("hermes:knowledge:search", query),
  knowledgeBacklinks: (relativePath: string) => ipcRenderer.invoke("hermes:knowledge:backlinks", relativePath),
  knowledgeImportImage: (input: { name: string; mime: string; data: Uint8Array }) =>
    ipcRenderer.invoke("hermes:knowledge:importImage", input),
  knowledgeReadAsset: (relativePath: string) => ipcRenderer.invoke("hermes:knowledge:readAsset", relativePath),
  knowledgeAcceptSuggestion: (sourcePath: string, targetPath: string, expectedMtimeMs?: number) =>
    ipcRenderer.invoke("hermes:knowledge:acceptSuggestion", sourcePath, targetPath, expectedMtimeMs),
  knowledgeOpenRoot: () => ipcRenderer.invoke("hermes:knowledge:openRoot"),
  readerList: () => ipcRenderer.invoke("hermes:reader:list"),
  readerOpen: (relativePath: string) => ipcRenderer.invoke("hermes:reader:open", relativePath),
  readerImport: () => ipcRenderer.invoke("hermes:reader:import"),
  readerImportBuffer: (input: { name: string; data: Uint8Array }) =>
    ipcRenderer.invoke("hermes:reader:importBuffer", input),
  readerProgress: (relativePath: string, patch: { scrollRatio?: number; fontScale?: number; theme?: "paper" | "night" }) =>
    ipcRenderer.invoke("hermes:reader:progress", relativePath, patch),
  readerAddHighlight: (relativePath: string, text: string, chapter?: string) =>
    ipcRenderer.invoke("hermes:reader:highlight:add", relativePath, text, chapter),
  readerRemoveHighlight: (relativePath: string, highlightId: string) =>
    ipcRenderer.invoke("hermes:reader:highlight:remove", relativePath, highlightId),
  readerExportHighlights: (relativePath: string) =>
    ipcRenderer.invoke("hermes:reader:highlight:export", relativePath),
  readerNewWindow: (relativePath?: string) =>
    ipcRenderer.invoke("hermes:reader:newWindow", relativePath),
  onKnowledgeUpdated: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("hermes:knowledge:updated", listener);
    return () => ipcRenderer.removeListener("hermes:knowledge:updated", listener);
  },
  secondBrainStatus: () => ipcRenderer.invoke("hermes:secondBrain:status"),
  secondBrainConfigure: (enabled: boolean) => ipcRenderer.invoke("hermes:secondBrain:configure", enabled),
  onSecondBrainUpdated: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("hermes:secondBrain:updated", listener);
    return () => ipcRenderer.removeListener("hermes:secondBrain:updated", listener);
  },
  journalGet: () => ipcRenderer.invoke("hermes:journal:get"),
  journalCategorize: (id: string, topic: string) => ipcRenderer.invoke("hermes:journal:categorize", id, topic),
  heartprintGet: (range?: "7d" | "30d" | "all") => ipcRenderer.invoke("hermes:heartprint:get", range),
  heartprintSaveNote: (note: string, range?: "7d" | "30d" | "all") => ipcRenderer.invoke("hermes:heartprint:note", note, range),
  heartprintRemove: (itemId: string, range?: "7d" | "30d" | "all") => ipcRenderer.invoke("hermes:heartprint:remove", itemId, range),
  heartprintCompact: (range?: "7d" | "30d" | "all") => ipcRenderer.invoke("hermes:heartprint:compact", range),
  heartprintClear: (range?: "7d" | "30d" | "all") => ipcRenderer.invoke("hermes:heartprint:clear", range),
  onHeartprintUpdated: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("hermes:heartprint:updated", listener);
    return () => ipcRenderer.removeListener("hermes:heartprint:updated", listener);
  },
  growthGet: () => ipcRenderer.invoke("hermes:growth:get"),
  growthCreate: (prompt: string) => ipcRenderer.invoke("hermes:growth:create", prompt),
  growthToggle: (capabilityId: string, enabled: boolean) => ipcRenderer.invoke("hermes:growth:toggle", capabilityId, enabled),
  growthAnalyze: (text: string, source: "writing" | "manual" = "writing") => ipcRenderer.invoke("hermes:growth:analyze", text, source),
  onGrowthUpdated: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("hermes:growth:updated", listener);
    return () => ipcRenderer.removeListener("hermes:growth:updated", listener);
  },
  disciplineGet: () => ipcRenderer.invoke("hermes:discipline:get"),
  disciplineCheckIn: (goalId: string, status: "kept" | "slipped" | "done" | "skipped", note?: string) => ipcRenderer.invoke("hermes:discipline:checkIn", goalId, status, note),
  disciplineUpdate: (goalId: string, input: unknown) => ipcRenderer.invoke("hermes:discipline:update", goalId, input),
  onDisciplineUpdated: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("hermes:discipline:updated", listener);
    return () => ipcRenderer.removeListener("hermes:discipline:updated", listener);
  },
  healthGet: () => ipcRenderer.invoke("hermes:health:get"),
  healthUpdateProfile: (input: unknown) => ipcRenderer.invoke("hermes:health:profile", input),
  healthAddRecord: (input: unknown) => ipcRenderer.invoke("hermes:health:record", input),
  healthRefreshEvidence: () => ipcRenderer.invoke("hermes:health:evidence:refresh"),
  healthInterviewPrompt: (userText: string) => ipcRenderer.invoke("hermes:health:interview:prompt", userText),
  healthStartInterview: (userText: string) => ipcRenderer.invoke("hermes:health:interview:start", userText),
  healthArchiveInterview: (userText: string, assistantText: string) => ipcRenderer.invoke("hermes:health:interview:archive", userText, assistantText),
  onHealthUpdated: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("hermes:health:updated", listener);
    return () => ipcRenderer.removeListener("hermes:health:updated", listener);
  },
  logs: (logName: LogName, lines?: number) => ipcRenderer.invoke("hermes:logs", logName, lines),
  sessions: (limit?: number) => ipcRenderer.invoke("hermes:sessions", limit),
  sessionHistory: (agentId?: string, limit?: number) => ipcRenderer.invoke("hermes:sessions:history", agentId, limit),
  loadSession: (agentId: string, sessionId: string) => ipcRenderer.invoke("hermes:sessions:load", agentId, sessionId),
  onAgentModelUpdated: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on("hermes:agent:modelUpdated", listener);
    return () => ipcRenderer.removeListener("hermes:agent:modelUpdated", listener);
  },
  onModelsUpdated: (callback: (presets: unknown[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, presets: unknown[]) => callback(presets);
    ipcRenderer.on("hermes:modelsUpdated", listener);
    return () => ipcRenderer.removeListener("hermes:modelsUpdated", listener);
  },
  discoverModels: (preset: unknown, apiKey?: string) => ipcRenderer.invoke("hermes:discoverModels", preset, apiKey),
  modelPresets: () => ipcRenderer.invoke("hermes:modelPresets"),
  modelSyncStatus: () => ipcRenderer.invoke("hermes:modelSyncStatus"),
  refreshModels: () => ipcRenderer.invoke("hermes:refreshModels"),
  onModelSyncUpdated: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
    ipcRenderer.on("hermes:modelSyncUpdated", listener);
    return () => ipcRenderer.removeListener("hermes:modelSyncUpdated", listener);
  },
  switchModel: (presetId: string) => ipcRenderer.invoke("hermes:modelSwitch", presetId),
  createRealtimeSession: (request: { voice?: RealtimeVoice; mode?: "vad" | "push-to-talk" }) => ipcRenderer.invoke("hermes:realtime:session", request),
  startAgent: (agentId: string, prompt: string, presetId?: string, preset?: unknown) => ipcRenderer.invoke("hermes:agent:start", agentId, prompt, presetId, preset),
  interruptAgent: (agentId?: string) => ipcRenderer.invoke("hermes:agent:interrupt", agentId),
  pauseAgent: (agentId?: string) => ipcRenderer.invoke("hermes:agent:pause", agentId),
  resumeAgent: (agentId?: string) => ipcRenderer.invoke("hermes:agent:resume", agentId),
  newAgentContext: (agentId?: string, presetId?: string) => ipcRenderer.invoke("hermes:agent:newContext", agentId, presetId),
  configureAgentModel: (agentId: string, preset: unknown, apiKey?: string) => ipcRenderer.invoke("hermes:agent:configureModel", agentId, preset, apiKey),
  verifyAgentModel: (agentId: string) => ipcRenderer.invoke("hermes:agent:verifyModel", agentId),
  agentState: (agentId?: string) => ipcRenderer.invoke("hermes:agent:state", agentId),
  agentStates: () => ipcRenderer.invoke("hermes:agent:states"),
  onAgentEvent: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("hermes:agent:event", listener);
    return () => ipcRenderer.removeListener("hermes:agent:event", listener);
  },
  openPath: (target: OpenTarget) => ipcRenderer.invoke("hermes:openPath", target),
  openExternal: (url: string) => ipcRenderer.invoke("hermes:openExternal", url)
};

contextBridge.exposeInMainWorld("hermes", hermes);

export type HermesBridge = typeof hermes;
