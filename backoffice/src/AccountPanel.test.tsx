import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { AccountDialog } from "./AccountPanel";
import { api, type Session } from "./client";
import { setLanguage, t } from "./i18n";
vi.mock("./client", () => ({ api: vi.fn() }));
const mocked = vi.mocked(api);
const session: Session = {
  id: "synthetic",
  name: "Synthetic Name",
  email: "synthetic@example.test",
  username: "synthetic",
  role: "Customer",
  locale: "en",
  csrf: "synthetic-csrf",
};
const account = {
  id: session.id,
  allowance: 300,
  expires: null,
  projects: [{ id: "p1", name: "Assigned assistant" }],
  billingAvailable: false,
  usageAvailable: false,
};
beforeEach(() => {
  setLanguage("en");
  mocked.mockReset();
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
test.each(["en", "da"] as const)(
  "both roles can edit their own display name and see honest allowance information (%s)",
  async (language) => {
    setLanguage(language);
    const user = userEvent.setup(),
      updated = vi.fn();
    mocked.mockImplementation(async (path, method = "GET", body) => {
      if (path === "/account" && method === "GET") return account;
      if (path === "/account/profile" && method === "PUT")
        return { id: session.id, name: (body as { name: string }).name };
      throw new Error("Unexpected request");
    });
    for (const role of ["Admin", "Customer"] as const) {
      const rendered = render(
        <AccountDialog
          session={{ ...session, role }}
          onNameChange={updated}
          logout={vi.fn()}
          close={vi.fn()}
        />,
      );
      expect(await screen.findByText("300")).toBeVisible();
      expect(screen.getByText("Assigned assistant")).toBeVisible();
      expect(
        screen.getByText(
          t(
            "Dette er din tildelte ramme. Faktisk tokenforbrug og håndhævelse er endnu ikke aktiveret.",
          ),
        ),
      ).toBeVisible();
      await user.clear(screen.getByLabelText(t("Navn")));
      await user.type(screen.getByLabelText(t("Navn")), "New display name");
      await user.click(screen.getByRole("button", { name: t("Gem navn") }));
      await waitFor(() =>
        expect(updated).toHaveBeenCalledWith("New display name"),
      );
      expect(mocked).toHaveBeenCalledWith(
        "/account/profile",
        "PUT",
        { name: "New display name" },
        session.csrf,
      );
      expect(screen.getByRole("dialog")).toHaveAccessibleName(t("Min konto"));
      rendered.unmount();
    }
  },
);
test("failed loading has a retry, and closing discards a pending profile response", async () => {
  const user = userEvent.setup(),
    updated = vi.fn();
  let attempts = 0,
    resolveSave!: (value: unknown) => void;
  mocked.mockImplementation(async (path) => {
    if (path === "/account") {
      if (++attempts === 1) throw new Error("Try the connection again");
      return account;
    }
    return new Promise((resolve) => {
      resolveSave = resolve;
    });
  });
  const view = render(
    <AccountDialog
      session={session}
      onNameChange={updated}
      logout={vi.fn()}
      close={vi.fn()}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Try the connection again",
  );
  await user.click(screen.getByRole("button", { name: t("Prøv igen") }));
  expect(await screen.findByText("300")).toBeVisible();
  await user.click(screen.getByRole("button", { name: t("Gem navn") }));
  view.unmount();
  await act(async () => resolveSave({ id: session.id, name: "Late result" }));
  expect(updated).not.toHaveBeenCalled();
});
