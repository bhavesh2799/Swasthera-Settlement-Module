/**
 * Global fetch interceptor that attaches the active role (from the role switcher,
 * persisted in localStorage) as an `X-Role` header on every same-origin `/api`
 * request. This lets the backend `authorize()` middleware enforce RBAC without a
 * real login system. Covers both the generated TanStack Query hooks and the
 * manual `fetch` calls used by newer endpoints.
 */
export function installApiInterceptor() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __swastheraFetchPatched?: boolean };
  if (w.__swastheraFetchPatched) return;
  w.__swastheraFetchPatched = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url = "";
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.toString();
    else if (input instanceof Request) url = input.url;

    const isApiCall = url.includes("/api/");
    if (!isApiCall) return originalFetch(input, init);

    const role = localStorage.getItem("swasthera_role") || "maker";
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set("X-Role", role);

    if (input instanceof Request) {
      return originalFetch(new Request(input, { headers }), init);
    }
    return originalFetch(input, { ...init, headers });
  };
}
