export type CleanupChange = { action: "remove" | "merge" | "folder"; paths: string[]; reason: string; target?: string };
export type CleanupReport = {
  id: string; at: string; state: "completed" | "restored" | "failed" | "interrupted";
  scanned: number; reviewed: number; changes: CleanupChange[]; warnings: string[];
};
export type CleanupProgress = { running: boolean; message: string; report?: CleanupReport };
