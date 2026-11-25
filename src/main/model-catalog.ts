import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export type CatalogPreset = {
  id: string; label: string; model: string; provider: string; providerLabel: string;
  baseUrl: string; apiKeyEnv?: string; custom?: boolean;
  available?: boolean;
};

export function customModelId(preset: Pick<CatalogPreset, "provider" | "model" | "baseUrl">) {
  return `custom-${createHash("sha256").update(JSON.stringify([preset.provider, preset.model, preset.baseUrl.replace(/\/$/, "")])).digest("hex").slice(0, 20)}`;
}

export function catalogPresets(cache: unknown, builtins: CatalogPreset[]): CatalogPreset[] {
    if (!cache || typeof cache !== "object" || !Array.isArray((cache as { models?: unknown }).models)) return builtins;
    const items = (cache as { models: unknown[] }).models;
    const models: CatalogPreset[] = [];
    const seen = new Set<string>();
    for (const value of items) {
      const item = value as { slug?: unknown; display_name?: unknown; visibility?: unknown } | null;
      if (!item || typeof item.slug !== "string" || !/^[a-zA-Z0-9._-]+$/.test(item.slug) || item.visibility !== "list" || seen.has(item.slug)) continue;
      seen.add(item.slug);
      const old = builtins.find(p => p.provider === "openai-codex" && p.model === item.slug);
      models.push({ id: old?.id ?? `codex-${item.slug}`, label: typeof item.display_name === "string" ? item.display_name : item.slug,
        model: item.slug, provider: "openai-codex", providerLabel: "ChatGPT / Codex", baseUrl: "https://chatgpt.com/backend-api/codex" });
    }
    // Keep old IDs resolvable for history, but never offer removed models as available.
    return [...models, ...builtins.filter(p => !models.some(m => m.id === p.id)).map(p =>
      p.provider === "openai-codex" ? { ...p, available: false } : p)];
}

/** Offline fallback only. Remote discovery has its own account-scoped cache. */
export function readCodexCatalog(filePath: string, builtins: CatalogPreset[]): CatalogPreset[] {
  try {
    if (!existsSync(filePath)) return builtins;
    const cache = JSON.parse(readFileSync(filePath, "utf8"));
    return catalogPresets(cache, builtins);
  } catch { return builtins; }
}
