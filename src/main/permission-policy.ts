import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export class PermissionPolicy {
  constructor(private readonly file: string) {}
  enabled(): boolean {
    try { return existsSync(this.file) && JSON.parse(readFileSync(this.file, "utf8")).autoAllowAll === true; }
    catch { return false; }
  }
  set(enabled: boolean) {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify({ autoAllowAll: enabled }, null, 2), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
  }
}
