import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import jsQR from "jsqr";
import { TOTP, Secret } from "otpauth";
import { AuthenticatorSetup } from "./AuthenticatorSetup";
import { setLanguage, t } from "./i18n";

// Synthetic enrollment only. Decode the rendered SVG with an independent reader.
const secret = Secret.fromUTF8("synthetic-qr-test-only").base32;
const provisioning = (email: string) =>
  new TOTP({
    issuer: "AI Kundetypeassistent",
    label: email,
    secret,
  }).toString();
function readQr(svg: Element) {
  const modules = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
  const scale = 5,
    margin = 5;
  const size = (modules + margin * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  const dark = svg.querySelector('path[fill="#000000"]')!.getAttribute("d")!;
  const cells = [...dark.matchAll(/M (\d+) (\d+) l 1 0 0 1 -1 0 Z/g)];
  expect(cells.length).toBeGreaterThan(0);
  for (const [, x, y] of cells)
    for (let dy = 0; dy < scale; dy++)
      for (let dx = 0; dx < scale; dx++) {
        const offset =
          (((Number(y) + margin) * scale + dy) * size +
            (Number(x) + margin) * scale +
            dx) *
          4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
      }
  return jsQR(pixels, size, size)?.data;
}
afterEach(cleanup);

test.each(["en", "da"] as const)(
  "QR scans to the exact enrollment URI and clearly identifies the application and account (%s)",
  (language) => {
    setLanguage(language);
    const email = "customer+private@example.test",
      uri = provisioning(email);
    const { container } = render(
      <AuthenticatorSetup uri={uri} secret={secret} />,
    );
    const qr = screen.getByRole("img", {
      name: `${t("QR-kode til totrinslogin")} · AI Kundetypeassistent · ${email}`,
    });
    expect(readQr(qr)).toBe(uri);
    expect(
      screen.getByText("AI Kundetypeassistent", { selector: "strong" }),
    ).toBeVisible();
    expect(screen.getByText(email)).toBeVisible();
    expect(screen.getByText(secret)).not.toBeVisible();
    const manual = container.querySelector("details")!;
    fireEvent.click(manual.querySelector("summary")!);
    expect(manual.open).toBe(true);
    expect(screen.getByText(secret)).toBeVisible();
    expect(
      container.querySelector("img,canvas,a,[src],[data-secret]"),
    ).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.getItem("bo-language")).toBe(language);
  },
);

test("a long account label still scans and language switching keeps the same enrolled identity", () => {
  setLanguage("en");
  const email = `${"customer".repeat(8)}+label@example.test`,
    uri = provisioning(email);
  const { rerender } = render(<AuthenticatorSetup uri={uri} secret={secret} />);
  expect(readQr(screen.getByRole("img"))).toBe(uri);
  setLanguage("da");
  rerender(<AuthenticatorSetup uri={uri} secret={secret} />);
  expect(
    screen.getByRole("heading", { name: "Opsæt totrinslogin" }),
  ).toBeVisible();
  expect(readQr(screen.getByRole("img"))).toBe(uri);
});

test.each([
  "",
  "https://external.example.test/qr",
  provisioning("other@example.test").replace("secret=", "secret=OTHER"),
])(
  "invalid or mismatched provisioning data keeps the manual fallback without rendering an unrelated QR",
  (uri) => {
    setLanguage("en");
    render(<AuthenticatorSetup uri={uri} secret={secret} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getByText(
        "The QR code could not be displayed. Use the setup key below.",
      ),
    ).toBeVisible();
    expect(screen.getByText(secret)).not.toBeVisible();
  },
);
