import { app, BrowserWindow, ipcMain, Menu, MenuItem, screen } from "electron";
import path from "node:path";
import type { PermissionDialogOptions } from "./acp-permissions";
import { PermissionPolicy } from "./permission-policy";
import { permissionHtml } from "./permission-html";

type Pending = {
  options: PermissionDialogOptions;
  finish: (response: number) => void;
};
const pending = new Map<number, Pending>();
let policy: PermissionPolicy;
let toggle: MenuItem;

export function autoAllowPermissions() { return policy?.enabled() ?? false; }

function setAutoAllow(enabled: boolean) {
  policy.set(enabled);
  toggle.checked = enabled;
  if (enabled) {
    for (const request of [...pending.values()]) {
      if (request.options.autoAllowResponse !== null) request.finish(request.options.autoAllowResponse);
    }
  }
}

export function initializePermissionWindows() {
  policy = new PermissionPolicy(path.join(app.getPath("userData"), "permission-policy.json"));
  toggle = new MenuItem({ label: "全部自动允许（所有 Agent，重启后保留）", type: "checkbox", checked: policy.enabled(),
    click: (item) => {
      try { setAutoAllow(item.checked); }
      catch (error) { item.checked = policy.enabled(); console.error("Failed to save permission policy", error); }
    }
  });
  const submenu = new Menu();
  submenu.append(toggle);
  const menu = Menu.getApplicationMenu() ?? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]);
  menu.append(new MenuItem({ label: "权限", submenu }));
  Menu.setApplicationMenu(menu);
  ipcMain.handle("hermes:permission:load", (event) => pending.get(event.sender.id)?.options);
  ipcMain.handle("hermes:permission:submit", (event, input: unknown) => {
    const request = pending.get(event.sender.id);
    if (!request || !input || typeof input !== "object") return { error: "权限请求已失效。" };
    const { response, allowAll } = input as { response?: unknown; allowAll?: unknown };
    if (typeof response !== "number" || !Number.isInteger(response) || response < 0 || response >= request.options.buttons.length) {
      return { error: "无效的授权选项。" };
    }
    if (allowAll === true && request.options.allowResponses.includes(response)) {
      try { setAutoAllow(true); }
      catch { return { error: "无法保存自动允许设置，请重试或仅允许一次。" }; }
    }
    request.finish(response);
    return { ok: true };
  });
}

export function showPermissionWindow(parent: BrowserWindow, options: PermissionDialogOptions, signal: AbortSignal): Promise<{ response: number }> {
  if (signal.aborted || parent.isDestroyed()) return Promise.resolve({ response: 0 });
  if (autoAllowPermissions() && options.autoAllowResponse !== null) return Promise.resolve({ response: options.autoAllowResponse });
  return new Promise((resolve) => {
    const work = screen.getDisplayMatching(parent.getBounds()).workArea;
    const width = Math.min(760, work.width - 24), height = Math.min(640, work.height - 24);
    const window = new BrowserWindow({
      parent, modal: true, width, height, minWidth: Math.min(480, width), minHeight: Math.min(360, height),
      x: work.x + Math.round((work.width - width) / 2), y: work.y + Math.round((work.height - height) / 2),
      show: false, title: "Hermes · 权限申请", backgroundColor: "#f7f7f8", minimizable: false,
      webPreferences: { preload: path.join(__dirname, "../preload/permission-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    const id = window.webContents.id;
    let settled = false;
    const finish = (response: number) => {
      if (settled) return;
      settled = true;
      pending.delete(id);
      signal.removeEventListener("abort", abort);
      if (!window.isDestroyed()) window.destroy();
      resolve({ response });
    };
    const abort = () => finish(0);
    pending.set(id, { options, finish });
    signal.addEventListener("abort", abort, { once: true });
    window.on("closed", abort);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.webContents.on("render-process-gone", abort);
    window.once("ready-to-show", () => { if (!settled) { window.show(); window.focus(); } });
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(permissionHtml)}`).catch(abort);
  });
}
