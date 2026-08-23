import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useAgentConversation } from "@/features/conversation/useAgentConversation";

const mocks = vi.hoisted(() => {
  const socket = {
    connected: true,
    on: vi.fn(),
    emit: vi.fn(),
    removeAllListeners: vi.fn(),
    disconnect: vi.fn(),
    io: { on: vi.fn() },
  };
  return {
    socket,
    history: Promise.resolve([]) as Promise<unknown[]>,
    conversationHistory: vi.fn(() => Promise.resolve([]) as Promise<unknown[]>),
    clearConversation: vi.fn(() => Promise.resolve(null)),
    io: vi.fn(() => socket),
  };
});

vi.mock("socket.io-client", () => ({ io: mocks.io }));
vi.mock("@/api/client", () => ({
  api: {
    conversationHistory: (...args: unknown[]) => mocks.conversationHistory(...args),
    clearConversation: (...args: unknown[]) => mocks.clearConversation(...args),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const historicalMessage = {
  id: "history-1",
  role: "assistant" as const,
  status: "complete" as const,
  datetime: "2026-08-24T00:00:00.000Z",
  content: [{ id: "history-content", type: "text", data: "history", status: "complete" as const }],
};

describe("agent conversation history races", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.socket.connected = true;
  });

  test("merges delayed history without overwriting a newly sent message", async () => {
    const history = deferred<(typeof historicalMessage)[]>();
    mocks.conversationHistory.mockReturnValueOnce(history.promise);
    const { result } = renderHook(() =>
      useAgentConversation({ projectId: 7, token: "Bearer fixture" }),
    );

    act(() => {
      expect(result.current.send("new message")).toBe(true);
    });
    expect(result.current.messages).toHaveLength(1);

    await act(async () => history.resolve([historicalMessage]));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages.map((message) => message.id)).toContain("history-1");
    expect(
      result.current.messages.some((message) => message.content[0]?.data === "new message"),
    ).toBe(true);
  });

  test("invalidates delayed history before clearing the conversation", async () => {
    const history = deferred<(typeof historicalMessage)[]>();
    mocks.conversationHistory.mockReturnValueOnce(history.promise);
    const { result } = renderHook(() =>
      useAgentConversation({ projectId: 7, token: "Bearer fixture" }),
    );

    await act(async () => result.current.clear());
    await act(async () => history.resolve([historicalMessage]));
    await waitFor(() => expect(result.current.messages).toEqual([]));
  });
});
