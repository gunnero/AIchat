import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { App } from "./main";
import { api, ApiError, type Session } from "./client";
import { setLanguage, t } from "./i18n";

vi.mock("./client", async (original) => ({
  ...(await original<typeof import("./client")>()),
  api: vi.fn(),
}));
const mocked = vi.mocked(api);
const session: Session = {
  id: "synthetic-admin",
  name: "Synthetic Admin",
  email: "admin@example.test",
  username: "synthetic-admin",
  locale: "en",
  role: "Admin",
  csrf: "synthetic-csrf",
};
const syntheticKey = "sk-proj-synthetic-form-test-never-sent";

beforeEach(() => {
  history.replaceState(null, "", "/backoffice/");
  setLanguage("en");
  mocked.mockReset();
  mocked.mockImplementation(async (path, method = "GET") => {
    if (path === "/auth/session" || path === "/auth/login") return session;
    if (method === "GET") return [];
    throw new Error("Unexpected mutation in dialog test");
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openConnection() {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: t("API-forbindelser") }),
  );
  await user.click(
    screen.getByRole("button", { name: t("Tilføj forbindelse") }),
  );
  const dialog = screen.getByRole("dialog", {
    name: t("Tilføj API-forbindelse"),
  });
  await user.type(
    within(dialog).getByLabelText(t("Navn på forbindelsen")),
    "Synthetic connection",
  );
  await user.type(
    within(dialog).getByLabelText(t("OpenAI-projekt-ID")),
    "proj_synthetic",
  );
  await user.selectOptions(
    within(dialog).getByLabelText(t("Miljø")),
    "production",
  );
  await user.type(within(dialog).getByLabelText(t("API-nøgle")), syntheticKey);
  return { user, dialog };
}

test.each(["en", "da"] as const)(
  "switching browser tabs preserves the connection dialog and its unsaved fields (%s)",
  async (language) => {
    setLanguage(language);
    render(<App />);
    const { user, dialog } = await openConnection();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    for (const state of ["hidden", "visible", "hidden", "visible"] as const) {
      visibility.mockReturnValue(state);
      fireEvent(document, new Event("visibilitychange"));
      expect(screen.getByRole("dialog")).toBe(dialog);
    }
    expect(
      within(dialog).getByLabelText(t("Navn på forbindelsen")),
    ).toHaveValue("Synthetic connection");
    expect(within(dialog).getByLabelText(t("OpenAI-projekt-ID"))).toHaveValue(
      "proj_synthetic",
    );
    expect(within(dialog).getByLabelText(t("Miljø"))).toHaveValue("production");
    expect(within(dialog).getByLabelText(t("API-nøgle"))).toHaveValue(
      syntheticKey,
    );
    expect(
      mocked.mock.calls.every(([, method = "GET"]) => method === "GET"),
    ).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: t("Luk") }));
    await user.click(
      screen.getByRole("button", { name: t("Tilføj forbindelse") }),
    );
    expect(screen.getByLabelText(t("Navn på forbindelsen"))).toHaveValue("");
    expect(screen.getByLabelText(t("API-nøgle"))).toHaveValue("");
  },
);

test.each(["session-expired", "pagehide"])(
  "%s still clears the dialog and its unsaved key before another sign-in",
  async (event) => {
    render(<App />);
    const { user } = await openConnection();
    fireEvent(window, new Event(event));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: t("Log ind") }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByLabelText(t("E-mail eller brugernavn")),
      "admin@example.test",
    );
    await user.type(
      screen.getByLabelText(t("Adgangskode")),
      "synthetic-password",
    );
    await user.type(screen.getByLabelText(t("Authenticator-kode")), "123456");
    await user.click(screen.getByRole("button", { name: t("Log ind") }));
    await user.click(
      await screen.findByRole("button", { name: t("Tilføj forbindelse") }),
    );
    expect(screen.getByLabelText(t("API-nøgle"))).toHaveValue("");
    expect(screen.getByLabelText(t("Navn på forbindelsen"))).toHaveValue("");
  },
);

function protectedSave(
  verify: (code: string) => Promise<void> = async () => {},
) {
  let verified = false;
  const writes: unknown[] = [];
  mocked.mockImplementation(async (path, method = "GET", body) => {
    if (path === "/auth/session" || path === "/auth/login") return session;
    if (method === "GET") return [];
    if (path === "/auth/reauth") {
      await verify((body as { code: string }).code);
      verified = true;
      return { ok: true };
    }
    if (path === "/connections" && method === "POST") {
      writes.push(body);
      if (!verified)
        throw new ApiError(403, "Fresh code needed", "reauth_required");
      return { id: "synthetic-connection" };
    }
    throw new Error("Unexpected dialog request");
  });
  return writes;
}
const securityDialog = () =>
  screen.findByRole("dialog", { name: t("Bekræft ændringen") });
