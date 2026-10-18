import { t, getLanguage } from "./i18n";
export type Session = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: "Admin" | "Customer";
  locale: "en" | "da";
  csrf: string;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  csrf?: string,
): Promise<T> {
  const response = await fetch(
    (path.startsWith("/customer/") || path.startsWith("/auth/")
      ? "/api"
      : "/backoffice/api") + path,
    {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        "Accept-Language": getLanguage(),
        ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
  );
  const data = await response.json();
  if (
    response.status === 401 &&
    path !== "/auth/login" &&
    !(path === "/auth/reauth" && data.code === "invalid_otp")
  )
    window.dispatchEvent(new Event("session-expired"));
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.messageKey ||
        data.message ||
        t("Handlingen kunne ikke gennemføres."),
      data.code,
    );
  return data;
}
