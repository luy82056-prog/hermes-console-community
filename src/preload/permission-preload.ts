import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("permission", {
  load: () => ipcRenderer.invoke("hermes:permission:load"),
  submit: (response: number, allowAll: boolean) => ipcRenderer.invoke("hermes:permission:submit", { response, allowAll })
});
