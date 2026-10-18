import { useState, useEffect, type FormEvent } from "react";
import { Search, RefreshCw, ArrowUpRight } from "lucide-react";
import { api, errorMessage, type Profile, type AppId } from "../../api";
import { portalApps } from "../../content";
export default function Admin() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);
  async function refresh() {
    try {
      setUsers(await api.listUsers());
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }
  useEffect(() => {
    void api
      .listUsers()
      .then(setUsers)
      .catch((e) => setMessage(errorMessage(e)));
  }, []);
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      const result = await api.invite({
        email: String(data.get("email")),
        name: String(data.get("name")),
        apps: data.getAll("apps") as AppId[],
      });
      setMessage(
        result.delivery === "sent"
          ? "Invitation sent."
          : "Account created; invitation email is not yet delivered. Use Resend after checking email setup.",
      );
      form.reset();
      await refresh();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      await api.updateUser({
        uid: selected.uid,
        status: data.get("status") as "active" | "disabled",
        apps: data.getAll("apps") as AppId[],
      });
      setSelected(null);
      setMessage("Access updated.");
      await refresh();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-heading">
        <p>Invite people and manage access to the iRobotX workspace.</p>
        <button className="small-button" onClick={refresh}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {message && (
        <div role="status" className="alert">
          {message}
        </div>
      )}
      <div className="admin-grid">
        <div className="panel">
          <label className="search-label">
            <Search size={17} />
            <input
              aria-label="Search users"
              placeholder="Search name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="user-list">
            {users
              .filter((u) =>
                `${u.email} ${u.name}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((u) => (
                <article className="user-row" key={u.uid}>
                  <div className="avatar">
                    {(u.name || u.email).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="user-info">
                    <strong>{u.name || "Invited user"}</strong>
                    <span>{u.email}</span>
                    <small>
                      {u.role} · {u.status}
                      {u.invitationDelivery
                        ? ` · email ${u.invitationDelivery}`
                        : ""}
                    </small>
                  </div>
                  <div className="user-actions">
                    <button
                      className="small-button"
                      onClick={() => setSelected(u)}
                    >
                      Manage
                    </button>
                    {u.status === "invited" && (
                      <button
                        disabled={busy}
                        className="text-button"
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const r = await api.resend(u.uid);
                            setMessage(
                              r.delivery === "sent"
                                ? "Invitation sent."
                                : "Email delivery failed. Please check sender configuration.",
                            );
                            await refresh();
                          } catch (e) {
                            setMessage(errorMessage(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Resend
                      </button>
                    )}
                  </div>
                </article>
              ))}
            {users.length === 0 && <p>No users to display.</p>}
          </div>
        </div>
        <form
          className="panel"
          onSubmit={selected ? save : invite}
          key={selected?.uid || "invite"}
        >
          <h2>{selected ? "Manage access" : "Invite a teammate"}</h2>
          {selected ? (
            <>
              <p>{selected.email}</p>
              <label>
                Account status
                <select
                  name="status"
                  defaultValue={
                    selected.status === "disabled" ? "disabled" : "active"
                  }
                >
                  <option value="active">
                    {selected.status === "invited"
                      ? "Keep invitation active"
                      : "Active"}
                  </option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                Full name
                <input name="name" required maxLength={100} />
              </label>
              <label>
                Email address
                <input name="email" type="email" required maxLength={254} />
              </label>
            </>
          )}
          <fieldset>
            <legend>Application assignments</legend>
            <p className="form-note">
              These applications are coming soon. Assignments reserve future
              access.
            </p>
            {portalApps.map((d) => (
              <label className="checkbox" key={d.id}>
                <input
                  type="checkbox"
                  name="apps"
                  value={d.id}
                  defaultChecked={selected?.apps.includes(d.id)}
                />
                {d.name}
              </label>
            ))}
          </fieldset>
          <button className="button" disabled={busy}>
            {busy ? "Working…" : selected ? "Save access" : "Send invitation"}
            <ArrowUpRight size={16} />
          </button>
          {selected && (
            <button
              type="button"
              className="text-button"
              onClick={() => setSelected(null)}
            >
              Cancel
            </button>
          )}
        </form>
      </div>
    </>
  );
}
