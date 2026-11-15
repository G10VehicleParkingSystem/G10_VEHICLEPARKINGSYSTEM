import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/* ---------- Toasts ---------- */

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const show = useCallback((message, kind = "ok") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, kind }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "bad" ? "bad" : ""}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ---------- Data loading ---------- */

// Loads data on mount and whenever `deps` change; `reload` fetches again.
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    loader()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error) => !cancelled && setState({ data: null, error, loading: false }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}

// Wraps an async action: disables its button while running and reports the result.
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(null);

  const run = useCallback(
    async (key, fn, successMessage) => {
      setBusy(key);
      try {
        const result = await fn();
        if (successMessage) {
          toast(typeof successMessage === "function" ? successMessage(result) : successMessage);
        }
        return result;
      } catch (error) {
        toast(error.message, "bad");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [toast]
  );

  return { busy, run };
}

/* ---------- Small pieces ---------- */

export function Plate({ number }) {
  return (
    <span className="plate" title="Vehicle number">
      <span className="ind">IND</span>
      <span className="num">{number}</span>
    </span>
  );
}

const STATUS_STYLE = {
  CONFIRMED: ["Booked", "ok"],
  COMPLETED: ["Finished", "grey"],
  CANCELLED: ["Cancelled", "bad"],
  ACTIVE: ["Active", "ok"],
  AVAILABLE: ["Free", "ok"],
  OCCUPIED: ["Taken", "orange"],
  SUCCESS: ["Paid", "ok"],
  FAILED: ["Failed", "bad"],
  UNPAID: ["Unpaid", "warn"],
  PAID: ["Paid", "ok"],
  PENDING_PAYMENT: ["Awaiting payment", "warn"],
  PAYMENT_FAILED: ["Payment failed", "bad"],
  EXPIRED: ["Expired", "grey"]
};

export function StatusTag({ status }) {
  const [label, kind] = STATUS_STYLE[status] || [status, ""];
  return <span className={`tag ${kind}`}>{label}</span>;
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function LoadError({ error, onRetry }) {
  return (
    <div className="notice warn">
      {error.message}{" "}
      {onRetry && (
        <button type="button" className="btn-link" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/* ---------- Formatting ---------- */

export const rupees = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;

export function formatDay(value) {
  return new Date(value).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function formatDateTime(value) {
  return value ? `${formatDay(value)}, ${formatTime(value)}` : "–";
}

// "A-12" and "LIB-04" belong to zones "A" and "LIB"; plain numbers go to "Main".
export function zoneOf(slotNumber) {
  const match = /^([A-Z]+)[-\s]?\d/i.exec(slotNumber || "");
  return match ? match[1].toUpperCase() : "Main";
}

const ZONE_NAMES = {
  TW: "Two-wheeler bay",
  FAC: "Faculty lot",
  BUS: "Bus bay",
  LIB: "Library lot",
  HOS: "Hostel lot",
  Main: "Main lot"
};

export const zoneName = (zone) => ZONE_NAMES[zone] || `Zone ${zone}`;

export const VEHICLE_TYPES = {
  BIKE: { label: "Two-wheeler", size: { length: 2.0, width: 0.8, height: 1.2 } },
  CAR: { label: "Car", size: { length: 4.2, width: 1.8, height: 1.6 } },
  SUV: { label: "SUV", size: { length: 4.7, width: 1.9, height: 1.8 } },
  VAN: { label: "Van", size: { length: 5.0, width: 2.0, height: 2.1 } },
  TRUCK: { label: "Truck", size: { length: 7.5, width: 2.5, height: 3.2 } }
};
