import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { get, post } from "../api.js";
import { Plate, VEHICLE_TYPES, formatDateTime } from "../ui.jsx";

// Gate check for the parking office: read a student's QR gate pass (camera, photo or
// typed code), ask the backend whose vehicle it is, and show where it is parked.

// Reads a QR code from anything that can be drawn on a canvas (video frame or image).
function readQr(source, width, height, canvas) {
  if (!width || !height) return null;
  const scale = Math.min(1, 1000 / Math.max(width, height));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "dontInvert" })?.data || null;
}

function Camera({ onCode }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(document.createElement("canvas"));
  const [error, setError] = useState("");

  useEffect(() => {
    let stream;
    let timer;
    let stopped = false;

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        videoRef.current.srcObject = s;
        videoRef.current.play();
        timer = setInterval(() => {
          const v = videoRef.current;
          const code = v && readQr(v, v.videoWidth, v.videoHeight, canvasRef.current);
          if (code) onCode(code);
        }, 300);
      })
      .catch(() => setError("Camera not available. Allow camera access, or use a photo or the code instead."));

    if (!navigator.mediaDevices) setError("This browser can't use the camera here. Use a photo or the code instead.");

    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="gate-camera">
      {error ? <p className="notice warn">{error}</p> : <video ref={videoRef} muted playsInline aria-label="Camera view" />}
      {!error && <p className="muted small">Hold the gate pass in front of the camera.</p>}
    </div>
  );
}

function Result({ result }) {
  if (result.state === "checking") return <p className="muted">Checking the gate pass…</p>;
  if (result.state === "invalid") {
    return (
      <div className="gate-result bad" role="alert">
        <strong>Not a valid gate pass</strong>
        <p>{result.message}</p>
      </div>
    );
  }

  const { vehicle, tracking } = result;
  const lastVisit = tracking?.parkingHistory?.[0];
  return (
    <div className="gate-result ok" role="status">
      <strong>Valid gate pass</strong>
      <div className="gate-vehicle">
        <Plate number={vehicle.vehicleNumber} />
        <span>{VEHICLE_TYPES[vehicle.type]?.label || vehicle.type}</span>
        <span className="muted small">
          {vehicle.length} × {vehicle.width} × {vehicle.height} m
        </span>
      </div>
      <p>
        {tracking?.currentSlot
          ? <>Parked now in <strong className="mono">{tracking.currentSlot.slotNumber}</strong>.</>
          : "Not parked on campus right now."}
        {lastVisit && <> Last visit ended {formatDateTime(lastVisit.exitTime)} ({lastVisit.slotId?.slotNumber}).</>}
      </p>
    </div>
  );
}

export default function GateCheck() {
  const [mode, setMode] = useState("camera");
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState(null);
  const lastCode = useRef("");
  const canvasRef = useRef(document.createElement("canvas"));

  async function check(code) {
    const token = code.trim();
    if (!token || token === lastCode.current) return;
    lastCode.current = token;
    setResult({ state: "checking" });
    try {
      const { vehicle } = await post("/vehicles/verify-qr", { token });
      const tracking = await get(`/parking/tracking/${encodeURIComponent(vehicle.vehicleNumber)}`).catch(() => null);
      setResult({ state: "ok", vehicle, tracking });
    } catch (error) {
      setResult({ state: "invalid", message: error.message });
    }
  }

  function reset() {
    lastCode.current = "";
    setResult(null);
    setTyped("");
  }

  async function fromPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const image = new Image();
    image.src = URL.createObjectURL(file);
    await image.decode().catch(() => null);
    const code = readQr(image, image.naturalWidth, image.naturalHeight, canvasRef.current);
    URL.revokeObjectURL(image.src);
    if (code) check(code);
    else setResult({ state: "invalid", message: "No QR code found in that photo. Try a closer, sharper picture." });
  }

  const modes = { camera: "Camera", photo: "Photo", code: "Type the code" };

  return (
    <div className="cols">
      <section className="panel">
        <div className="panel-head">
          <h2>Scan a gate pass</h2>
          <span className="hint">Students show it from Find a spot → Gate pass</span>
        </div>
        <div className="choice-row" style={{ marginBottom: 16 }}>
          {Object.entries(modes).map(([key, label]) => (
            <button key={key} type="button" className="choice" aria-pressed={mode === key}
              onClick={() => { setMode(key); reset(); }}>
              {label}
            </button>
          ))}
        </div>

        {mode === "camera" && !result && <Camera onCode={check} />}

        {mode === "photo" && (
          <div className="field">
            <label htmlFor="qr-photo">Photo of the gate pass</label>
            <input id="qr-photo" type="file" accept="image/*" capture="environment" onChange={fromPhoto} />
            <span className="help">A screenshot or a phone photo of the QR code.</span>
          </div>
        )}

        {mode === "code" && (
          <form className="form" onSubmit={(e) => { e.preventDefault(); lastCode.current = ""; check(typed); }}>
            <div className="field">
              <label htmlFor="qr-code">Code inside the QR</label>
              <input id="qr-code" className="mono" value={typed} onChange={(e) => setTyped(e.target.value)}
                placeholder="64 letters and digits" required />
            </div>
            <div><button className="btn btn-navy">Check</button></div>
          </form>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Result</h2></div>
        {result ? (
          <>
            <Result result={result} />
            <button type="button" className="btn btn-outline" style={{ marginTop: 16 }} onClick={reset}>
              Check another
            </button>
          </>
        ) : (
          <p className="muted">Scan a student's gate pass to see whose vehicle it is and where it's parked.</p>
        )}
      </section>
    </div>
  );
}
