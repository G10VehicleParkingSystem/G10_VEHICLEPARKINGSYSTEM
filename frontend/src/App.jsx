import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./Layout.jsx";
import { useSession } from "./session.jsx";
import FindSpot from "./pages/FindSpot.jsx";
import Bookings from "./pages/Bookings.jsx";
import FindVehicle from "./pages/FindVehicle.jsx";
import Payments from "./pages/Payments.jsx";
import MonthlyPass from "./pages/MonthlyPass.jsx";
import Alerts from "./pages/Alerts.jsx";
import Office from "./pages/Office.jsx";

export default function App() {
  const { profile } = useSession();
  const isOffice = profile.role === "admin";

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={isOffice ? <Navigate to="/office" replace /> : <FindSpot />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="pass" element={<MonthlyPass />} />
        <Route path="find" element={<FindVehicle />} />
        <Route path="payments" element={<Payments />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="office" element={<Office tab="overview" />} />
        <Route path="office/slots" element={<Office tab="slots" />} />
        <Route
          path="*"
          element={
            <main className="page">
              <h1>Page not found</h1>
            </main>
          }
        />
      </Route>
    </Routes>
  );
}
