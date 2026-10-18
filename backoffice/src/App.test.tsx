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
import { TOTP, Secret } from "otpauth";

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

test.each([
  { role: "Admin", path: "/backoffice/", language: "en" },
  { role: "Admin", path: "/backoffice/", language: "da" },
  { role: "Admin", path: "/", language: "en" },
  { role: "Admin", path: "/", language: "da" },
  { role: "Customer", path: "/", language: "en" },
  { role: "Customer", path: "/", language: "da" },
] as const)(
  "refresh clears private content without mounting or focusing sign-in ($role $path $language)",
  async ({ role, path, language }) => {
    history.replaceState(null, "", path);
    setLanguage(language);
    mocked.mockImplementation(async (route) => {
      if (route === "/auth/session") return { ...session, role };
      if (route === "/customer/projects")
        return { projects: [], aiEnabled: false };
      return [];
    });
    render(<App />);
    await screen.findByRole("button", { name: t("Min konto") });
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    fireEvent(window, new Event("pagehide"));
    expect(screen.queryByRole("button", { name: t("Min konto") })).toBeNull();
    expect(screen.queryByText(session.name)).toBeNull();
    expect(screen.queryByLabelText(t("E-mail eller brugernavn"))).toBeNull();
    expect(screen.queryByLabelText(t("Adgangskode"))).toBeNull();
    expect(focus).not.toHaveBeenCalled();
  },
);

test.each(["/", "/backoffice/"])(
  "sign-in at %s keeps saved-password support without focusing credentials automatically",
  async (path) => {
    history.replaceState(null, "", path);
    mocked.mockRejectedValue(new ApiError(401, "Sign in required"));
    render(<App />);
    const email = await screen.findByLabelText(t("E-mail eller brugernavn"));
    const password = screen.getByLabelText(t("Adgangskode"));
    expect(email).not.toHaveFocus();
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    await userEvent.click(email);
    expect(email).toHaveFocus();
    await userEvent.tab();
    expect(password).toHaveFocus();
  },
);

test.each(["invitation", "owner"])(
  "%s enrollment displays the account's authenticator QR and still requires a confirmation code",
  async (flow) => {
    const secret = Secret.fromUTF8("synthetic-enrollment").base32;
    const uri = new TOTP({
      issuer: "AI Kundetypeassistent",
      label: "invited@example.test",
      secret,
    }).toString();
    history.replaceState(
      null,
      "",
      flow === "invitation"
        ? "/backoffice/#invite=synthetic-invite"
        : "/backoffice/?setup=1",
    );
    mocked.mockResolvedValue({
      name: "Synthetic Person",
      email: "invited@example.test",
      role: "Customer",
      secret,
      uri,
      csrf: "synthetic",
      identity: null,
    });
    render(<App />);
    if (flow === "invitation")
      await userEvent.click(
        screen.getByRole("button", { name: "Continue to registration" }),
      );
    expect(
      await screen.findByRole("img", {
        name: "QR code for two-factor sign-in · AI Kundetypeassistent · invited@example.test",
      }),
    ).toBeVisible();
    expect(screen.getByLabelText(t("Authenticator-kode"))).toBeRequired();
    expect(screen.getByText(secret)).not.toBeVisible();
    expect(mocked).not.toHaveBeenCalledWith(
      "/register/complete",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  },
);

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
  "Admins can assign and reopen a project's workspace colour (%s)",
  async (language) => {
    setLanguage(language);
    const project = {
      id: "synthetic-project",
      name: "Customer platform",
      description: "",
      connection_id: null,
      enabled: 1,
      color: "yellow",
    };
    mocked.mockImplementation(async (path, method = "GET", body) => {
      if (path === "/auth/session") return session;
      if (path === "/projects") return [project];
      if (path === "/projects/" + project.id && method === "PUT") {
        project.color = (body as { color: string }).color;
        return { id: project.id };
      }
      return [];
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: t("Projekter og prompter") }),
    );
    await user.click(screen.getByRole("button", { name: t("Redigér") }));
    expect(screen.getByRole("radio", { name: t("Gul") })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: t("Grøn") }));
    await user.click(screen.getByRole("button", { name: t("Gem ændringer") }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocked).toHaveBeenCalledWith(
      "/projects/" + project.id,
      "PUT",
      {
        name: project.name,
        description: "",
        connectionId: null,
        enabled: true,
        color: "green",
      },
      session.csrf,
    );
    await user.click(screen.getByRole("button", { name: t("Redigér") }));
    expect(screen.getByRole("radio", { name: t("Grøn") })).toBeChecked();
  },
);

