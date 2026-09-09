import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ArrowUpRight,
  Bot,
  Camera,
  Check,
  Copy,
  ImagePlus,
  MapPin,
  Plus,
  RefreshCw,
  Send,
  Square,
  X,
} from "lucide-react";
import {
  aiRequest,
  streamChat,
  type ChatMessage,
  type LsdResult,
  type PhotoResult,
} from "./demoAI";
import "./demo-ai.css";
export interface ChatState {
  messages: ChatMessage[];
  error: string;
}
export interface FinderState {
  description: string;
  photo: string;
  extraction: PhotoResult | null;
  result: LsdResult | null;
  selected: number;
}
export const newChat = (): ChatState => ({ messages: [], error: "" });
export const newFinder = (): FinderState => ({
  description: "",
  photo: "",
  extraction: null,
  result: null,
  selected: 0,
});
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
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="ai-copy"
      aria-label={`Copy ${text}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
export function LSDFinder({
  state,
  setState,
  canUse,
}: {
  state: FinderState;
  setState: Dispatch<SetStateAction<FinderState>>;
  canUse: boolean;
}) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const upload = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null),
    control = useRef<AbortController | null>(null);
  useEffect(() => () => control.current?.abort(), []);
  async function photo(file?: File) {
    if (!file || !canUse) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 12000000
    ) {
      setError("Choose a JPG, PNG or WebP photo under 12 MB.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file),
        scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height)),
        canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const image = canvas.toDataURL("image/jpeg", 0.82);
      if (image.length > 4200000)
        throw new Error("Please crop the photo or use a smaller image.");
      setState((old) => ({
        ...old,
        photo: image,
        extraction: null,
        result: null,
      }));
      await readPhoto(image);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this photo.");
    }
  }
  async function readPhoto(image = state.photo) {
    if (!canUse || busy || !image) return;
    setBusy("Reading photo…");
    setError("");
    const controller = new AbortController();
    control.current = controller;
    try {
      const data = (await (
        await aiRequest("extractLsd", { image }, controller.signal)
      ).json()) as PhotoResult;
      setState((old) => ({
        ...old,
        extraction: data,
        description: data.candidates[0]?.normalized || "",
        result: null,
      }));
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Could not read the image.");
    } finally {
      setBusy("");
      control.current = null;
    }
  }
  async function lookup() {
    if (!canUse || busy || state.description.trim().length < 5) return;
    setBusy("Researching Alberta records…");
    setError("");
    const controller = new AbortController();
    control.current = controller;
    try {
      const result = (await (
        await aiRequest(
          "findLsd",
          { description: state.description.trim() },
          controller.signal,
        )
      ).json()) as LsdResult;
      setState((old) => ({ ...old, result, selected: 0 }));
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Lookup failed. Please retry.",
        );
    } finally {
      setBusy("");
      control.current = null;
    }
  }
  const record = state.result?.candidates[state.selected],
    point = record?.location;
  const location = point ? `${point.latitude}, ${point.longitude}` : "";
  const map = point
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${point.longitude - 0.02},${point.latitude - 0.01},${point.longitude + 0.02},${point.latitude + 0.01}&layer=mapnik&marker=${point.latitude},${point.longitude}`
    : "";
  return (
    <div className="ai-finder">
      <section className="pc-card ai-finder-input">
        <div className="pc-section-heading">
          <h2>Find an Alberta well</h2>
          <MapPin size={23} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup();
          }}
        >
          <label>
            Legal description or UWI
            <input
              aria-label="Legal description or UWI"
              value={state.description}
              maxLength={160}
              placeholder="e.g. 04-36-039-25W4"
              disabled={!canUse || !!busy}
              onChange={(e) =>
                setState((old) => ({
                  ...old,
                  description: e.target.value,
                  result: null,
                }))
              }
            />
          </label>
          <div className="ai-photo-actions">
            <button
              type="button"
              className="pc-secondary"
              disabled={!canUse || !!busy}
              onClick={() => upload.current?.click()}
            >
              <ImagePlus size={16} />
              Upload photo
            </button>
            <button
              type="button"
              className="pc-secondary"
              disabled={!canUse || !!busy}
              onClick={() => camera.current?.click()}
            >
              <Camera size={16} />
              Take photo
            </button>
          </div>
          <input
            ref={upload}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Upload LSD photo"
            onChange={(e) => {
              void photo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={camera}
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Take LSD photo"
            onChange={(e) => {
              void photo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {state.photo && (
            <div className="ai-photo-preview">
              <img src={state.photo} alt="Uploaded land description" />
              <button
                type="button"
                className="pc-icon-button"
                aria-label="Remove photo"
                disabled={!!busy}
                onClick={() =>
                  setState((old) => ({ ...old, photo: "", extraction: null }))
                }
              >
                <X size={16} />
              </button>
            </div>
          )}
          {state.extraction && (
            <div className="ai-extraction">
              <p>{state.extraction.note}</p>
              {state.extraction.candidates.length > 0 && (
                <>
                  <span>
                    Confirm or correct the description above before searching.
                  </span>
                  {state.extraction.candidates.map((c, i) => (
                    <button
                      type="button"
                      key={i}
                      disabled={!canUse || !!busy}
                      onClick={() =>
                        setState((old) => ({
                          ...old,
                          description: c.normalized,
                          result: null,
                        }))
                      }
                    >
                      <span>{c.normalized}</span>
                      <small>{c.text}</small>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
          <button
            className="pc-primary ai-find-button"
            disabled={!canUse || !!busy || state.description.trim().length < 5}
          >
            {busy || "Find well"}
            <ArrowUpRight size={16} />
          </button>
          {!canUse && <p className="pc-caption">You have view-only access.</p>}
        </form>
        {busy && (
          <p role="status" className="pc-caption">
            {busy}
          </p>
        )}
        {error && (
          <div className="ai-error" role="alert">
            <span>{error}</span>
            {state.photo && !state.extraction && (
              <button disabled={!!busy} onClick={() => void readPhoto()}>
                <RefreshCw size={14} />
                Read photo again
              </button>
            )}
          </div>
        )}
      </section>
      {state.result && (
        <section className="pc-card ai-finder-result">
          <span className="pc-eyebrow">Alberta · Public-source research</span>
          <h2>{state.result.normalized}</h2>
          <p>{state.result.summary}</p>
          {state.result.candidates.length > 1 && (
            <label>
              Matching records
              <select
                value={state.selected}
                onChange={(e) =>
                  setState((old) => ({
                    ...old,
                    selected: Number(e.target.value),
                  }))
                }
              >
                {state.result.candidates.map((c, i) => (
                  <option key={i} value={i}>
                    {c.wellName || c.uwi || c.description}
                  </option>
                ))}
              </select>
            </label>
          )}
          {record?.sourceUrl && (
            <a
              href={record.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="ai-record-source"
            >
              Open matching source record <ArrowUpRight size={14} />
            </a>
          )}
          {record && (
            <dl className="pc-details">
              {[
                ["Description", record.description],
                ["Well", record.wellName],
                ["UWI", record.uwi],
                ["Licence", record.licence],
                ["Operator", record.operator],
                ["Status", record.status],
                ["Source date", record.sourceDate],
                ["Location type", point?.kind],
              ].map(([label, value]) => (
                <div className="pc-detail" key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {value || "Unavailable"}
                    {value &&
                      ["Description", "UWI", "Licence"].includes(label!) && (
                        <CopyButton text={value} />
                      )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {point ? (
            <>
              <div className="ai-map">
                <iframe
                  title={`Sourced ${point.kind} location`}
                  src={map}
                  loading="lazy"
                />
              </div>
              <div className="ai-coordinates">
                <span>{location}</span>
                <CopyButton text={location} />
                <a
                  href={`https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=15/${point.latitude}/${point.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open map <ArrowUpRight size={14} />
                </a>
              </div>
              <p className="pc-caption">
                {point.kind === "surface"
                  ? "Surface location"
                  : "Bottom-hole location"}{" "}
                ·{" "}
                <a href={point.sourceUrl} target="_blank" rel="noreferrer">
                  Coordinate source
                </a>
              </p>
            </>
          ) : (
            <div className="ai-no-pin">
              <MapPin size={20} />
              <span>
                No verified coordinates found. No map pin has been placed.
              </span>
            </div>
          )}
          <div className="ai-sources">
            <h3>Sources</h3>
            {state.result.sources.length ? (
              state.result.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                  <ArrowUpRight size={13} />
                </a>
              ))
            ) : (
              <p>No supporting public sources found.</p>
            )}
          </div>
          <p className="pc-caption">{state.result.notice}</p>
        </section>
      )}
    </div>
  );
}
