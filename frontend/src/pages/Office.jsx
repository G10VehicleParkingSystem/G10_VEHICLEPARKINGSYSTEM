import { useState } from "react";
import { get, post } from "../api.js";
import { Empty, LoadError, StatusTag, VEHICLE_TYPES, rupees, useAction, useLoad, zoneName, zoneOf } from "../ui.jsx";

/* ---------- Overview (FR-6) ---------- */

function Bars({ items, label, value, format = (v) => v }) {
  if (!items.length) return <p className="muted small">No data yet.</p>;
  const max = Math.max(...items.map(value), 1);
  return (
    <div className="bars">
      {items.map((item, i) => (
        <div className="bar" key={i}>
          <span className="bar-label">{label(item)}</span>
          <span className="bar-track"><span style={{ width: `${(value(item) / max) * 100}%` }} /></span>
          <span className="bar-value">{format(value(item))}</span>
        </div>
      ))}
    </div>
  );
}

const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;

export function Overview() {
  const { data, error, reload } = useLoad(() => get("/analytics").then((d) => d.analytics), []);

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <p className="muted small">Loading the report…</p>;

  const { summary, occupancy, peakHours, vehicleTypeBreakdown, revenue } = data;
  const now = occupancy.current;
  const busiest = [...peakHours].sort((a, b) => b.reservationCount - a.reservationCount)[0];

  return (
    <>
      <div className="stats">
        <div className="stat">
          <span className="label">Full right now</span>
          <strong>{Math.round(now.occupancyRate)}%</strong>
          <span className="muted small">{now.occupiedSlots} of {now.totalSlots} slots taken</span>
        </div>
        <div className="stat">
          <span className="label">Bookings</span>
          <strong>{summary.totalReservations}</strong>
          <span className="muted small">
            {summary.confirmedReservations} upcoming · {summary.completedReservations} done · {summary.cancelledReservations} cancelled
          </span>
        </div>
        <div className="stat">
          <span className="label">Money in</span>
          <strong>{rupees(revenue.totalRevenue)}</strong>
          <span className="muted small">
            {rupees(revenue.parkingRevenue)} parking · {rupees(revenue.fineRevenue)} fines
          </span>
        </div>
        <div className="stat">
          <span className="label">Busiest hour</span>
          <strong>{busiest ? hourLabel(busiest.hour) : "–"}</strong>
          <span className="muted small">{busiest ? `${busiest.reservationCount} bookings start then` : "No bookings yet"}</span>
        </div>
      </div>

      <div className="cols" style={{ marginTop: 22 }}>
        <section className="panel">
          <div className="panel-head"><h2>When people arrive</h2><span className="hint">Bookings by start hour</span></div>
          <Bars items={[...peakHours].sort((a, b) => a.hour - b.hour)} label={(h) => hourLabel(h.hour)} value={(h) => h.reservationCount} />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Money in per day</h2><span className="hint">{revenue.successfulPayments} payments, {revenue.failedPayments} failed</span></div>
          <Bars items={revenue.dailyRevenue} label={(d) => new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            value={(d) => d.amount} format={rupees} />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Most-used slots</h2></div>
          <Bars items={occupancy.frequentlyUsedSlots.slice(0, 8)} label={(s) => s.slotNumber} value={(s) => s.reservationCount} />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Vehicle types</h2></div>
          <Bars items={vehicleTypeBreakdown} label={(v) => VEHICLE_TYPES[v.type]?.label || v.type} value={(v) => v.reservationCount} />
        </section>
      </div>
    </>
  );
}

/* ---------- Slots ---------- */

function AddSlot({ onAdded }) {
  const { busy, run } = useAction();
  const [form, setForm] = useState({ slotNumber: "", length: 5, width: 2.5, height: 2.2 });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(event) {
    event.preventDefault();
    const ok = await run(
      "add",
      () => post("/slots", { slotNumber: form.slotNumber.trim().toUpperCase(), length: Number(form.length),
        width: Number(form.width), height: Number(form.height) }),
      (d) => `Slot ${d.slot.slotNumber} added.`
    );
    if (ok) {
      setForm({ ...form, slotNumber: "" });
      onAdded();
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="row">
        <div className="field">
          <label htmlFor="slot-number">Slot number</label>
          <input id="slot-number" className="plate-input" placeholder="A-09" value={form.slotNumber} onChange={set("slotNumber")} required />
          <span className="help">Letters first set the area: TW = two-wheeler bay, FAC = faculty lot.</span>
        </div>
      </div>
      <div className="row">
        {["length", "width", "height"].map((dim) => (
          <div className="field" key={dim}>
            <label htmlFor={`slot-${dim}`}>{dim[0].toUpperCase() + dim.slice(1)} (m)</label>
            <input id={`slot-${dim}`} type="number" step="0.1" min="0.1" value={form[dim]} onChange={set(dim)} required />
          </div>
        ))}
      </div>
      <div>
        <button className="btn btn-navy" disabled={busy === "add"}>{busy === "add" ? "Adding…" : "Add slot"}</button>
      </div>
    </form>
  );
}

export function Slots() {
  const { data, error, reload } = useLoad(() => get("/slots").then((d) => d.slots), []);
  const { busy, run } = useAction();

  const zones = new Map();
  for (const slot of data || []) {
    const zone = zoneOf(slot.slotNumber);
    zones.set(zone, [...(zones.get(zone) || []), slot]);
  }

  return (
    <div className="cols">
      <div className="stack">
        <section className="panel">
          <div className="panel-head"><h2>Add a slot</h2></div>
          <AddSlot onAdded={reload} />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Overstays</h2></div>
          <p className="muted small" style={{ marginBottom: 12 }}>
            The server checks every minute for anyone still parked after their booking ended, fines them ₹100 per
            hour over and sends an alert. Run it now if you don't want to wait.
          </p>
          <button type="button" className="btn btn-outline" disabled={busy === "detect"}
            onClick={() => run("detect", () => post("/overstays/detect"),
              (d) => (d.detected ? `${d.detected} overstay${d.detected > 1 ? "s" : ""} found and fined.` : "No one has overstayed."))}>
            Check for overstays now
          </button>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Slot map</h2>
          <span className="hint">
            <span className="key free" /> free <span className="key taken" /> taken
          </span>
        </div>
        {error && <LoadError error={error} onRetry={reload} />}
        {data && data.length === 0 && <Empty title="No slots yet">Add the first one on the left.</Empty>}
        {[...zones.entries()].sort().map(([zone, slots]) => (
          <div key={zone} className="slot-zone">
            <h3>{zoneName(zone)} <span className="muted small">· {slots.filter((s) => s.status === "AVAILABLE").length} free of {slots.length}</span></h3>
            <div className="slot-grid">
              {slots.map((s) => (
                <div key={s._id} className={`slot-cell ${s.status === "AVAILABLE" ? "free" : "taken"}`}
                  title={`${s.slotNumber}: ${s.length} × ${s.width} × ${s.height} m`}>
                  <span className="mono">{s.slotNumber}</span>
                  <StatusTag status={s.status} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export default function Office({ tab }) {
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{tab === "slots" ? "Slots" : "Parking office"}</h1>
          <p>{tab === "slots"
            ? "Add slots, see which ones are taken, and run the overstay check."
            : "How full campus parking is, when people arrive and what came in."}</p>
        </div>
      </div>
      {tab === "slots" ? <Slots /> : <Overview />}
    </main>
  );
}
