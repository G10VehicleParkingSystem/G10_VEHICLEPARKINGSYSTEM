import { Route, Routes } from "react-router-dom";
import Layout from "./Layout.jsx";
import FindSpot from "./pages/FindSpot.jsx";
import Bookings from "./pages/Bookings.jsx";
import FindVehicle from "./pages/FindVehicle.jsx";
import Payments from "./pages/Payments.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<FindSpot />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="find" element={<FindVehicle />} />
        <Route path="payments" element={<Payments />} />
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
