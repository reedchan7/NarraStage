import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export interface ConversationContent {
  id: string;
  type: "text" | "markdown" | "thinking" | "image" | "search" | "suggestion" | string;
  data: unknown;
  status?: "pending" | "streaming" | "complete" | "stop" | "error";
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  name?: string;
  status?: "pending" | "streaming" | "complete" | "stop" | "error";
  datetime?: string;
  content: ConversationContent[];
  ext?: { error?: string };
}

interface ContentEvent {
  messageId: string;
  contentId?: string;
  type?: string;
  data?: unknown;
  strategy?: "merge" | "append";
  status?: ConversationContent["status"];
  content?: ConversationContent;
}

export function useAgentConversation(input: { projectId: number; token: string }) {
  const socketRef = useRef<Socket | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "reconnecting" | "error"
  >("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = io("/api/socket/scriptAgent", {
      auth: {
        isolationKey: `web:${input.projectId}`,
        projectId: input.projectId,
        token: input.token,
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 8,
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnection("connected");
      setError(null);
    });
    socket.io.on("reconnect_attempt", () => setConnection("reconnecting"));
    socket.on("connect_error", (cause) => {
      setConnection("error");
      setError(cause.message);
    });
    socket.on("error", (payload: { message?: string }) => {
      setError(payload.message ?? "对话服务返回错误");
    });
    socket.on("message", (message: ConversationMessage) => {
      setMessages((current) => [
        ...current.filter((candidate) => candidate.id !== message.id),
        { ...message, content: message.content ?? [] },
      ]);
    });
    socket.on("content:add", (event: ContentEvent) => {
      if (!event.content) return;
      setMessages((current) =>
        current.map((message) =>
          message.id === event.messageId
            ? {
                ...message,
                content: [
                  ...message.content.filter((content) => content.id !== event.content!.id),
                  event.content!,
                ],
              }
            : message,
        ),
      );
    });
    socket.on("content:update", (event: ContentEvent) => {
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== event.messageId) return message;
          return {
            ...message,
            content: message.content.map((content) => {
              if (content.id !== event.contentId) return content;
              const nextData =
                event.strategy === "append" &&
                typeof content.data === "string" &&
                typeof event.data === "string"
                  ? content.data + event.data
                  : event.data === undefined
                    ? content.data
                    : event.data;
              return { ...content, data: nextData, status: event.status ?? content.status };
            }),
          };
        }),
      );
    });
    socket.on("message:update", (event: Partial<ConversationMessage> & { id: string }) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === event.id
            ? {
                ...message,
                ...event,
                content: event.content ?? message.content,
              }
            : message,
        ),
      );
    });
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [input.projectId, input.token]);

  const send = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed || !socketRef.current?.connected) return false;
    const message: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      status: "complete",
      datetime: new Date().toISOString(),
      content: [{ id: crypto.randomUUID(), type: "text", data: trimmed, status: "complete" }],
    };
    setMessages((current) => [...current, message]);
    socketRef.current.emit("chat", { content: trimmed });
    return true;
  }, []);

  const stop = useCallback(() => socketRef.current?.emit("stop"), []);
  const clear = useCallback(() => setMessages([]), []);

  return { messages, connection, error, send, stop, clear };
}
