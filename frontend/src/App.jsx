import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./Layout.jsx";
import { useSession } from "./session.jsx";
import { Register, SignIn } from "./pages/SignIn.jsx";
import FindSpot from "./pages/FindSpot.jsx";
import Bookings from "./pages/Bookings.jsx";
import FindVehicle from "./pages/FindVehicle.jsx";
import Payments from "./pages/Payments.jsx";
import MonthlyPass from "./pages/MonthlyPass.jsx";
import Alerts from "./pages/Alerts.jsx";
import Office from "./pages/Office.jsx";

// Signed-out visitors only see the sign-in and register screens; anything else sends
// them to sign in and back afterwards.
function SignedOut() {
  const location = useLocation();
  return (
    <Routes>
      <Route path="login" element={<SignIn />} />
      <Route path="register" element={<Register />} />
      <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
    </Routes>
  );
}

const NotFound = () => (
  <main className="page">
    <h1>Page not found</h1>
  </main>
);

export default function App() {
  const { profile } = useSession();
  if (!profile) return <SignedOut />;

  const isOffice = profile.role === "admin";
  const home = isOffice ? "/office" : "/";
  // Student screens for students and faculty, office screens for the parking office.
  const student = (element) => (isOffice ? <Navigate to="/office" replace /> : element);
  const office = (element) => (isOffice ? element : <Navigate to="/" replace />);

  return (
    <Routes>
      <Route path="login" element={<Navigate to={home} replace />} />
      <Route path="register" element={<Navigate to={home} replace />} />
      <Route element={<Layout />}>
        <Route index element={student(<FindSpot />)} />
        <Route path="bookings" element={student(<Bookings />)} />
        <Route path="pass" element={student(<MonthlyPass />)} />
        <Route path="find" element={student(<FindVehicle />)} />
        <Route path="payments" element={student(<Payments />)} />
        <Route path="alerts" element={student(<Alerts />)} />
        <Route path="office" element={office(<Office tab="overview" />)} />
        <Route path="office/slots" element={office(<Office tab="slots" />)} />
        <Route path="office/gate" element={office(<Office tab="gate" />)} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
