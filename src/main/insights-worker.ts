import { execFile } from "node:child_process";
import type { SourceConfig } from "../shared/insights";
export interface SourceWorker { call<T>(method: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> }
export class OrbitWorker implements SourceWorker {
  constructor(private binary: string, private home: string, private progress: (message: string) => void = () => {}) {}
  call<T>(method: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const child = execFile(this.binary, [], { timeout: method === "scan" ? 30 * 60_000 : 120_000, maxBuffer: 64 * 1024 * 1024, signal }, (error, stdout) => {
        try {
          const result = JSON.parse(stdout.trim());
          if (!result.ok) throw new Error(result.reason || "来源读取失败");
          if (error) throw error;
          resolve(result.data as T);
        } catch (parseError) { reject(signal?.aborted ? new Error("任务已暂停") : error || parseError); }
      });
      let pending = "";
      child.stderr?.on("data", data => {
        pending += String(data);
        const lines = pending.split("\n"); pending = lines.pop() || "";
        for (const line of lines) try {
          const { progress } = JSON.parse(line);
          if (progress) { const stage=({capture:"读取文件",map:"构建索引",publish:"保存索引"} as Record<string,string>)[progress.stage]||"处理中";this.progress(`${progress.source || "来源"} · ${stage} ${progress.completed ?? ""}/${progress.total ?? ""}`); }
        } catch { /* diagnostics do not become user content */ }
        if (pending.length > 10000) pending = "";
      });
      child.stdin?.on("error", () => {});
      child.stdin?.end(JSON.stringify({ home: this.home, method, args }) + "\n");
    });
  }
}
export function defaultSources(home: string): SourceConfig[] {
  return [
    { id: "hermes", agent: "hermes", root: `${home}/.hermes`, enabled: true },
    ...["parent", "child-a", "child-b"].map(id => ({ id: `console-${id}`, agent: "hermes" as const, root: `${home}/.hermes-console/agents/${id}`, enabled: true })),
    { id: "codex", agent: "codex", root: `${home}/.codex`, enabled: true },
    { id: "claude", agent: "claude_code", root: `${home}/.claude`, enabled: true }
  ];
}