test("the Admin account badge opens personal settings and the private workspace link is available", async () => {
  mocked.mockImplementation(async (path) => {
    if (path === "/auth/session") return session;
    if (path === "/account")
      return {
        id: session.id,
        allowance: 0,
        projects: [],
        expires: null,
        billingAvailable: false,
        usageAvailable: false,
      };
    return [];
  });
  render(<App />);
  await userEvent.click(
    await screen.findByRole("button", { name: "My account" }),
  );
  expect(screen.getByRole("dialog", { name: "My account" })).toBeVisible();
  expect(screen.getByLabelText("Name")).toHaveValue(session.name);
  expect(
    screen.getByRole("link", { name: "Open my workspace" }),
  ).toHaveAttribute("href", "/");
});
test.each(["en", "da"] as const)(
  "the usage page deep link connects reporting through the existing contextual MFA flow (%s)",
  async (language) => {
    setLanguage(language);
    history.replaceState(null, "", "/backoffice/?view=usage");
    let verified = false,
      connected = false;
    const writes: unknown[] = [];
    mocked.mockImplementation(async (path, method = "GET", body) => {
      if (path === "/auth/session") return session;
      if (path === "/usage")
        return {
          asOf: new Date().toISOString(),
          connection: connected
            ? {
                label: "Reports",
                suffix: "test",
                revision: 1,
                updatedAt: new Date().toISOString(),
              }
            : null,
          connectionRevision: connected ? 1 : 0,
          accounts: [],
          totalAllowance: 0,
          appTrackingEnabled: false,
        };
      if (path.startsWith("/usage/openai"))
        return {
          month: new Date().toISOString().slice(0, 7),
          connectionRevision: 1,
          fetchedAt: new Date().toISOString(),
          currency: "usd",
          totals: {
            costUsd: "0",
            inputTokens: 0,
            outputTokens: 0,
            requests: 0,
          },
          projects: [],
          days: [],
        };
      if (path === "/auth/reauth") {
        verified = true;
        return { ok: true };
      }
      if (path === "/usage/connection" && method === "POST") {
        writes.push(body);
        if (!verified) throw new ApiError(403, "Fresh code", "reauth_required");
        connected = true;
        return { ok: true };
      }
      return [];
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: t("Tilslut rapportering") }),
    );
    await user.type(
      screen.getByLabelText(t("Navn på rapporteringsforbindelsen")),
      "Reports",
    );
    await user.type(
      screen.getByLabelText(t("OpenAI Admin API-nøgle")),
      "sk-proj-synthetic-wrong-purpose-test-key",
    );
    await user.click(
      screen.getByRole("button", { name: t("Kontrollér og gem") }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      t(
        "Brug en OpenAI Admin API-nøgle til rapportering, ikke en projektnøgle.",
      ),
    );
    expect(writes).toHaveLength(0);
    await user.clear(screen.getByLabelText(t("OpenAI Admin API-nøgle")));
    await user.type(
      screen.getByLabelText(t("OpenAI Admin API-nøgle")),
      "sk-admin-synthetic-browser-test-key",
    );
    await user.click(
      screen.getByRole("button", { name: t("Kontrollér og gem") }),
    );
    await confirmCode(user, "123456");
    await screen.findByRole("button", { name: t("Afbryd rapportering") });
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(writes[1]);
    expect(writes[0]).toEqual({
      label: "Reports",
      apiKey: "sk-admin-synthetic-browser-test-key",
      revision: 0,
    });
    expect(screen.queryByLabelText(t("OpenAI Admin API-nøgle"))).toBeNull();
  },
);

