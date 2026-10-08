export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  csrfToken?: string | undefined;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal | undefined;
};

const fallbackMessage = "تعذر الاتصال بالخادم، حاول مرة أخرى";

/** Calls the API through the web app's same-origin `/api` proxy and raises `ApiError` for every failure. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) if (value !== undefined && value !== "") search.set(key, String(value));
  const url = `/api${path}${search.size > 0 ? `?${search.toString()}` : ""}`;
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.csrfToken) headers.set("X-CSRF-Token", options.csrfToken);

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      credentials: "same-origin",
      cache: "no-store",
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", fallbackMessage);
  }

  const text = await response.text();
  let payload: unknown;
  try { payload = text ? JSON.parse(text) : undefined; } catch { payload = undefined; }
  if (!response.ok) {
    const error = (payload as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
    throw new ApiError(
      response.status,
      typeof error?.code === "string" ? error.code : "INTERNAL_ERROR",
      typeof error?.message === "string" ? error.message : fallbackMessage,
    );
  }
  return payload as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : fallbackMessage;
}
