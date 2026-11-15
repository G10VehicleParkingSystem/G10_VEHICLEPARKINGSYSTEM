import { useState } from "react";
import { get } from "../api.js";
import { useSession } from "../session.jsx";
import { Empty, Plate, VEHICLE_TYPES, formatDateTime, useAction, zoneName, zoneOf } from "../ui.jsx";

function duration(from, to) {
  const minutes = Math.max(1, Math.round((new Date(to) - new Date(from)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export default function FindVehicle() {
  const { vehicles } = useSession();
  const { busy, run } = useAction();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);

  async function search(number) {
    const vehicleNumber = number.replace(/\s+/g, "").toUpperCase();
    setQuery(vehicleNumber);
    const data = await run("search", () => get(`/parking/tracking/${encodeURIComponent(vehicleNumber)}`));
    setResult(data);
  }

  const history = result ? [...result.parkingHistory].reverse() : [];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Find my vehicle</h1>
          <p>Forgot where you parked after a long lab? Search the number plate to see the slot it's in and
            its past visits.</p>
        </div>
      </div>

      <section className="panel" style={{ marginBottom: 22 }}>
        <form className="search-row" onSubmit={(e) => { e.preventDefault(); search(query); }}>
          <label htmlFor="search" className="sr-only">Vehicle number</label>
          <input id="search" className="plate-input" placeholder="KA 05 MX 2231" value={query}
            onChange={(e) => setQuery(e.target.value)} required />
          <button className="btn btn-navy" disabled={busy === "search"}>
            {busy === "search" ? "Searching…" : "Search"}
          </button>
        </form>
        {vehicles.length > 0 && (
          <div className="actions" style={{ marginTop: 12 }}>
            <span className="muted small">Yours:</span>
            {vehicles.map((v) => (
              <button key={v.vehicleNumber} type="button" className="plate-button" onClick={() => search(v.vehicleNumber)}>
                <Plate number={v.vehicleNumber} />
              </button>
            ))}
          </div>
        )}
      </section>

      {result && (
        <div className="cols">
          <section className={`panel where ${result.currentSlot ? "is-parked" : ""}`}>
            <div className="ticket-line" style={{ marginBottom: 12 }}>
              <Plate number={result.vehicle.vehicleNumber} />
              <span className="muted small">{VEHICLE_TYPES[result.vehicle.type]?.label || result.vehicle.type}</span>
            </div>
            {result.currentSlot ? (
              <>
                <span className="label">Parked at</span>
                <div className="where-slot">{result.currentSlot.slotNumber}</div>
                <div className="muted">{zoneName(zoneOf(result.currentSlot.slotNumber))}</div>
              </>
            ) : (
              <>
                <div className="where-slot none">Not parked</div>
                <div className="muted">This vehicle isn't in any slot right now.</div>
              </>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Past visits</h2>
              <span className="hint">{history.length} total</span>
            </div>
            {history.length === 0 ? (
              <Empty title="No finished visits yet" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Slot</th><th>Arrived</th><th>Left</th><th className="num-cell">Stayed</th></tr>
                  </thead>
                  <tbody>
                    {history.map((visit) => (
                      <tr key={visit._id}>
                        <td className="mono">{visit.slotId?.slotNumber || "?"}</td>
                        <td>{formatDateTime(visit.entryTime)}</td>
                        <td>{formatDateTime(visit.exitTime)}</td>
                        <td className="num-cell">{duration(visit.entryTime, visit.exitTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
