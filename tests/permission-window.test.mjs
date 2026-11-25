import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';

test('permission window contains long content; scoped IPC, persistent auto allow, disable and abort work', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hermes-permissions-'));
  const handlers = new Map();
  let menu, latest, nextId = 10;
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.destroyed = false; latest = this;
      this.webContents = Object.assign(new EventEmitter(), { id: nextId++, setWindowOpenHandler() {} });
    }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
    loadURL(url) { this.url = url; return Promise.resolve(); }
    show() {} focus() {}
  }
  class Menu { items = []; append(item) { this.items.push(item); }
    static getApplicationMenu() { return menu; }
    static buildFromTemplate() { return new Menu(); }
    static setApplicationMenu(value) { menu = value; }
  }
  const fake = {
    app: { getPath: () => root }, BrowserWindow: Window,
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, Menu,
    MenuItem: class { constructor(options) { Object.assign(this, options); } },
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 800, height: 600 } }) }
  };
  const original = Module._load;
  Module._load = function(name, ...args) { return name === 'electron' ? fake : original.call(this, name, ...args); };
  const require = createRequire(import.meta.url);
  let api;
  try { api = require('../dist/main/permission-window.js'); } finally { Module._load = original; }
  const parent = { isDestroyed: () => false, getBounds: () => ({}) };
  const options = { title: 'test', message: 'Long path '.repeat(500), detail: 'long content\n'.repeat(30000), buttons: ['取消','允许一次','拒绝'], autoAllowResponse: 1, allowResponses: [1] };
  try {
    api.initializePermissionWindows();
    assert.equal(api.autoAllowPermissions(), false);
    const promise = api.showPermissionWindow(parent, options, new AbortController().signal);
    const win = latest;
    assert.ok(win.options.height <= 600 && win.options.width <= 800);
    const html = decodeURIComponent(win.url.split(',').slice(1).join(','));
    assert.match(html, /overflow:auto/); assert.match(html, /footer\{flex:none/);
    assert.match(html, /textContent=data.detail/);
    const event = { sender: { id: win.webContents.id } };
    assert.equal(handlers.get('hermes:permission:load')(event).detail, options.detail);
    assert.equal(handlers.get('hermes:permission:load')({ sender: { id: 9999 } }), undefined);
    assert.ok(handlers.get('hermes:permission:submit')({ sender: { id: 9999 } }, { response: 1, allowAll: true }).error);
    assert.ok(handlers.get('hermes:permission:submit')(event, { response: 99, allowAll: true }).error);
    handlers.get('hermes:permission:submit')(event, { response: 1, allowAll: true });
    assert.equal((await promise).response, 1);
    assert.equal(api.autoAllowPermissions(), true);
    assert.equal(JSON.parse(readFileSync(path.join(root,'permission-policy.json'))).autoAllowAll, true);
    assert.equal((await api.showPermissionWindow(parent, options, new AbortController().signal)).response, 1);
    assert.equal(latest, win, 'auto approval must not open another window');
    const toggle = menu.items[0].submenu.items[0];
    toggle.checked = false; toggle.click(toggle);
    assert.equal(api.autoAllowPermissions(), false);
    const controller = new AbortController();
    const aborted = api.showPermissionWindow(parent, options, controller.signal);
    controller.abort(); assert.equal((await aborted).response, 0);
    const denied = api.showPermissionWindow(parent, options, new AbortController().signal);
    handlers.get('hermes:permission:submit')({ sender: { id: latest.webContents.id } }, { response: 2, allowAll: true });
    assert.equal((await denied).response, 2); assert.equal(api.autoAllowPermissions(), false);
    const closed = api.showPermissionWindow(parent, options, new AbortController().signal);
    latest.destroy(); assert.equal((await closed).response, 0);
    const a = api.showPermissionWindow(parent, options, new AbortController().signal);
    const b = api.showPermissionWindow(parent, options, new AbortController().signal);
    toggle.checked = true; toggle.click(toggle);
    assert.deepEqual(await Promise.all([a,b]), [{response:1},{response:1}]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
