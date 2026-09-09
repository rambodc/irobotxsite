import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ArrowUpRight, Bot, Plus, RefreshCw, Send, Square } from "lucide-react";
import { streamChat, type ChatMessage } from "./demoAI";
import "./demo-ai.css";
export interface ChatState {
  messages: ChatMessage[];
  error: string;
}

export const newChat = (): ChatState => ({ messages: [], error: "" });

const suggestions = [
  "What can I do in this demo?",
  "How could AI connect our field teams and service companies?",
  "How would you build a platform around our Oil & Gas operations?",
];
export function AIChat({
  state,
  setState,
  canUse,
}: {
  state: ChatState;
  setState: Dispatch<SetStateAction<ChatState>>;
  canUse: boolean;
}) {
  const [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false);
  const control = useRef<AbortController | null>(null),
    end = useRef<HTMLDivElement>(null);
  useEffect(() => () => control.current?.abort(), []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [state.messages]);
  async function send(text: string, retry = false) {
    if (!canUse || busy || !text.trim()) return;
    const saved = state.messages.filter((message) => message.content.trim());
    const history = retry
      ? saved.slice(0, saved.map((m) => m.role).lastIndexOf("user") + 1)
      : [...saved, { role: "user" as const, content: text.trim() }];
    if (
      history.length > 19 ||
      history.reduce((sum, m) => sum + m.content.length, 0) > 23000
    ) {
      setState((old) => ({ ...old, error: "Start a new chat to continue." }));
      return;
    }
    const controller = new AbortController();
    control.current = controller;
    setBusy(true);
    setDraft("");
    setState({
      messages: [...history, { role: "assistant", content: "" }],
      error: "",
    });
    try {
      await streamChat(
        history,
        (delta) =>
          setState((old) => ({
            ...old,
            messages: old.messages.map((m, i) =>
              i === old.messages.length - 1
                ? { ...m, content: m.content + delta }
                : m,
            ),
          })),
        controller.signal,
      );
    } catch (e) {
      setState((old) => ({
        ...old,
        error: controller.signal.aborted
          ? "Response stopped."
          : e instanceof Error
            ? e.message
            : "Could not connect. Please retry.",
      }));
    } finally {
      if (control.current === controller) {
        setBusy(false);
        control.current = null;
      }
    }
  }
  function clear() {
    control.current?.abort();
    control.current = null;
    setBusy(false);
    setState(newChat());
    setDraft("");
  }
  return (
    <section className="pc-card ai-chat">
      <div className="ai-chat-heading">
        <span>
          <Bot size={21} />
          iRobotX assistant
        </span>
        <button className="pc-secondary" onClick={clear} disabled={busy}>
          <Plus size={15} />
          New chat
        </button>
      </div>
      <div
        className="ai-messages"
        role="log"
        aria-label="Conversation"
        aria-live="off"
      >
        {!state.messages.length && (
          <div className="ai-welcome">
            <span className="ai-orb">
              <Bot size={34} />
            </span>
            <h2>What could we build together?</h2>
            <p>
              Explore connected operations, custom software, and AI for your
              business.
            </p>
            <div>
              {suggestions.map((s) => (
                <button key={s} onClick={() => void send(s)} disabled={!canUse}>
                  {s}
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          </div>
        )}
        {state.messages.map((m, i) => (
          <article className={`ai-message ${m.role}`} key={i}>
            <span>{m.role === "user" ? "You" : "iRobotX"}</span>
            <p>
              {m.content
                ? m.content
                    .split(/(\*\*[^*\n]+\*\*)/g)
                    .map((part, index) =>
                      part.startsWith("**") && part.endsWith("**") ? (
                        <strong key={index}>{part.slice(2, -2)}</strong>
                      ) : (
                        part
                      ),
                    )
                : busy
                  ? "Thinking…"
                  : "No reply received."}
            </p>
          </article>
        ))}
        <div ref={end} />
      </div>
      {state.error && (
        <div className="ai-error" role="status">
          <span>{state.error}</span>
          {state.messages.some((m) => m.role === "user") && (
            <button
              disabled={busy || !canUse}
              onClick={() => void send("retry", true)}
            >
              <RefreshCw size={14} />
              Retry
            </button>
          )}
        </div>
      )}
      <form
        className="ai-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          aria-label="Message to AI assistant"
          placeholder={
            canUse ? "Ask about your operations…" : "You have view-only access"
          }
          value={draft}
          maxLength={4000}
          rows={2}
          disabled={!canUse || busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send(draft);
            }
          }}
        />
        {busy ? (
          <button
            type="button"
            className="pc-primary"
            onClick={() => control.current?.abort()}
          >
            <Square size={16} />
            Stop
          </button>
        ) : (
          <button className="pc-primary" disabled={!canUse || !draft.trim()}>
            <Send size={16} />
            <span>Send</span>
          </button>
        )}
      </form>
      <p className="ai-footer-note">
        AI responses may be imperfect. Chat stays here until refresh or reset.
      </p>
    </section>
  );
}
