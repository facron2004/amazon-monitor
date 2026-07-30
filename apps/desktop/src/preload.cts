import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("amazonMonitorDesktop", {
  exportFile: (request: { content: string; suggestedName: string }) =>
    ipcRenderer.invoke("desktop:export", request),
  key: {
    clear: () => ipcRenderer.invoke("desktop:key:clear"),
    has: () => ipcRenderer.invoke("desktop:key:has"),
    set: (apiKey: string) => ipcRenderer.invoke("desktop:key:set", apiKey),
  },
  processStatus: () => ipcRenderer.invoke("desktop:process-status"),
  updateStatus: () => ipcRenderer.invoke("desktop:update-status"),
});
