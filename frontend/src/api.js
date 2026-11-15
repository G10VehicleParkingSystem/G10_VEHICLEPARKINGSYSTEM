// Thin wrapper around fetch for the backend REST API.
// Every endpoint answers { success, message, ... }; a failed call throws with the
// backend's own message so screens can show it as is.
const BASE = import.meta.env.VITE_API_BASE || "/api";

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error("Can't reach the parking server. Is the backend running?");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

export const get = (path) => api("GET", path);
export const post = (path, body) => api("POST", path, body);
export const patch = (path, body) => api("PATCH", path, body);
export const del = (path) => api("DELETE", path);
