import { get } from "../api.js";
import { Empty, LoadError, useLoad, zoneName, zoneOf } from "../ui.jsx";

// Free slots right now, grouped by zone (the letters at the start of a slot number).
export function AvailabilityBoard() {
  const { data, error, reload } = useLoad(() => get("/slots").then((d) => d.slots), []);

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <p className="muted small">Loading slots…</p>;
  if (!data.length) {
    return (
      <Empty title="No parking slots yet">
        The parking office hasn't added any slots.
      </Empty>
    );
  }

  const zones = new Map();
  for (const slot of data) {
    const zone = zones.get(zoneOf(slot.slotNumber)) || { total: 0, free: 0 };
    zone.total += 1;
    if (slot.status === "AVAILABLE") zone.free += 1;
    zones.set(zoneOf(slot.slotNumber), zone);
  }

  return (
    <div className="zones">
      {[...zones.entries()].sort().map(([name, zone]) => (
        <div className="zone" key={name}>
          <div className="zone-name">{zoneName(name)}</div>
          <div className="zone-free">
            {zone.free} <small>of {zone.total} free</small>
          </div>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${((zone.total - zone.free) / zone.total) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FindSpot() {
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Find a spot</h1>
          <p>See what's free on campus right now.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Free right now</h2>
          <span className="hint">Orange bar = how full the zone is</span>
        </div>
        <AvailabilityBoard />
      </section>
    </main>
  );
}
