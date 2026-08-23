import { Bot, CircleStop, Eraser, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  useAgentConversation,
  type ConversationContent,
} from "@/features/conversation/useAgentConversation";

function contentText(content: ConversationContent): string {
  if (typeof content.data === "string") return content.data;
  if (content.type === "thinking" && content.data && typeof content.data === "object") {
    const data = content.data as { title?: string; text?: string };
    return [data.title, data.text].filter(Boolean).join("\n");
  }
  return "";
}

export function ConversationPanel(props: { projectId: number; token: string }) {
  const conversation = useAgentConversation(props);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const active = conversation.messages.some(
    (message) =>
      message.role === "assistant" &&
      !["complete", "stop", "error"].includes(message.status ?? "pending"),
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [conversation.messages]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (conversation.send(input)) setInput("");
  }

  return (
    <section className="conversation-panel" aria-label="剧本统筹对话">
      <header>
        <span className="conversation-icon">
          <Bot size={20} />
        </span>
        <div>
          <h2>剧本统筹</h2>
          <p>讨论叙事目标、镜头拆解和制作取舍</p>
        </div>
        <span className="connection-status" data-state={conversation.connection}>
          {conversation.connection}
        </span>
      </header>
      <div className="message-list" aria-live="polite">
        {conversation.messages.length === 0 ? (
          <div className="conversation-empty">
            <Sparkles size={22} />
            <strong>从一个具体问题开始</strong>
            <p>例如：“把这段故事拆成三个节奏递进的镜头。”</p>
          </div>
        ) : (
          conversation.messages.map((message) => (
            <article className="message" data-role={message.role} key={message.id}>
              <span className="message-author">
                {message.role === "user" ? "你" : (message.name ?? "统筹")}
              </span>
              <div className="message-body">
                {message.content.map((content) => (
                  <p data-type={content.type} key={content.id}>
                    {contentText(content)}
                  </p>
                ))}
                {message.ext?.error ? <p className="form-error">{message.ext.error}</p> : null}
              </div>
              <span className="message-state">{message.status}</span>
            </article>
          ))
        )}
        <div ref={endRef} />
      </div>
      {conversation.error ? (
        <p className="form-error conversation-error" role="alert">
          {conversation.error}
        </p>
      ) : null}
      <form className="composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="conversation-input">
          发给剧本统筹
        </label>
        <textarea
          id="conversation-input"
          value={input}
          onChange={(event) => setInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="描述你的故事目标，Enter 发送，Shift + Enter 换行"
          rows={3}
        />
        <div className="composer-actions">
          <button
            className="icon-button"
            onClick={() => void conversation.clear()}
            type="button"
            aria-label="清空对话"
          >
            <Eraser size={17} />
          </button>
          {active ? (
            <button className="button secondary" onClick={conversation.stop} type="button">
              <CircleStop size={16} />
              停止
            </button>
          ) : (
            <button
              className="button primary"
              disabled={conversation.connection !== "connected" || !input.trim()}
              type="submit"
            >
              <Send size={16} />
              发送
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
