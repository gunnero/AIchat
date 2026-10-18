import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { App } from "./main";
import { api, type Session } from "./client";
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
