import { Route, Routes } from "react-router-dom";
import Layout from "./Layout.jsx";
import FindSpot from "./pages/FindSpot.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<FindSpot />} />
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
