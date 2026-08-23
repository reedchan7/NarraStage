import { contextBridge, ipcRenderer } from "electron";
import {
  credentialDeleteRequestSchema,
  credentialSetRequestSchema,
  credentialStatusRequestSchema,
} from "@/security/credentialIpc";

contextBridge.exposeInMainWorld("toonflowWindow", {
  minimize() {
    return ipcRenderer.invoke("toonflow:window:minimize");
  },
  toggleMaximize() {
    return ipcRenderer.invoke("toonflow:window:toggle-maximize");
  },
  close() {
    return ipcRenderer.invoke("toonflow:window:close");
  },
});

contextBridge.exposeInMainWorld("toonflowCredentials", {
  status(request: unknown) {
    return ipcRenderer.invoke(
      "toonflow:credentials:status",
      credentialStatusRequestSchema.parse(request),
    );
  },
  set(request: unknown) {
    return ipcRenderer.invoke(
      "toonflow:credentials:set",
      credentialSetRequestSchema.parse(request),
    );
  },
  delete(request: unknown) {
    return ipcRenderer.invoke(
      "toonflow:credentials:delete",
      credentialDeleteRequestSchema.parse(request),
    );
  },
});
