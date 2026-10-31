export const API =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  (typeof chrome !== "undefined" && chrome.runtime?.id
    ? "http://127.0.0.1:3001"
    : "");
export async function request<T>(
  path: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(API + path, { ...options, headers });
  } catch {
    throw new Error(
      `Cannot reach Vesti API at ${API || location.origin}. Check that the API is running and its URL is configured correctly. Reload an updated extension in chrome://extensions.`,
    );
  }
  if (!response.ok) {
    const b = await response
      .json()
      .catch(() => ({ message: "API unavailable" }));
    throw new Error(b.message || `Request failed (${response.status})`);
  }
  return response.json();
}
