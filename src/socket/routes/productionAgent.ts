import jwt from "jsonwebtoken";
import u from "@/utils";
import { Namespace, Socket } from "socket.io";
import * as agent from "@/agents/productionAgent/index";
import ResTool from "@/socket/resTool";
import { agentChatInputSchema, assertAgentProviderFilesOwned } from "@/agents/chatAttachments";
import { principalIdFromClaims } from "@/security/principal";

async function verifyToken(rawToken: string): Promise<unknown | undefined> {
  const setting = await u.db("o_setting").where("key", "tokenKey").select("value").first();
  if (!setting) return undefined;
  const { value: tokenKey } = setting;
  if (!rawToken) return undefined;
  const token = rawToken.replace("Bearer ", "");
  try {
    return jwt.verify(token, tokenKey as string);
  } catch (err) {
    return undefined;
  }
}

export default (nsp: Namespace) => {
  nsp.on("connection", async (socket: Socket) => {
    const token = socket.handshake.auth.token;
    const claims = token ? await verifyToken(token) : undefined;
    if (!claims) {
      console.log("[productionAgent] 连接失败，token无效");
      socket.disconnect();
      return;
    }
    const principalId = principalIdFromClaims(claims);
    let isolationKey = socket.handshake.auth.isolationKey;
    if (!isolationKey) {
      console.log("[productionAgent] 连接失败，缺少 isolationKey");
      socket.disconnect();
      return;
    }

    console.log("[productionAgent] 已连接:", socket.id);

    let resTool = new ResTool(socket, {
      projectId: socket.handshake.auth.projectId,
      scriptId: socket.handshake.auth.scriptId,
    });
    let abortController: AbortController | null = null;

    const thinkConfig: agent.AgentContext["thinkConfig"] = {
      think: false,
      thinlLevel: 0,
    };

    socket.on(
      "updateContext",
      (data: { isolationKey: string; projectId: number; scriptId: number }, callback) => {
        isolationKey = data.isolationKey;
        resTool = new ResTool(socket, {
          projectId: data.projectId,
          scriptId: data.scriptId,
        });
        console.log("[productionAgent] 上下文已更新:", isolationKey);
        callback?.({ success: true });
      },
    );

    socket.on("chat", async (data: unknown) => {
      const parsed = agentChatInputSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit("error", {
          code: "agent.chat_input_invalid",
          message: "消息或附件不符合输入约束",
        });
        return;
      }
      const { content, attachments = [], grounding } = parsed.data;
      abortController?.abort();
      abortController = new AbortController();
      const currentController = abortController;

      const msg = resTool.newMessage("assistant", "视频策划");
      const ctx: agent.AgentContext = {
        socket,
        isolationKey,
        text: content,
        attachments,
        grounding,
        userMessageTime: new Date(msg.datetime).getTime() - 1,
        abortSignal: currentController.signal,
        resTool,
        msg,
        thinkConfig,
      };

      try {
        await assertAgentProviderFilesOwned(attachments, principalId);
        await agent.runDecisionAI(ctx);
      } catch (err: any) {
        if (err.name !== "AbortError" && !currentController.signal.aborted) {
          console.error("[productionAgent] chat error:", u.error(err).message);
        }
      } finally {
        if (abortController === currentController) {
          abortController = null;
        }
      }
    });

    socket.on("updateThinkConfig", (data: { think: boolean; thinlLevel: 0 | 1 | 2 | 3 }) => {
      thinkConfig.think = data.think;
      thinkConfig.thinlLevel = data.thinlLevel;
      console.log("[productionAgent] 更新思考配置:", thinkConfig);
    });

    socket.on("stop", () => {
      abortController?.abort();
      abortController = null;
    });
  });
  nsp.on("disconnect", (socket: Socket) => {
    console.log("[productionAgent] 已断开连接:", socket.id);
  });
};
