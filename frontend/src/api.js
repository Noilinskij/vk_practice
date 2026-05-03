const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

export async function apiRequest(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const error = payload && payload.error ? payload.error : response.statusText;
    throw new Error(error);
  }

  return payload;
}

export function withAuth(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`
    }
  };
}

export { API_BASE };