test("an Admin at the root uses their own frontend without loading backoffice customer lists", async () => {
  history.replaceState(null, "", "/");
  mocked.mockImplementation(async (path) => {
    if (path === "/auth/session") return session;
    if (path === "/customer/projects")
      return { projects: [], aiEnabled: false };
    throw new Error("Unexpected backoffice request");
  });
  render(<App />);
  expect(
    await screen.findByRole("link", { name: "Open administration" }),
  ).toHaveAttribute("href", "/backoffice/");
  expect(mocked).not.toHaveBeenCalledWith("/customers");
  expect(screen.getByRole("button", { name: "My account" })).toBeVisible();
});

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
    const view = render(<App />);
    const { user } = await openConnection();
    fireEvent(window, new Event(event));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    if (event === "pagehide") {
      expect(screen.queryByLabelText(t("Adgangskode"))).toBeNull();
      view.unmount();
      render(<App />);
    } else {
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
    }
    await user.click(
      await screen.findByRole("button", { name: t("API-forbindelser") }),
    );
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
    if (event === "pagehide")
      expect(screen.queryByLabelText(t("Adgangskode"))).toBeNull();
    else
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

test.each(["en", "da"] as const)(
  "saving a connection opens prompt linking without asking for instructions (%s)",
  async (language) => {
    setLanguage(language);
    let created = false,
      linked = false;
    const project = {
      id: "synthetic-project",
      name: "Synthetic connection",
      description: "",
      connection_id: "synthetic-connection",
      enabled: 1,
    };
    mocked.mockImplementation(async (path, method = "GET") => {
      if (path === "/auth/session") return session;
      if (method === "GET") {
        if (path === "/projects") return created ? [project] : [];
        if (path === "/prompts")
          return linked
            ? [
                {
                  id: "synthetic-version",
                  project_id: project.id,
                  prompt_id: "synthetic-prompt",
                  name: project.name,
                  version: 1,
                  source_ref: "pmpt_synthetic",
                  checksum: "synthetic",
                  source_kind: "platform",
                  provider_prompt_id: "pmpt_synthetic",
                  version_policy: "default",
                },
              ]
            : [];
        return [];
      }
      if (path === "/connections") {
        created = true;
        return {
          id: "synthetic-connection",
          projectId: project.id,
          projectCreated: true,
        };
      }
      if (path === `/projects/${project.id}/prompts/link`) {
        linked = true;
        return {
          id: "synthetic-version",
          projectId: project.id,
          linked: true,
          created: true,
        };
      }
      throw new Error("Unexpected setup mutation");
    });
    render(<App />);
    const { user, dialog } = await openConnection();
    await user.click(
      within(dialog).getByRole("button", { name: t("Kontrollér og gem") }),
    );
    const linker = await screen.findByRole("dialog", {
      name: t("Tilknyt OpenAI-prompt"),
    });
    expect(screen.queryByLabelText(t("API-nøgle"))).not.toBeInTheDocument();
    expect(screen.queryByLabelText(t("Instruktioner"))).not.toBeInTheDocument();
    expect(within(linker).getByLabelText(t("Navn"))).toHaveValue(project.name);
    await user.type(
      within(linker).getByLabelText(t("OpenAI-prompt-ID")),
      "pmpt_synthetic",
    );
    await user.click(
      within(linker).getByRole("button", { name: t("Tilknyt prompt") }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const edit = screen.getByRole("link", { name: t("Redigér i OpenAI") });
    expect(edit).toHaveAttribute("href", "https://platform.openai.com");
    expect(
      screen.queryByRole("button", { name: t("Se / ny version") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t("Importér prompter") }),
    ).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: t("Sprog") }),
      language === "en" ? "da" : "en",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      t("Prompten er tilknyttet. Foretag ændringer i OpenAI Platform."),
    );
    expect(
      mocked.mock.calls.filter(
        ([path, method]) => path === "/connections" && method === "POST",
      ),
    ).toHaveLength(1);
    expect(
      mocked.mock.calls.filter(([path]) => path.endsWith("/prompts/link")),
    ).toEqual([
      [
        `/projects/${project.id}/prompts/link`,
        "POST",
        { name: project.name, providerPromptId: "pmpt_synthetic" },
        session.csrf,
      ],
    ]);
  },
);
