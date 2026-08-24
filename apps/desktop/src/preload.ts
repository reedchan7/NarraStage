import { contextBridge, ipcRenderer } from "electron";
import {
  credentialDeleteRequestSchema,
  credentialSetRequestSchema,
  credentialStatusRequestSchema,
} from "@/security/credentialIpc";

contextBridge.exposeInMainWorld("narrastageWindow", {
  minimize() {
    return ipcRenderer.invoke("narrastage:window:minimize");
  },
  toggleMaximize() {
    return ipcRenderer.invoke("narrastage:window:toggle-maximize");
  },
  close() {
    return ipcRenderer.invoke("narrastage:window:close");
  },
});

contextBridge.exposeInMainWorld("narrastageCredentials", {
  status(request: unknown) {
    return ipcRenderer.invoke(
      "narrastage:credentials:status",
      credentialStatusRequestSchema.parse(request),
    );
  },
  set(request: unknown) {
    return ipcRenderer.invoke(
      "narrastage:credentials:set",
      credentialSetRequestSchema.parse(request),
    );
  },
  delete(request: unknown) {
    return ipcRenderer.invoke(
      "narrastage:credentials:delete",
      credentialDeleteRequestSchema.parse(request),
    );
  },
});
