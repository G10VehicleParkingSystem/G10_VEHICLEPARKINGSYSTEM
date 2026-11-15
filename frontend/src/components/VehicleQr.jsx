import { useEffect } from "react";
import { get } from "../api.js";
import { LoadError, Plate, useLoad } from "../ui.jsx";

// The QR gate pass from the backend. Security scans it at the gate to identify the
// vehicle without typing the number.
export default function VehicleQr({ vehicleNumber, onClose }) {
  const { data, error, reload } = useLoad(
    () => get(`/vehicles/${encodeURIComponent(vehicleNumber)}/qr`).then((d) => d.qrCode),
    [vehicleNumber]
  );

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Gate pass" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Gate pass</h2>
          <button type="button" className="btn-link small" onClick={onClose}>
            Close
          </button>
        </div>
        <div style={{ textAlign: "center" }}>
          <Plate number={vehicleNumber} />
          {error && <LoadError error={error} onRetry={reload} />}
          {data && <img className="qr" src={data} alt={`QR gate pass for ${vehicleNumber}`} />}
          {!data && !error && <p className="muted small" style={{ margin: "40px 0" }}>Loading…</p>}
          <p className="muted small">Show this at the gate. Security scans it instead of typing your number.</p>
        </div>
      </div>
    </div>
  );
}
