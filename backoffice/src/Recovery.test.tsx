import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import Recovery from "./Recovery";
import { RecoveryCodes } from "./RecoveryCodes";
import { api, type Session } from "./client";
import { setLanguage, t } from "./i18n";
vi.mock("./client", () => ({ api: vi.fn() }));
const mock = vi.mocked(api),
  codes = Array.from({ length: 10 }, (_, i) => "SYNTHETIC-ONE-USE-CODE-" + i);
const session: Session = {
  id: "synthetic",
  name: "Synthetic",
  email: "synthetic@example.test",
  username: "synthetic",
  role: "Admin",
  locale: "en",
  csrf: "own-csrf",
};
beforeEach(() => {
  mock.mockReset();
  setLanguage("en");
  history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
for (const lang of ["en", "da"] as const) {
  test(
    "generic recovery email request and error retry (" + lang + ")",
    async () => {
      setLanguage(lang);
      const user = userEvent.setup(),
        close = vi.fn();
      mock
        .mockRejectedValueOnce(Error("Connection unavailable"))
        .mockResolvedValueOnce({});
      render(<Recovery onClose={close} />);
      await user.type(
        screen.getByLabelText(t("E-mail")),
        "synthetic@example.test",
      );
      await user.click(
        screen.getByRole("button", { name: t("Send gendannelseslink") }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Connection unavailable",
      );
      await user.click(
        screen.getByRole("button", { name: t("Send gendannelseslink") }),
      );
      expect(await screen.findByRole("status")).toHaveTextContent(
        t(
          "Hvis kontoen kan gendannes, modtager du en e-mail med et link. Tjek også spam. Linket udløber efter 30 minutter.",
        ),
      );
      expect(mock).toHaveBeenLastCalledWith("/auth/recovery/request", "POST", {
        email: "synthetic@example.test",
        locale: lang,
      });
    },
  );
  test(
    "password recovery requires restricted CSRF and password confirmation (" +
      lang +
      ")",
    async () => {
      setLanguage(lang);
      const user = userEvent.setup();
      mock
        .mockResolvedValueOnce({ csrf: "restricted-csrf" })
        .mockResolvedValueOnce({ ok: true });
      render(<Recovery token={"x".repeat(43)} onClose={vi.fn()} />);
      await user.click(screen.getByRole("button", { name: t("Fortsæt") }));
      await user.type(
        await screen.findByLabelText(t("Ny adgangskode · mindst 14 tegn")),
        "New synthetic password 2026!",
      );
      await user.type(
        screen.getByLabelText(t("Gentag ny adgangskode")),
        "Different synthetic password!",
      );
      await user.type(
        screen.getByLabelText(t("Ny authenticator-kode")),
        "123456",
      );
      await user.click(
        screen.getByRole("button", { name: t("Gem ny adgangskode") }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        t("Adgangskoderne er ikke ens."),
      );
      expect(mock).toHaveBeenCalledTimes(1);
      await user.clear(screen.getByLabelText(t("Gentag ny adgangskode")));
      await user.type(
        screen.getByLabelText(t("Gentag ny adgangskode")),
        "New synthetic password 2026!",
      );
      await user.click(
        screen.getByRole("button", { name: t("Gem ny adgangskode") }),
      );
      expect(await screen.findByRole("status")).toHaveTextContent(
        t(
          "Din konto er gendannet. Alle tidligere login er afsluttet. Log ind med din adgangskode og en ny authenticator-kode.",
        ),
      );
      expect(mock).toHaveBeenLastCalledWith(
        "/auth/recovery/password",
        "POST",
        { newPassword: "New synthetic password 2026!", code: "123456" },
        "restricted-csrf",
      );
    },
  );
  test(
    "lost phone enrollment shows clearly labelled QR and codes once (" +
      lang +
      ")",
    async () => {
      setLanguage(lang);
      const user = userEvent.setup();
      const secret = "SYNTHETICKEY";
      const uri =
        "otpauth://totp/AI%20Kundetypeassistent:synthetic%40example.test?issuer=AI%20Kundetypeassistent&secret=" +
        secret;
      mock
        .mockResolvedValueOnce({ csrf: "restricted" })
        .mockResolvedValueOnce({ secret, uri })
        .mockResolvedValueOnce({ codes });
      render(<Recovery token={"x".repeat(43)} onClose={vi.fn()} />);
      await user.click(screen.getByRole("button", { name: t("Fortsæt") }));
      await user.click(
        await screen.findByRole("button", {
          name: t("Jeg har mistet min authenticator"),
        }),
      );
      await user.type(
        screen.getByLabelText(t("Nuværende adgangskode")),
        "Synthetic password",
      );
      await user.type(
        screen.getByLabelText(t("Gendannelseskode")),
        "SYNTHETIC-SAVED-CODE",
      );
      await user.click(
        screen.getByRole("button", { name: t("Bekræft og fortsæt") }),
      );
      expect(await screen.findByRole("img")).toHaveAccessibleName(
        /AI Kundetypeassistent.*synthetic@example.test/,
      );
      await user.type(
        screen.getByLabelText(t("Ny adgangskode · mindst 14 tegn")),
        "New synthetic password 2026!",
      );
      await user.type(
        screen.getByLabelText(t("Gentag ny adgangskode")),
        "New synthetic password 2026!",
      );
      await user.type(
        screen.getByLabelText(t("Ny authenticator-kode")),
        "123456",
      );
      await user.click(
        screen.getByRole("button", { name: t("Fuldfør gendannelse") }),
      );
      expect(await screen.findByText(codes[0])).toBeVisible();
      expect(screen.getByRole("button", { name: t("Fortsæt") })).toBeDisabled();
      await user.click(
        screen.getByLabelText(t("Jeg har gemt koderne et sikkert sted.")),
      );
      await user.click(screen.getByRole("button", { name: t("Fortsæt") }));
      expect(screen.queryByText(codes[0])).not.toBeInTheDocument();
    },
  );
}
test("expired links stay public and late responses cannot resurrect a closed recovery screen", async () => {
  const user = userEvent.setup();
  let resolve!: (v: unknown) => void;
  mock.mockRejectedValueOnce(Error("Expired link"));
  const view = render(<Recovery token={"x".repeat(43)} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: t("Fortsæt") }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Expired link");
  view.unmount();
  mock.mockImplementation(() => new Promise((r) => (resolve = r)));
  const second = render(<Recovery token={"x".repeat(43)} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: t("Fortsæt") }));
  second.unmount();
  await act(async () => resolve({ csrf: "late" }));
  expect(
    screen.queryByLabelText(t("Ny authenticator-kode")),
  ).not.toBeInTheDocument();
});
test("existing Admin and Customer accounts generate codes only after explicit fresh proof and discard them when closed", async () => {
  const user = userEvent.setup();
  for (const role of ["Admin", "Customer"] as const) {
    mock
      .mockResolvedValueOnce({ remaining: 0 })
      .mockResolvedValueOnce({ codes });
    const view = render(<RecoveryCodes session={{ ...session, role }} />);
    expect(mock).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: t("Opret nye gendannelseskoder") }),
    );
    expect(
      await screen.findByText(
        t("Du har ingen gendannelseskoder. Opret og gem et sæt nu."),
      ),
    ).toBeVisible();
    await user.type(
      screen.getByLabelText(t("Nuværende adgangskode")),
      "Synthetic password",
    );
    await user.type(
      screen.getByLabelText(t("Ny authenticator-kode")),
      "123456",
    );
    await user.click(screen.getByRole("button", { name: t("Opret koder") }));
    expect(await screen.findByText(codes[0])).toBeVisible();
    await waitFor(() =>
      expect(mock).toHaveBeenLastCalledWith(
        "/auth/codes",
        "POST",
        { password: "Synthetic password", code: "123456" },
        session.csrf,
      ),
    );
    view.unmount();
    expect(screen.queryByText(codes[0])).not.toBeInTheDocument();
    mock.mockReset();
  }
});
