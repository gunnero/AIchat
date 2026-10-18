import { afterEach, expect, test, vi } from "vitest";
import { api } from "./client";

afterEach(() => vi.unstubAllGlobals());
test.each([
  {
    path: "/connections",
    status: 403,
    code: "reauth_required",
    expired: false,
  },
  { path: "/auth/reauth", status: 401, code: "invalid_otp", expired: false },
  { path: "/auth/reauth", status: 401, code: undefined, expired: true },
  { path: "/auth/session", status: 401, code: undefined, expired: true },
  { path: "/auth/login", status: 401, code: undefined, expired: false },
])(
  "$path ($status/$code) preserves structured errors and only expires invalid sessions",
  async ({ path, status, code, expired }) => {
    const onExpiry = vi.fn();
    window.addEventListener("session-expired", onExpiry);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: "Synthetic error", code }), {
            status,
          }),
      ),
    );
    try {
      await expect(
        api(path, "POST", {}, "synthetic-csrf"),
      ).rejects.toMatchObject({ status, code });
      expect(onExpiry).toHaveBeenCalledTimes(expired ? 1 : 0);
    } finally {
      window.removeEventListener("session-expired", onExpiry);
    }
  },
);