async function submitConnection(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
) {
  await user.click(
    within(dialog).getByRole("button", { name: t("Kontrollér og gem") }),
  );
}
async function confirmCode(
  user: ReturnType<typeof userEvent.setup>,
  code: string,
) {
  const dialog = await securityDialog();
  await user.type(within(dialog).getByLabelText(t("Sikkerhedskode")), code);
  await user.click(
    within(dialog).getByRole("button", { name: t("Bekræft og fortsæt") }),
  );
}

test.each(["en", "da"] as const)(
  "protected saves ask for a code in context and continue the same change after a valid code (%s)",
  async (language) => {
    setLanguage(language);
    const writes = protectedSave(async (code) => {
      if (code !== "222222")
        throw new ApiError(
          401,
          "Brug en ny kode fra din authenticator.",
          "invalid_otp",
        );
    });
    render(<App />);
    const { user, dialog } = await openConnection();
    expect(
      screen.queryByRole("button", { name: t("Bekræft adgang") }),
    ).not.toBeInTheDocument();
    await submitConnection(user, dialog);
    const security = await securityDialog();
    expect(
      within(security).getByText(
        t("Dine indtastninger er bevaret, mens du gør dette."),
      ),
    ).toBeInTheDocument();
    expect(within(security).getByLabelText(t("Sikkerhedskode"))).toHaveFocus();
    expect(security).toBe(dialog);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await confirmCode(user, "111111");
    expect(await within(security).findByRole("alert")).toHaveTextContent(
      t("Brug en ny kode fra din authenticator."),
    );
    expect(writes).toHaveLength(1);
    expect(within(dialog).getByLabelText(t("API-nøgle"))).toHaveValue(
      syntheticKey,
    );
    expect(within(security).getByLabelText(t("Sikkerhedskode"))).toHaveValue(
      "",
    );
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(await securityDialog()).toBe(security);
    await confirmCode(user, "222222");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
    expect(
      mocked.mock.calls.filter(([path]) => path === "/auth/reauth"),
    ).toHaveLength(2);
  },
);

test("a save with recent verification needs no extra step, and other forbidden errors do not start verification", async () => {
  let forbidden = false;
  mocked.mockImplementation(async (path, method = "GET") => {
    if (path === "/auth/session") return session;
    if (method === "GET") return [];
    if (path === "/connections" && !forbidden)
      return { id: "synthetic-connection" };
    throw new ApiError(403, "Access denied");
  });
  render(<App />);
  let form = await openConnection();
  await submitConnection(form.user, form.dialog);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  forbidden = true;
  form = await openConnection();
  await submitConnection(form.user, form.dialog);
  expect(await within(form.dialog).findByRole("alert")).toHaveTextContent(
    "Access denied",
  );
  expect(
    screen.queryByRole("dialog", { name: t("Bekræft ændringen") }),
  ).not.toBeInTheDocument();
  expect(mocked.mock.calls.some(([path]) => path === "/auth/reauth")).toBe(
    false,
  );
});

test("back keeps the form and a late verification response cannot replay a cancelled change", async () => {
  let finish!: () => void;
  const response = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const writes = protectedSave(() => response);
  render(<App />);
  const { user, dialog } = await openConnection();
  await submitConnection(user, dialog);
  const security = await securityDialog();
  await confirmCode(user, "222222");
  await user.click(
    within(security).getByRole("button", { name: t("Tilbage") }),
  );
  expect(
    screen.queryByRole("dialog", { name: t("Bekræft ændringen") }),
  ).not.toBeInTheDocument();
  expect(within(dialog).getByLabelText(t("API-nøgle"))).toHaveValue(
    syntheticKey,
  );
  expect(within(dialog).getByLabelText(t("Navn på forbindelsen"))).toHaveValue(
    "Synthetic connection",
  );
  await act(async () => {
    finish();
    await response;
  });
  expect(writes).toHaveLength(1);
  expect(dialog).toBeInTheDocument();
  expect(
    within(dialog).getByRole("button", { name: t("Kontrollér og gem") }),
  ).toBeEnabled();
});

