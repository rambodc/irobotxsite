import { useEffect, useId, useRef, type ReactNode } from "react";
import { AlertTriangle, Inbox, X } from "lucide-react";

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else dialog.setAttribute("open", "");
    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="qc-modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="qc-modal-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button type="button" className="qc-icon-button" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="qc-modal-body">{children}</div>
      {footer && <footer className="qc-modal-foot">{footer}</footer>}
    </dialog>
  );
}

export function Field({
  label,
  hint,
  suffix,
  optional,
  children,
}: {
  label: string;
  hint?: ReactNode;
  suffix?: string;
  optional?: boolean;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="qc-field">
      <label htmlFor={id}>
        {label}
        {optional && <span className="qc-optional"> · optional</span>}
      </label>
      <div className={suffix ? "qc-input-wrap has-suffix" : "qc-input-wrap"}>
        {children(id)}
        {suffix && <span className="qc-suffix" aria-hidden="true">{suffix}</span>}
      </div>
      {hint && <p className="qc-hint">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="qc-field">
      <span className="qc-label" id={`seg-${label}`}>{label}</span>
      <div className="qc-segmented" role="radiogroup" aria-labelledby={`seg-${label}`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? "is-on" : ""}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "bad" | "info" | "raw" | "finished"; children: ReactNode }) {
  return <span className={`qc-badge qc-badge-${tone}`}>{children}</span>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="qc-empty">
      <Inbox size={28} strokeWidth={1.5} aria-hidden="true" />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "ok"; children: ReactNode }) {
  return (
    <div className={`qc-notice qc-notice-${tone}`} role={tone === "bad" ? "alert" : "status"}>
      {tone !== "info" && tone !== "ok" && <AlertTriangle size={16} aria-hidden="true" />}
      <div>{children}</div>
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="qc-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

export const numberValue = (s: string) => (s.trim() === "" ? NaN : Number(s));
