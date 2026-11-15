import { NavLink, Link, Outlet } from "react-router-dom";
import { PROFILES, useSession } from "./session.jsx";

const STUDENT_LINKS = [
  { to: "/", label: "Find a spot", end: true },
  { to: "/bookings", label: "My bookings" },
  { to: "/pass", label: "Monthly pass" },
  { to: "/find", label: "Find my vehicle" },
  { to: "/payments", label: "Fines & payments" }
];

const OFFICE_LINKS = [];

export default function Layout() {
  const { profile, setProfileId } = useSession();
  const links = profile.role === "admin" ? OFFICE_LINKS : STUDENT_LINKS;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">P</span>
            CampusPark <small>G10</small>
          </Link>

          <nav className="nav" aria-label="Main">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end}>
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="topbar-right">
            <label className="profile-switch">
              <span className="sr-only">Signed in as</span>
              <select value={profile.id} onChange={(e) => setProfileId(e.target.value)}>
                {PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.detail}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      <Outlet />

      <footer className="footer">
        CampusPark · G10 Vehicle Parking System, Software Engineering mini-project. Pick a profile at the
        top right; proper student login comes with the security work.
      </footer>
    </>
  );
}
