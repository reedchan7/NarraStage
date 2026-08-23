import { contextBridge, ipcRenderer } from "electron";
import {
  credentialDeleteRequestSchema,
  credentialSetRequestSchema,
  credentialStatusRequestSchema,
} from "@/security/credentialIpc";

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