test.each(["session-expired", "pagehide"])(
  "%s while checking a code cancels pending changes and ignores the late response",
  async (event) => {
    let finish!: () => void;
    const response = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const writes = protectedSave(() => response);
    render(<App />);
    const { user, dialog } = await openConnection();
    await submitConnection(user, dialog);
    await confirmCode(user, "222222");
    fireEvent(window, new Event(event));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: t("Log ind") }),
    ).toBeInTheDocument();
    await act(async () => {
      finish();
      await response;
    });
    expect(writes).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  },
);

test("table actions use the same confirmation and resume once without needing an open form", async () => {
  let verified = false,
    attempts = 0;
  const connection = {
    id: "synthetic-connection",
    label: "Synthetic",
    enabled: 1,
    project_ref: "proj_synthetic",
    suffix: "test",
    revision: 1,
    status: "ok",
    last_checked: null,
  };
  mocked.mockImplementation(async (path, method = "GET") => {
    if (path === "/auth/session") return session;
    if (path === "/connections" && method === "GET") return [connection];
    if (method === "GET") return [];
    if (path === "/auth/reauth") {
      verified = true;
      return { ok: true };
    }
    if (path === "/connections/" + connection.id && method === "PUT") {
      attempts++;
      if (!verified)
        throw new ApiError(403, "Fresh code needed", "reauth_required");
      connection.enabled = 0;
      return { ok: true };
    }
    throw new Error("Unexpected table action");
  });
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    await screen.findByRole("button", { name: t("API-forbindelser") }),
  );
  await user.click(
    await screen.findByRole("button", { name: t("Sæt på pause") }),
  );
  await confirmCode(user, "222222");
  await screen.findByRole("button", { name: t("Aktivér") });
  expect(attempts).toBe(2);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("an expired session during code verification returns to sign-in and never resumes the saved request", async () => {
  const writes = protectedSave(async () => {
    throw new ApiError(401, "Log ind for at fortsætte.");
  });
  render(<App />);
  const { user, dialog } = await openConnection();
  await submitConnection(user, dialog);
  await confirmCode(user, "222222");
  await screen.findByRole("button", { name: t("Log ind") });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(writes).toHaveLength(1);
});

test.each(["en", "da"] as const)(
  "connection setup explains incorrect project IDs beside the field, keeps entries and accepts a corrected ID (%s)",
  async (language) => {
    setLanguage(language);
    const saved: unknown[] = [];
    mocked.mockImplementation(async (path, method = "GET", body) => {
      if (path === "/auth/session") return session;
      if (method === "GET") return [];
      if (path === "/connections" && method === "POST") {
        saved.push(body);
        return { id: "synthetic-connection" };
      }
      throw new Error("Unexpected project-ID test request");
    });
    render(<App />);
    const { user, dialog } = await openConnection();
    const project = within(dialog).getByLabelText(t("OpenAI-projekt-ID"));
    const pattern = new RegExp(
      "^(?:" + project.getAttribute("pattern") + ")$",
      "v",
    );
    expect(pattern.test("proj_valid-id_123")).toBe(true);
    expect(pattern.test("key_synthetic")).toBe(false);
    for (const value of [
      "key_synthetic",
      "sk-proj-synthetic-not-a-project",
      "proj_",
    ]) {
      await user.clear(project);
      await user.type(project, value);
      await submitConnection(user, dialog);
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        t(
          value.startsWith("key_")
            ? "Dette er et nøgle-ID. Indsæt projektets ID, som starter med proj_."
            : "Indsæt projektets ID fra OpenAI. Det starter med proj_.",
        ),
      );
      expect(project).toHaveFocus();
      expect(project).toHaveAttribute("aria-invalid", "true");
      expect(within(dialog).getByLabelText(t("API-nøgle"))).toHaveValue(
        syntheticKey,
      );
      expect(
        within(dialog).getByLabelText(t("Navn på forbindelsen")),
      ).toHaveValue("Synthetic connection");
      expect(saved).toHaveLength(0);
      expect(
        mocked.mock.calls.every(([, method = "GET"]) => method === "GET"),
      ).toBe(true);
    }
    const link = within(dialog).getByRole("link", {
      name: t("Åbn OpenAI-indstillinger"),
    });
    expect(link).toHaveAttribute(
      "href",
      "https://platform.openai.com/settings/organization/general",
    );
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await user.clear(project);
    await user.type(project, "  proj_valid-id_123  ");
    await submitConnection(user, dialog);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(saved).toEqual([
      {
        label: "Synthetic connection",
        projectRef: "proj_valid-id_123",
        environment: "production",
        apiKey: syntheticKey,
      },
    ]);
  },
);
