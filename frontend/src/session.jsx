import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// There is no login yet (deviation D-1), so the app offers a few demo profiles.
// Each profile has its own fixed user id; the backend keys bookings, payments and
// alerts on it. The "Parking office" profile opens the admin screens.
export const PROFILES = [
  { id: "a00000000000000000000001", name: "Ananya Rao", detail: "3rd year, CSE", role: "student" },
  { id: "a00000000000000000000002", name: "Rahul Menon", detail: "2nd year, ECE", role: "student" },
  { id: "a00000000000000000000003", name: "Dr. Kavitha Iyer", detail: "Faculty, Physics", role: "student" },
  { id: "a000000000000000000000ff", name: "Parking office", detail: "Admin", role: "admin" }
];

const SessionContext = createContext(null);

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage disabled: the app still works for this visit.
  }
}

export function SessionProvider({ children }) {
  const [profileId, setProfileId] = useState(() => read("campuspark.profile", PROFILES[0].id));
  const profile = PROFILES.find((p) => p.id === profileId) || PROFILES[0];

  // The backend has no "vehicles of a user" endpoint yet, so each profile remembers
  // the vehicles it registered on this device.
  const vehiclesKey = `campuspark.vehicles.${profile.id}`;
  const [vehicles, setVehicles] = useState(() => read(vehiclesKey, []));

  useEffect(() => {
    write("campuspark.profile", profileId);
    setVehicles(read(`campuspark.vehicles.${profileId}`, []));
  }, [profileId]);

  const rememberVehicle = useCallback(
    (vehicle) => {
      setVehicles((current) => {
        const next = [
          { _id: vehicle._id, vehicleNumber: vehicle.vehicleNumber, type: vehicle.type,
            length: vehicle.length, width: vehicle.width, height: vehicle.height },
          ...current.filter((v) => v.vehicleNumber !== vehicle.vehicleNumber)
        ];
        write(vehiclesKey, next);
        return next;
      });
    },
    [vehiclesKey]
  );

  const forgetVehicle = useCallback(
    (vehicleNumber) => {
      setVehicles((current) => {
        const next = current.filter((v) => v.vehicleNumber !== vehicleNumber);
        write(vehiclesKey, next);
        return next;
      });
    },
    [vehiclesKey]
  );

  const value = useMemo(
    () => ({ profile, setProfileId, vehicles, rememberVehicle, forgetVehicle }),
    [profile, vehicles, rememberVehicle, forgetVehicle]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
