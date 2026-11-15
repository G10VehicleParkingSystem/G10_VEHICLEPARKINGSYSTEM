import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { get, post, setToken, whenSignedOut } from "./api.js";

// The signed-in account and its vehicles. The token is kept in localStorage so a
// refresh does not sign you out; the server decides who you are from it.
const STORAGE_KEY = "campuspark.auth";
const SessionContext = createContext(null);

function readAuth() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return saved?.token && saved?.user ? saved : null;
  } catch {
    return null;
  }
}

function writeAuth(auth) {
  try {
    if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or storage disabled: you stay signed in until the tab closes.
  }
}

const initialAuth = readAuth();
setToken(initialAuth?.token || null);

export function SessionProvider({ children }) {
  const [auth, setAuth] = useState(initialAuth);
  const [vehicles, setVehicles] = useState([]);
  const [expired, setExpired] = useState(false);

  const user = auth?.user || null;
  const profile = useMemo(
    () => user && { id: user._id, name: user.name, email: user.email, detail: user.detail, role: user.role },
    [user]
  );

  const start = useCallback((result) => {
    const next = { token: result.token, user: result.user };
    setToken(next.token);
    writeAuth(next);
    setExpired(false);
    setAuth(next);
    return next.user;
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    writeAuth(null);
    setVehicles([]);
    setAuth(null);
  }, []);

  useEffect(() => {
    whenSignedOut(() => {
      signOut();
      setExpired(true);
    });
  }, [signOut]);

  // Check a saved sign-in is still valid and pick up any changes to the account.
  useEffect(() => {
    if (!initialAuth) return;
    get("/auth/me")
      .then((d) => {
        const next = { ...readAuth(), user: d.user };
        writeAuth(next);
        setAuth((current) => (current ? next : current));
      })
      .catch(() => {});
  }, []);

  const loadVehicles = useCallback(() => {
    if (!user || user.role === "admin") return Promise.resolve();
    return get("/vehicles/mine").then((d) => setVehicles(d.vehicles)).catch(() => {});
  }, [user]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const signIn = useCallback((email, password) => post("/auth/login", { email, password }).then(start), [start]);
  const register = useCallback((form) => post("/auth/register", form).then(start), [start]);

  const rememberVehicle = useCallback((vehicle) => {
    setVehicles((current) => [vehicle, ...current.filter((v) => v.vehicleNumber !== vehicle.vehicleNumber)]);
  }, []);

  const value = useMemo(
    () => ({ profile, vehicles, rememberVehicle, reloadVehicles: loadVehicles, signIn, register, signOut, expired }),
    [profile, vehicles, rememberVehicle, loadVehicles, signIn, register, signOut, expired]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
