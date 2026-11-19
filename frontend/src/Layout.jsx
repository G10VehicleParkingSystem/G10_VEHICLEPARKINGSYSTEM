import { useEffect } from "react";
import { NavLink, Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "./session.jsx";
import { useLoad } from "./ui.jsx";
import { loadAlerts } from "./pages/Alerts.jsx";

const STUDENT_LINKS = [
  { to: "/", label: "Find a spot", end: true },
  { to: "/bookings", label: "My bookings" },
  { to: "/pass", label: "Monthly pass" },
  { to: "/find", label: "Find my vehicle" },
  { to: "/payments", label: "Fines & payments" }
];

const OFFICE_LINKS = [
  { to: "/office", label: "Overview", end: true },
  { to: "/office/slots", label: "Slots" },
  { to: "/office/gate", label: "Gate check" }
];

function AlertsLink({ userId }) {
  const location = useLocation();
  const { data, reload } = useLoad(() => loadAlerts(userId), [userId, location.pathname]);

  useEffect(() => {
    const timer = setInterval(reload, 30000);
    window.addEventListener("campuspark:alerts", reload);
    return () => {
      clearInterval(timer);
      window.removeEventListener("campuspark:alerts", reload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const unread = data?.filter((n) => !n.isRead).length || 0;
  return (
    <NavLink to="/alerts" className="alerts-link">
      Alerts{unread > 0 && <span className="alerts-count">{unread}</span>}
    </NavLink>
  );
}

export default function Layout() {
  const { profile, signOut } = useSession();
  const navigate = useNavigate();
  const isOffice = profile.role === "admin";
  const roleLabel = isOffice ? "Admin" : profile.detail || (profile.role === "faculty" ? "Faculty" : "Student");

  function leave() {
    signOut();
    navigate("/login", { replace: true });
  }
  const links = isOffice ? OFFICE_LINKS : STUDENT_LINKS;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to={isOffice ? "/office" : "/"} className="brand">
            <span className="brand-mark" aria-hidden="true">P</span>
            CampusPark <small>{isOffice ? "Parking office" : "G10"}</small>
          </Link>

          <nav className="nav" aria-label="Main">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end}>
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="topbar-right">
            {!isOffice && <AlertsLink userId={profile.id} />}
            <div className="account">
              <span className="account-name">
                <span className="sr-only">Signed in as </span>
                {profile.name}
                <small>{roleLabel}</small>
              </span>
              <button type="button" className="btn-signout" onClick={leave}>Sign out</button>
            </div>
          </div>
        </div>
      </header>

      <Outlet />

      <footer className="footer">
        CampusPark · G10 Vehicle Parking System, Software Engineering mini-project.
      </footer>
    </>
  );
}
