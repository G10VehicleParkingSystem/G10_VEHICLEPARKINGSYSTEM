// Thin wrapper around fetch for the backend REST API.
// Every endpoint answers { success, message, ... }; a failed call throws with the
// backend's own message so screens can show it as is. The signed-in user's token is
// sent with every request.
const BASE = import.meta.env.VITE_API_BASE || "/api";

let token = null;
let onSignedOut = () => {};

export function setToken(next) {
  token = next;
}

// Called when the server no longer accepts the token (expired, or the server restarted
// without a fixed JWT_SECRET).
export function whenSignedOut(handler) {
  onSignedOut = handler;
}

export async function api(method, path, body) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error("Can't reach the parking server. Is the backend running?");
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) onSignedOut();
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

export const get = (path) => api("GET", path);
export const post = (path, body) => api("POST", path, body);
export const patch = (path, body) => api("PATCH", path, body);
export const del = (path) => api("DELETE", path);
