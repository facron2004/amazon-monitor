import { contextBridge, ipcRenderer } from "electron";
import type { AgentModelConnectionInput } from "@amazon-monitor/shared";

contextBridge.exposeInMainWorld("amazonMonitorDesktop", {
  exportFile: (request: { content: string; suggestedName: string }) =>
    ipcRenderer.invoke("desktop:export", request),
  model: {
    activate: (connectionId: string) =>
      ipcRenderer.invoke("desktop:model:activate", connectionId),
    list: () => ipcRenderer.invoke("desktop:model:list"),
    remove: (connectionId: string) =>
      ipcRenderer.invoke("desktop:model:remove", connectionId),
    save: (connection: AgentModelConnectionInput) =>
      ipcRenderer.invoke("desktop:model:save", connection),
  },
  oauth: {
    logout: () => ipcRenderer.invoke("desktop:oauth:logout"),
    start: () => ipcRenderer.invoke("desktop:oauth:start"),
    status: () => ipcRenderer.invoke("desktop:oauth:status"),
  },
  processStatus: () => ipcRenderer.invoke("desktop:process-status"),
  updateStatus: () => ipcRenderer.invoke("desktop:update-status"),
});
