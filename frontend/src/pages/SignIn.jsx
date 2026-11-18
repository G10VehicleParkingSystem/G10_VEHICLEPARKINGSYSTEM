import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../session.jsx";

const ROLES = {
  student: { label: "Student", detail: "Year and branch", placeholder: "3rd year, CSE" },
  faculty: { label: "Faculty or staff", detail: "Department", placeholder: "Physics" }
};

function AuthShell({ title, lead, children, footer }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">P</span>
          CampusPark
        </Link>
        <div className="auth-side-copy">
          <p className="auth-kicker">College parking, sorted</p>
          <p>Book a spot before you leave the hostel, show your gate pass at the boom barrier, and stop
            circling the lot ten minutes before a lab.</p>
        </div>
        <div className="auth-ticket" aria-hidden="true">
          <span className="mono">ZONE A · A-04</span>
          <span>Today 9:00 – 1:00 pm</span>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h1>{title}</h1>
          <p className="muted">{lead}</p>
          {children}
          <p className="auth-footer small">{footer}</p>
        </div>
      </main>
    </div>
  );
}

function useAfterSignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  return (user) => {
    const wanted = location.state?.from;
    const home = user.role === "admin" ? "/office" : "/";
    const allowed = wanted && (user.role === "admin") === wanted.startsWith("/office");
    navigate(allowed ? wanted : home, { replace: true });
  };
}

export function SignIn() {
  const { signIn, expired } = useSession();
  const done = useAfterSignIn();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      done(await signIn(form.email.trim(), form.password));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      lead="Use the email you registered with."
      footer={<>New here? <Link to="/register">Create an account</Link></>}
    >
      {expired && !error && <div className="notice" role="status">You were signed out. Please sign in again.</div>}
      {error && <div className="notice warn" role="alert">{error}</div>}
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">College email</label>
          <input id="email" type="email" autoComplete="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="muted small" style={{ marginTop: 14 }}>
        Parking office staff sign in here too, with the office account.
      </p>
    </AuthShell>
  );
}

export function Register() {
  const { register } = useSession();
  const done = useAfterSignIn();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "student", detail: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const role = ROLES[form.role];

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      done(await register({ ...form, name: form.name.trim(), email: form.email.trim() }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create an account"
      lead="Takes a minute. You'll add your vehicle right after."
      footer={<>Already have one? <Link to="/login">Sign in</Link></>}
    >
      {error && <div className="notice warn" role="alert">{error}</div>}
      <form className="form" onSubmit={submit}>
        <div className="field">
          <span className="label">I am</span>
          <div className="choice-row">
            {Object.entries(ROLES).map(([key, info]) => (
              <button key={key} type="button" className="choice" aria-pressed={form.role === key}
                onClick={() => setForm({ ...form, role: key })}>
                {info.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" autoComplete="name" value={form.name} onChange={set("name")} required maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="detail">{role.detail} <span className="muted">(optional)</span></label>
          <input id="detail" placeholder={role.placeholder} value={form.detail} onChange={set("detail")} maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="email">College email</label>
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password" minLength={8} maxLength={72}
            value={form.password} onChange={set("password")} required />
          <span className="help">At least 8 characters.</span>
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
    </AuthShell>
  );
}
