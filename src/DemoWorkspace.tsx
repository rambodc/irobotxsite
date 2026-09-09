import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Camera,
  Check,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  Home,
  Mail,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  Waves,
  X,
} from "lucide-react";
import {
  apps,
  initialEmployees,
  initialCompany,
  fullPermissions,
  defaultPermissions,
  allowed,
  withPermission,
  blankEmployee,
  nameOf,
  mapUrl,
  mapLink,
  type AppId,
  type Employee,
  type Company,
  type Permissions,
} from "./demoContent";
import "./demo.css";
import { AIChat, newChat, type ChatState } from "./DemoAIApps";
const WellViewer = lazy(() => import("./well-viewer/WellViewer"));

function Avatar({ person, size = "" }: { person: Employee; size?: string }) {
  return (
    <span
      className={`pc-avatar ${size}`}
      style={
        {
          "--avatar-hue": `${((person.firstName.charCodeAt(0) * 7) % 80) + 190}`,
        } as React.CSSProperties
      }
    >
      {person.photo ? (
        <img src={person.photo} alt={nameOf(person)} width="160" height="160" />
      ) : (
        <span aria-label={nameOf(person)}>
          {person.firstName[0]}
          {person.lastName[0]}
        </span>
      )}
    </span>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="pc-detail">
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}
function Status({ status }: { status: Employee["status"] }) {
  return (
    <span className={`pc-status ${status === "Inactive" ? "inactive" : ""}`}>
      <span />
      {status}
    </span>
  );
}
function PhotoInput({
  person,
  update,
  disabled = false,
}: {
  person: Employee;
  update: (photo: string) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function upload(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Choose a JPG, PNG, or WebP image under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const photo = new Image();
      photo.onload = () => {
        update(String(reader.result));
        setError("");
      };
      photo.onerror = () =>
        setError("This image could not be opened. Try another file.");
      photo.src = String(reader.result);
    };
    reader.onerror = () =>
      setError("This image could not be opened. Try another file.");
    reader.readAsDataURL(file);
  }
  return (
    <div className="pc-photo-edit">
      <Avatar person={person} size="large" />
      <div>
        <button
          className="pc-secondary"
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <Camera size={16} />
          Change photo
        </button>
        <span className="pc-caption">JPG, PNG or WebP · Up to 5 MB</span>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Upload profile photo"
          hidden
          disabled={disabled}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {error && (
          <p className="pc-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
function IdentityFields({
  person,
  update,
  disabled = false,
}: {
  person: Employee;
  update: (person: Employee) => void;
  disabled?: boolean;
}) {
  return (
    <div className="pc-fields">
      {(
        [
          ["firstName", "First name", "text"],
          ["lastName", "Last name", "text"],
          ["email", "Email", "email"],
          ["phone", "Phone", "tel"],
          ["title", "Job title", "text"],
          ["department", "Department", "text"],
          ["location", "Office location", "text"],
        ] as const
      ).map(([key, label, type]) => (
        <label key={key}>
          {label}
          <input
            type={type}
            value={person[key]}
            required={["firstName", "lastName", "email"].includes(key)}
            maxLength={key === "email" ? 150 : 80}
            disabled={disabled}
            onChange={(e) => update({ ...person, [key]: e.target.value })}
          />
        </label>
      ))}
    </div>
  );
}
function IdentityDetails({ person }: { person: Employee }) {
  return (
    <dl className="pc-details">
      <Detail label="First name" value={person.firstName} />
      <Detail label="Last name" value={person.lastName} />
      <Detail label="Email" value={person.email} />
      <Detail label="Phone" value={person.phone} />
      <Detail label="Job title" value={person.title} />
      <Detail label="Department" value={person.department} />
      <Detail label="Office location" value={person.location} />
      <Detail
        label="Employee ID"
        value={
          person.id === "john"
            ? "PC-001"
            : `PC-${person.id.slice(0, 6).toUpperCase()}`
        }
      />
    </dl>
  );
}
function Profile({
  person,
  company,
  save,
}: {
  person: Employee;
  company: Company;
  save: (p: Employee) => string | null;
}) {
  const [draft, setDraft] = useState<Employee | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const message = save(draft);
    if (message) {
      setError(message);
      return;
    }
    setDraft(null);
    setSaved(true);
  }
  if (draft)
    return (
      <form className="pc-card pc-editor" onSubmit={submit}>
        <div className="pc-section-heading">
          <h2>Edit profile</h2>
          <button
            type="button"
            className="pc-icon-button"
            aria-label="Cancel editing profile"
            onClick={() => setDraft(null)}
          >
            <X size={20} />
          </button>
        </div>
        <PhotoInput
          person={draft}
          update={(photo) => setDraft({ ...draft, photo })}
        />
        <IdentityFields person={draft} update={setDraft} />
        {error && (
          <p className="pc-error" role="alert">
            {error}
          </p>
        )}
        <div className="pc-form-actions">
          <button
            type="button"
            className="pc-secondary"
            onClick={() => setDraft(null)}
          >
            Cancel
          </button>
          <button className="pc-primary" type="submit">
            Save changes <Check size={16} />
          </button>
        </div>
      </form>
    );
  return (
    <div className="pc-profile-layout">
      <section className="pc-card pc-profile-summary">
        <div className="pc-profile-cover">
          <Waves size={140} strokeWidth={0.7} />
        </div>
        <div className="pc-profile-identity">
          <Avatar person={person} size="portrait" />
          <Status status={person.status} />
          <h2>{nameOf(person)}</h2>
          <p>{person.title}</p>
          <span className="pc-company-label">{company.name}</span>
          <div className="pc-contact-line">
            <Mail size={15} />
            <span>{person.email}</span>
          </div>
          <div className="pc-contact-line">
            <MapPin size={15} />
            <span>{person.location}</span>
          </div>
        </div>
      </section>
      <section className="pc-card pc-profile-information">
        <div className="pc-section-heading">
          <h2>Personal information</h2>
          {allowed(person, "profile", "edit") && (
            <button
              className="pc-secondary"
              onClick={() => {
                setDraft(structuredClone(person));
                setError("");
                setSaved(false);
              }}
            >
              <Pencil size={15} />
              Edit
            </button>
          )}
        </div>
        {saved && (
          <p className="pc-saved" role="status">
            <Check size={15} />
            Profile updated
          </p>
        )}
        <IdentityDetails person={person} />
      </section>
    </div>
  );
}
function CompanyApp({
  company,
  canEdit,
  save,
}: {
  company: Company;
  canEdit: boolean;
  save: (company: Company) => void;
}) {
  const [draft, setDraft] = useState<Company | null>(null);
  const [saved, setSaved] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  if (draft)
    return (
      <form
        className="pc-card pc-editor"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.name.trim()) return;
          save(draft);
          setDraft(null);
          setSaved(true);
        }}
      >
        <div className="pc-section-heading">
          <h2>Edit company</h2>
        </div>
        <div className="pc-fields">
          {(
            [
              "name",
              "industry",
              "email",
              "phone",
              "website",
              "location",
            ] as const
          ).map((key) => (
            <label key={key}>
              {
                {
                  name: "Company name",
                  industry: "Industry",
                  email: "Company email",
                  phone: "Phone",
                  website: "Website",
                  location: "Office location",
                }[key]
              }
              <input
                value={draft[key]}
                type={key === "email" ? "email" : "text"}
                maxLength={150}
                required={key === "name" || key === "email"}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="pc-wide">
            Company overview
            <textarea
              rows={4}
              maxLength={600}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </label>
        </div>
        <div className="pc-form-actions">
          <button
            className="pc-secondary"
            type="button"
            onClick={() => setDraft(null)}
          >
            Cancel
          </button>
          <button className="pc-primary" type="submit">
            Save changes <Check size={16} />
          </button>
        </div>
      </form>
    );
  return (
    <div className="pc-company-layout">
      <section className="pc-card pc-company-card">
        <div className="pc-section-heading">
          <span className="pc-crest">
            <Waves size={35} />
          </span>
          {canEdit && (
            <button
              className="pc-secondary"
              onClick={() => {
                setDraft({ ...company });
                setSaved(false);
              }}
            >
              <Pencil size={15} />
              Edit
            </button>
          )}
        </div>
        <span className="pc-eyebrow">{company.industry}</span>
        <h2>{company.name}</h2>
        <p>{company.description}</p>
        {saved && (
          <p className="pc-saved" role="status">
            <Check size={15} />
            Company updated
          </p>
        )}
        <dl className="pc-details">
          <Detail label="Company email" value={company.email} />
          <Detail label="Phone" value={company.phone} />
          <Detail label="Website" value={company.website} />
          <Detail label="Head office" value={company.location} />
        </dl>
      </section>
      <section className="pc-card pc-location-card">
        <div className="pc-section-heading">
          <div>
            <h2>Calgary office</h2>
            <p className="pc-caption">Downtown Calgary, Alberta</p>
          </div>
          <MapPin size={22} />
        </div>
        <div className="pc-map">
          {!mapFailed ? (
            <iframe
              title="Sample office location in downtown Calgary"
              src={mapUrl}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setMapFailed(true)}
            />
          ) : (
            <div className="pc-map-fallback">
              <MapPin size={40} />
              <p>Downtown Calgary</p>
              <a href={mapLink} target="_blank" rel="noreferrer">
                Open office map <ExternalLink size={15} />
              </a>
            </div>
          )}
        </div>
        <div className="pc-map-caption">
          <span>Sample office location · © OpenStreetMap contributors</span>
          <a
            href={mapLink}
            target="_blank"
            rel="noreferrer"
            aria-label="Open downtown Calgary map"
          >
            Open map <ExternalLink size={13} />
          </a>
        </div>
      </section>
    </div>
  );
}
function PermissionEditor({
  value,
  change,
  disabled,
}: {
  value: Permissions;
  change: (value: Permissions) => void;
  disabled: boolean;
}) {
  return (
    <div className="pc-permission-grid">
      {apps.map((app) => (
        <fieldset key={app.id} className="pc-permission-group">
          <legend>{app.name}</legend>
          <label className="pc-permission-view">
            <input
              type="checkbox"
              checked={!!value[app.id].view}
              disabled={disabled}
              onChange={(e) =>
                change(withPermission(value, app.id, "view", e.target.checked))
              }
            />
            <span>
              {app.id === "profile"
                ? "View own profile"
                : app.id === "company"
                  ? "View company"
                  : app.id === "employees"
                    ? "View directory"
                    : "View app"}
              <small>Show {app.name} app</small>
            </span>
          </label>
          {app.actions.map((action) => (
            <label key={action.id}>
              <input
                type="checkbox"
                checked={!!value[app.id].view && !!value[app.id][action.id]}
                disabled={disabled || !value[app.id].view}
                onChange={(e) =>
                  change(
                    withPermission(value, app.id, action.id, e.target.checked),
                  )
                }
              />
              {action.label}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
function EmployeeEditor({
  initial,
  actor,
  save,
  cancel,
}: {
  initial: Employee;
  actor: Employee;
  save: (employee: Employee) => string | null;
  cancel: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [error, setError] = useState("");
  const canDetails = initial.id
    ? allowed(actor, "employees", "edit")
    : allowed(actor, "employees", "create");
  const canPermissions =
    allowed(actor, "employees", "manage") && initial.id !== "john";
  function submit(e: FormEvent) {
    e.preventDefault();
    const message = save(draft);
    if (message) setError(message);
  }
  return (
    <form className="pc-card pc-editor" onSubmit={submit}>
      <div className="pc-section-heading">
        <h2>{initial.id ? "Edit employee" : "New employee"}</h2>
        <button
          className="pc-icon-button"
          type="button"
          aria-label="Cancel employee changes"
          onClick={cancel}
        >
          <X size={20} />
        </button>
      </div>
      <PhotoInput
        person={draft}
        update={(photo) => setDraft({ ...draft, photo })}
        disabled={!canDetails}
      />
      <IdentityFields person={draft} update={setDraft} disabled={!canDetails} />
      <label className="pc-status-field">
        Status
        <select
          aria-label="Status"
          value={draft.status}
          disabled={!canDetails || draft.id === "john"}
          onChange={(e) =>
            setDraft({ ...draft, status: e.target.value as Employee["status"] })
          }
        >
          <option>Active</option>
          <option>Inactive</option>
        </select>
      </label>
      <div className="pc-section-heading pc-access-heading">
        <h3>App access</h3>
        {initial.id === "john" && (
          <span className="pc-caption">
            <ShieldCheck size={14} />
            Workspace administrator
          </span>
        )}
      </div>
      <PermissionEditor
        value={draft.permissions}
        disabled={!canPermissions}
        change={(permissions) => setDraft({ ...draft, permissions })}
      />
      {error && (
        <p className="pc-error" role="alert">
          {error}
        </p>
      )}
      <div className="pc-form-actions">
        <button className="pc-secondary" type="button" onClick={cancel}>
          Cancel
        </button>
        <button className="pc-primary" type="submit">
          {initial.id ? "Save changes" : "Create employee"}
          <Check size={16} />
        </button>
      </div>
    </form>
  );
}
function EmployeesApp({
  employees,
  actor,
  save,
  viewAs,
}: {
  employees: Employee[];
  actor: Employee;
  save: (employee: Employee) => string | null;
  viewAs: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [notice, setNotice] = useState("");
  const selected = employees.find((e) => e.id === selectedId);
  const rows = employees.filter(
    (e) =>
      `${nameOf(e)} ${e.email} ${e.department} ${e.title}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "All" || e.status === filter),
  );
  if (editing)
    return (
      <EmployeeEditor
        key={editing.id || "new"}
        initial={editing}
        actor={actor}
        save={(employee) => {
          const error = save(employee);
          if (!error) {
            setEditing(null);
            setNotice(employee.id ? "Employee updated" : "Employee created");
          }
          return error;
        }}
        cancel={() => setEditing(null)}
      />
    );
  if (selected)
    return (
      <>
        <button className="pc-text-button" onClick={() => setSelectedId(null)}>
          <ArrowLeft size={15} />
          All employees
        </button>
        <section className="pc-card pc-employee-detail">
          <div className="pc-employee-detail-heading">
            <Avatar person={selected} size="large" />
            <div>
              <h2>{nameOf(selected)}</h2>
              <p>{selected.title}</p>
              <Status status={selected.status} />
            </div>
            <div className="pc-employee-actions">
              {(allowed(actor, "employees", "edit") ||
                allowed(actor, "employees", "manage")) && (
                <button
                  className="pc-secondary"
                  onClick={() => {
                    setEditing(selected);
                    setNotice("");
                  }}
                >
                  <Pencil size={15} />
                  Edit employee
                </button>
              )}
              {selected.id !== actor.id && selected.status === "Active" && (
                <button
                  className="pc-primary"
                  onClick={() => viewAs(selected.id)}
                >
                  View as employee <ArrowUpRight size={15} />
                </button>
              )}
            </div>
          </div>
          {notice && (
            <p className="pc-saved" role="status">
              <Check size={15} />
              {notice}
            </p>
          )}
          <IdentityDetails person={selected} />
          <h3 className="pc-access-heading">App access</h3>
          <PermissionEditor
            value={selected.permissions}
            change={() => {}}
            disabled
          />
        </section>
      </>
    );
  return (
    <section className="pc-card pc-directory">
      <div className="pc-section-heading">
        <div>
          <h2>Your people</h2>
          <p className="pc-caption">{employees.length} employees</p>
        </div>
        {allowed(actor, "employees", "create") && (
          <button
            className="pc-primary"
            onClick={() => {
              setEditing(blankEmployee());
              setNotice("");
            }}
          >
            <Plus size={17} />
            New employee
          </button>
        )}
      </div>
      <div className="pc-directory-filters">
        <label className="pc-search">
          <Search size={18} />
          <input
            aria-label="Search employees"
            placeholder="Search name, team or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter employee status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="All">All statuses</option>
          <option>Active</option>
          <option>Inactive</option>
        </select>
      </div>
      {notice && (
        <p className="pc-saved" role="status">
          <Check size={15} />
          {notice}
        </p>
      )}
      <div className="pc-directory-labels" aria-hidden="true">
        <span>Employee</span>
        <span>Department</span>
        <span>Status</span>
        <span />
      </div>
      <div className="pc-employee-list">
        {rows.map((employee) => (
          <button
            className="pc-employee-row"
            key={employee.id}
            onClick={() => {
              setSelectedId(employee.id);
              setNotice("");
            }}
          >
            <span className="pc-person-cell">
              <Avatar person={employee} />
              <span>
                <strong>{nameOf(employee)}</strong>
                <small>{employee.title}</small>
              </span>
            </span>
            <span className="pc-department-cell">{employee.department}</span>
            <Status status={employee.status} />
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      {rows.length === 0 && (
        <div className="pc-empty">
          <Search size={27} />
          <p>No employees found</p>
          <button
            className="pc-secondary"
            onClick={() => {
              setSearch("");
              setFilter("All");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}

export default function DemoWorkspace() {
  const [employees, setEmployees] = useState<Employee[]>(() =>
    structuredClone(initialEmployees),
  );
  const [company, setCompany] = useState<Company>(() => ({
    ...initialCompany,
  }));
  const [actorId, setActorId] = useState("john");
  const [active, setActive] = useState<AppId | null>(null);
  const [options, setOptions] = useState(false);
  const [chats, setChats] = useState<Record<string, ChatState>>({});
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const hasOpened = useRef(false);
  const homeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const actor =
    employees.find((e) => e.id === actorId && e.status === "Active") ||
    employees[0];
  const app = active && allowed(actor, active) ? active : null;
  useEffect(() => {
    if (location.hash) history.replaceState({}, "", "/demo");
  }, []);
  useEffect(() => {
    if (app) {
      hasOpened.current = true;
      titleRef.current?.focus();
    } else if (hasOpened.current)
      homeRef.current?.focus({ preventScroll: true });
  }, [app, actorId]);
  useEffect(() => {
    if (!options) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOptions(false);
        menuButton.current?.focus();
      }
    };
    const outside = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOptions(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", outside);
    };
  }, [options]);
  function validate(p: Employee) {
    if (!p.firstName.trim() || !p.lastName.trim())
      return "Enter a first and last name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim()))
      return "Enter a valid email address.";
    if (
      employees.some(
        (e) =>
          e.id !== p.id &&
          e.email.toLowerCase() === p.email.trim().toLowerCase(),
      )
    )
      return "An employee already uses this email address.";
    return null;
  }
  function clean(p: Employee): Employee {
    return {
      ...p,
      firstName: p.firstName.trim(),
      lastName: p.lastName.trim(),
      email: p.email.trim(),
    };
  }
  function saveProfile(p: Employee) {
    if (p.id !== actor.id || !allowed(actor, "profile", "edit"))
      return "You do not have permission to edit this profile.";
    const error = validate(p);
    if (error) return error;
    setEmployees((old) =>
      old.map((e) =>
        e.id === actor.id
          ? { ...clean(p), permissions: e.permissions, status: e.status }
          : e,
      ),
    );
    return null;
  }
  function saveEmployee(p: Employee) {
    const existing = employees.find((e) => e.id === p.id);
    const details = allowed(actor, "employees", existing ? "edit" : "create");
    const manage = allowed(actor, "employees", "manage");
    if ((!existing && !details) || (existing && !details && !manage))
      return "You do not have permission to save these changes.";
    let next =
      existing && !details
        ? { ...existing, permissions: p.permissions }
        : clean(p);
    if (!manage)
      next = {
        ...next,
        permissions:
          existing?.permissions || structuredClone(defaultPermissions),
      };
    if (next.id === "john")
      next = {
        ...next,
        permissions: structuredClone(fullPermissions),
        status: "Active",
      };
    const error = validate(next);
    if (error) return error;
    if (!existing) next = { ...next, id: crypto.randomUUID() };
    setEmployees((old) =>
      existing ? old.map((e) => (e.id === next.id ? next : e)) : [...old, next],
    );
    if (
      next.id === actorId &&
      (next.status === "Inactive" || !next.permissions.employees.view)
    ) {
      setActive(null);
      if (next.status === "Inactive") setActorId("john");
    }
    return null;
  }
  function switchEmployee(id: string) {
    if (
      !allowed(actor, "employees") ||
      !employees.some((e) => e.id === id && e.status === "Active")
    )
      return;
    setActorId(id);
    setActive(null);
  }
  function reset() {
    generation.current += 1;
    setChats({});
    setEmployees(structuredClone(initialEmployees));
    setCompany({ ...initialCompany });
    setActorId("john");
    setActive(null);
    setOptions(false);
    setRevision((r) => r + 1);
  }
  return (
    <main
      className={`pc-workspace ${app ? "pc-in-app" : "pc-on-home"}`}
      id="main"
    >
      <div className="pc-wallpaper" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {actorId !== "john" && (
        <button
          className="pc-return"
          onClick={() => {
            setActorId("john");
            setActive(null);
          }}
        >
          <ArrowLeft size={14} />
          Return to John
        </button>
      )}
      {!app ? (
        <nav className="pc-launcher" aria-label="Employee apps">
          <h1 className="pc-demo-heading">Demo</h1>
          {apps
            .filter((a) => allowed(actor, a.id))
            .map((a, index) => {
              return (
                <button
                  ref={index === 0 ? homeRef : undefined}
                  key={a.id}
                  className={`pc-app-icon pc-icon-${a.id}`}
                  onClick={() => {
                    if (allowed(actor, a.id)) {
                      setActive(a.id);
                      setOptions(false);
                    }
                  }}
                >
                  <span className="pc-icon-art">
                    <img
                      src={a.icon}
                      alt=""
                      width="300"
                      height="300"
                      decoding="async"
                    />
                  </span>
                  <span>{a.name}</span>
                </button>
              );
            })}
          {!apps.some((a) => allowed(actor, a.id)) && (
            <div className="pc-no-apps">
              <ShieldCheck size={30} />
              <p>No apps assigned</p>
            </div>
          )}
        </nav>
      ) : app === "well" ? (
        <Suspense fallback={<p>Opening well…</p>}>
          <WellViewer onBack={() => setActive(null)} />
        </Suspense>
      ) : (
        <div className={`pc-app-window pc-window-${app}`}>
          <div className="pc-app-toolbar">
            <button
              className="pc-back"
              onClick={() => {
                setActive(null);
                setOptions(false);
              }}
            >
              <ArrowLeft size={17} />
              <span>Back to apps</span>
            </button>
            <h1 ref={titleRef} tabIndex={-1}>
              {apps.find((a) => a.id === app)!.name}
            </h1>
            <span className="pc-toolbar-avatar">
              <Avatar person={actor} />
            </span>
          </div>
          <div
            className="pc-app-content"
            key={`${actor.id}-${revision}-${app}`}
          >
            {app === "chat" && (
              <AIChat
                state={chats[actor.id] || newChat()}
                canUse={allowed(actor, "chat", "use")}
                setState={(value) =>
                  setChats((old) =>
                    generation.current !== revision
                      ? old
                      : {
                          ...old,
                          [actor.id]:
                            typeof value === "function"
                              ? value(old[actor.id] || newChat())
                              : value,
                        },
                  )
                }
              />
            )}
            {app === "profile" && (
              <Profile person={actor} company={company} save={saveProfile} />
            )}
            {app === "company" && (
              <CompanyApp
                company={company}
                canEdit={allowed(actor, "company", "edit")}
                save={(value) => {
                  if (allowed(actor, "company", "edit")) setCompany(value);
                }}
              />
            )}
            {app === "employees" && (
              <EmployeesApp
                employees={employees}
                actor={actor}
                save={saveEmployee}
                viewAs={switchEmployee}
              />
            )}
          </div>
        </div>
      )}
      <div
        className="pc-workspace-options"
        hidden={app === "well"}
        ref={menuRef}
      >
        <button
          ref={menuButton}
          className="pc-options-button"
          aria-label="Workspace options"
          aria-expanded={options}
          aria-controls="workspace-options"
          onClick={() => setOptions(!options)}
        >
          <Ellipsis size={23} />
        </button>
        {options && (
          <div className="pc-options-panel" id="workspace-options">
            <span className="pc-caption">Sample data · Resets on refresh</span>
            <button onClick={reset}>
              <RotateCcw size={16} />
              Reset workspace
            </button>
            <a href="/">
              <Home size={16} />
              Return to website
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
