import { Server } from "socket.io";
import productionAgent from "@/socket/routes/productionAgent";
import scriptAgent from "@/socket/routes/scriptAgent";
import { registerJobNotifications } from "@/socket/jobNotifications";
import type { JobChangePublisher } from "@/generation/jobChanges";

export default (io: Server, jobChanges?: JobChangePublisher) => {
  const routes: Record<string, (nsp: ReturnType<Server["of"]>) => void> = {
    productionAgent,
    scriptAgent,
  };

  for (const [name, handler] of Object.entries(routes)) {
    const nsp = io.of(`/api/socket/${name}`);
    handler(nsp);
    console.log(`[Socket] 注册命名空间: /api/socket/${name}`);
  }
  if (jobChanges) registerJobNotifications(io.of("/api/socket/jobs"), jobChanges);
};
