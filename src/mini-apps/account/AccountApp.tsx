import { useState, type FormEvent } from "react";
import { LockKeyhole, ArrowUpRight } from "lucide-react";
import { api, errorMessage, type Profile } from "../../api";
import { Link } from "../../App";
export default function Account({
  profile,
  onUpdate,
}: {
  profile: Profile;
  onUpdate: (p: Profile) => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      onUpdate(
        await api.updateProfile({
          name: String(data.get("name")),
          company: String(data.get("company")),
        }),
      );
      setMessage("Your account has been updated.");
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-grid">
      <form className="panel" onSubmit={save}>
        <h2>Account details</h2>
        <p>The details associated with your workspace.</p>
        <label>
          Full name
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={profile.name}
          />
        </label>
        <label>
          Company
          <input
            name="company"
            maxLength={120}
            defaultValue={profile.company}
          />
        </label>
        <label>
          Email address
          <input value={profile.email} readOnly />
        </label>
        <p className="form-note">
          Contact the team if your email address needs to change.
        </p>
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        {message && (
          <div role="status" className="alert">
            {message}
          </div>
        )}
      </form>
      <div className="panel">
        <LockKeyhole className="blue-icon" />
        <h2>Account security</h2>
        <p>We’ll email a secure link to change your password.</p>
        <Link to="/forgot-password" className="small-button">
          Reset password <ArrowUpRight size={15} />
        </Link>
        <hr />
        <span className="eyebrow">Your access</span>
        <p>
          {profile.role === "admin" ? "Administrator" : "Member"} · Active
          account
        </p>
        <p className="form-note">
          Application access is managed by an iRobotX administrator.
        </p>
      </div>
    </div>
  );
}
