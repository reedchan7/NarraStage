import type { Namespace } from "socket.io";
import jwt from "jsonwebtoken";
import type { JobChangePublisher } from "@/generation/jobChanges";
import { principalIdFromClaims } from "@/security/principal";
import { db } from "@/utils/db";

export function registerJobNotifications(namespace: Namespace, changes: JobChangePublisher): void {
  namespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || !token) throw new Error("socket.token_required");
      const setting = await db("o_setting").where("key", "tokenKey").select("value").first();
      if (!setting?.value) throw new Error("socket.auth_unavailable");
      socket.data.principalId = principalIdFromClaims(
        jwt.verify(token.replace("Bearer ", ""), setting.value),
      );
      next();
    } catch {
      next(new Error("socket.unauthorized"));
    }
  });

  namespace.on("connection", (socket) => {
    const unsubscribe = changes.subscribe((notification) => {
      if (notification.principalId !== socket.data.principalId) return;
      socket.emit("job:changed", {
        jobId: notification.jobId,
        version: notification.version,
      });
    });
    socket.once("disconnect", unsubscribe);
  });
}
