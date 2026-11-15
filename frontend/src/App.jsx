import { useEffect, useState } from "react";
import { get } from "./api.js";

export default function App() {
  const [status, setStatus] = useState("Checking the parking server…");

  useEffect(() => {
    get("/health")
      .then((data) => setStatus(data.message))
      .catch((error) => setStatus(error.message));
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>CampusPark</h1>
      <p>{status}</p>
    </main>
  );
}
