import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export type ModelSyncStatus = {
  source: "online" | "cache" | "builtin";
  checkedAt?: string;
  updatedAt?: string;
  reason?: string;
};
type Catalog = { models: unknown[] };
type SavedCatalog = { identity: string; catalog: Catalog; etag?: string; updatedAt: string };
function readJson(file: string): any {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

/** Read-only access to Codex credentials. Never refresh or overwrite its tokens/cache. */
export class ModelCatalogSync {
  status: ModelSyncStatus = { source: "builtin" };
  private saved: SavedCatalog | null = null;
  private identity = "";
  private token = "";
  private nextCheck = 0;
  private pending: Promise<void> | null = null;
  private failures = 0;
  constructor(private codexHome: string, private cacheFile: string,
    private request: typeof fetch = fetch, private now = Date.now) {}

  private credentials() {
    const auth = readJson(path.join(this.codexHome, "auth.json"));
    const tokens = auth?.tokens;
    if (auth?.auth_mode === "apikey" || typeof tokens?.access_token !== "string" || !tokens.access_token) return null;
    let subject = "";
    try { subject = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString()).sub ?? ""; } catch { /* Older sign-ins may not include an ID token. */ }
    const identity = createHash("sha256").update(JSON.stringify([tokens.account_id ?? "", subject || tokens.id_token || tokens.access_token])).digest("hex");
    return { identity, token: tokens.access_token, accountId: tokens.account_id };
  }

  catalog(): Catalog | null {
    const credentials = this.credentials();
    const identity = credentials?.identity ?? "";
    if (identity !== this.identity) {
      this.identity = identity;
      this.saved = null;
      this.nextCheck = 0;
      this.failures = 0;
      this.status = { source: "builtin" };
      const saved = readJson(this.cacheFile);
      if (identity && saved?.identity === identity && Array.isArray(saved?.catalog?.models)) {
        this.saved = saved;
        this.status = { source: "cache", updatedAt: saved.updatedAt };
      }
    }
    if (this.saved) return this.saved.catalog;
    // Only use Codex's local cache when its account identity can be verified.
    const local = readJson(path.join(this.codexHome, "models_cache.json"));
    if (credentials?.accountId && local?.identity?.account_id === credentials.accountId && Array.isArray(local?.models)) {
      this.status = { ...this.status, source: "cache", updatedAt: local.fetched_at };
      return local;
    }
    return null;
  }

  async refresh(force = false): Promise<void> {
    this.catalog();
    if (this.pending) return this.pending;
    const credentials = this.credentials();
    if (!credentials) { this.status = { source: "builtin", reason: "未找到 ChatGPT / Codex 登录，请先在本机登录。" }; return; }
    if (credentials.token !== this.token) { this.token = credentials.token; this.nextCheck = 0; }
    if (!force && this.now() < this.nextCheck) return;
    const identity = credentials.identity;
    this.pending = (async () => {
      this.nextCheck = this.now() + 30_000;
      try {
        const local = readJson(path.join(this.codexHome, "models_cache.json"));
        const version = typeof local?.client_version === "string" && /^\d+\.\d+\.\d+$/.test(local.client_version) ? local.client_version : "0.162.1";
        const headers: Record<string, string> = { Authorization: `Bearer ${credentials.token}` };
        if (typeof credentials.accountId === "string" && credentials.accountId) headers["ChatGPT-Account-ID"] = credentials.accountId;
        if (this.saved?.etag) headers["If-None-Match"] = this.saved.etag;
        const response = await this.request(`https://chatgpt.com/backend-api/codex/models?client_version=${version}`, {
          headers, redirect: "error", signal: AbortSignal.timeout(15_000)
        });
        if (this.credentials()?.identity !== identity) return; // An account switch invalidates in-flight responses.
        if (response.status !== 304 || !this.saved) {
          if (!response.ok) throw new Error(`目录刷新失败（HTTP ${response.status}），稍后自动重试。`);
          const body = await response.json() as Catalog;
          if (!body || !Array.isArray(body.models)) throw new Error("目录格式异常，保留上次结果并稍后重试。");
          if (this.credentials()?.identity !== identity) return;
          const saved: SavedCatalog = { identity, catalog: body, etag: response.headers.get("etag") ?? undefined, updatedAt: new Date(this.now()).toISOString() };
          mkdirSync(path.dirname(this.cacheFile), { recursive: true });
          const temporary = `${this.cacheFile}.tmp`;
          writeFileSync(temporary, JSON.stringify(saved), { mode: 0o600 });
          renameSync(temporary, this.cacheFile);
          this.saved = saved;
        }
        this.failures = 0;
        const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get("cache-control") ?? "");
        this.nextCheck = this.now() + Math.max(30_000, Number(maxAge?.[1] ?? 0) * 1000);
        this.status = { source: "online", checkedAt: new Date(this.now()).toISOString(), updatedAt: this.saved?.updatedAt };
      } catch (error) {
        if (this.credentials()?.identity !== identity) return;
        this.nextCheck = this.now() + Math.min(300_000, 30_000 * 2 ** this.failures++);
        this.status = { ...this.status, source: this.saved ? "cache" : this.status.source,
          reason: error instanceof Error && error.message.startsWith("目录") ? error.message : "暂时无法连接模型目录，保留离线列表并自动重试。" };
      }
    })().finally(() => { this.pending = null; });
    return this.pending;
  }
}
