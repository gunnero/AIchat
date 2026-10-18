import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ProjectColorPicker } from "./ProjectColorPicker";
import { projectColor, projectColorStyle } from "./project-colors";
import { setLanguage, t } from "./i18n";

afterEach(cleanup);
test.each(["en", "da"] as const)(
  "custom colours can be picked, typed, validated and switched back to presets (%s)",
  async (language) => {
    setLanguage(language);
    const user = userEvent.setup();
    const { container } = render(
      <form>
        <ProjectColorPicker initial="#f08a24" />
      </form>,
    );
    expect(
      screen.getByRole("radio", { name: t("Brugerdefineret farve") }),
    ).toBeChecked();
    const input = screen.getByLabelText(t("Hex-farvekode")) as HTMLInputElement;
    expect(input.value).toBe("#f08a24");
    fireEvent.change(screen.getByLabelText(t("Vælg farve")), {
      target: { value: "#102030" },
    });
    expect(input.value).toBe("#102030");
    await user.clear(input);
    await user.type(input, "#ABCDEF");
    expect(input.checkValidity()).toBe(true);
    expect(new FormData(container.querySelector("form")!).get("color")).toBe(
      "#ABCDEF",
    );
    await user.clear(input);
    await user.type(input, "#abc");
    expect(input.checkValidity()).toBe(false);
    expect(
      container
        .querySelector<HTMLElement>(".project-custom-preview")!
        .style.getPropertyValue("--cw-bg"),
    ).toBe("#3b82f6");
    await user.click(screen.getByRole("radio", { name: t("Grøn") }));
    expect(container.querySelector("form")!.checkValidity()).toBe(true);
    expect(new FormData(container.querySelector("form")!).get("color")).toBe(
      "green",
    );
  },
);

const rgb = (s: string) =>
  [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const luminance = (s: string) =>
  rgb(s)
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
test("derived text contrast meets 4.5:1 on backgrounds, controls and hover surfaces; arbitrary CSS never reaches the style map", () => {
  for (const value of [
    "red",
    "#fff",
    "#abcdef\n",
    "#abcdef;background:url(evil)",
    "url(evil)",
    null,
  ]) {
    expect(projectColor(value)).toBe("black");
    expect(projectColorStyle(value)).toEqual(projectColorStyle("black"));
  }
  for (const r of [0, 51, 102, 153, 204, 255])
    for (const g of [0, 51, 102, 153, 204, 255])
      for (const b of [0, 51, 102, 153, 204, 255]) {
        const hex =
          "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
        const style = projectColorStyle(hex) as Record<string, string>;
        for (const surface of ["--cw-bg", "--cw-control", "--cw-hover"])
          for (const text of ["--cw-fg", "--cw-muted"]) {
            const x = luminance(style[surface]),
              y = luminance(style[text]);
            expect(
              (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05),
            ).toBeGreaterThanOrEqual(4.5);
          }
        for (const surface of [
          "#ffffff",
          style["--cw-tint"],
          style["--cw-tint-hover"],
        ])
          for (const ink of [style["--cw-ink"], style["--cw-ink-hover"]]) {
            const x = luminance(surface),
              y = luminance(ink);
            expect(
              (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05),
            ).toBeGreaterThanOrEqual(4.5);
          }
      }
});
test("all preset projects provide matching readable accents for content controls and links", () => {
  for (const color of ["black", "yellow", "purple", "green"]) {
    const style = projectColorStyle(color) as Record<string, string>;
    expect(style["--cw-bg"]).toBeUndefined();
    expect(style["--cw-ink"]).toMatch(/^#[a-f0-9]{6}$/);
    for (const surface of [
      "#ffffff",
      style["--cw-tint"],
      style["--cw-tint-hover"],
    ]) {
      const x = luminance(surface),
        y = luminance(style["--cw-ink"]);
      expect(
        (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});
