import "./project-colors.css";
import type { CSSProperties } from "react";

export const projectColors = [
  { id: "black", label: "Sort" },
  { id: "yellow", label: "Gul" },
  { id: "purple", label: "Lilla" },
  { id: "green", label: "Grøn" },
] as const;
export type PresetColor = (typeof projectColors)[number]["id"];
export type ProjectColor = PresetColor | `#${string}`;
export function isCustomColor(value: unknown): value is `#${string}` {
  return (
    typeof value === "string" &&
    value.length === 7 &&
    /^#[0-9a-fA-F]{6}$/.test(value)
  );
}
export function projectColor(value: unknown): ProjectColor {
  if (isCustomColor(value)) return value.toLowerCase() as ProjectColor;
  return projectColors.find((color) => color.id === value)?.id || "black";
}
export function projectColorLabel(value: unknown): string {
  const color = projectColor(value);
  return projectColors.find((p) => p.id === color)?.label || "Brugerdefineret";
}
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (color: number[]) =>
  color
    .map((v) => {
      const n = v / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    })
    .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a: number[], b: number[]) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const hex = (color: number[]) =>
  "#" + color.map((n) => n.toString(16).padStart(2, "0")).join("");
const mix = (a: number[], b: number[], amount: number) =>
  a.map((n, i) => Math.round(n + (b[i] - n) * amount));
// Only validated six-digit hex and locally derived RGB values reach CSS properties.
export function projectColorStyle(value: unknown): CSSProperties | undefined {
  if (!isCustomColor(value)) return undefined;
  const bg = rgb(value),
    black = [0, 0, 0],
    white = [255, 255, 255];
  const fg = contrast(bg, black) >= contrast(bg, white) ? black : white;
  const opposite = fg === black ? white : black;
  const surface = (amount: number) => {
    const candidate = mix(bg, fg, amount);
    return hex(
      contrast(candidate, fg) >= 4.5 ? candidate : mix(bg, opposite, amount),
    );
  };
  return {
    "--cw-bg": value.toLowerCase(),
    "--cw-fg": hex(fg),
    "--cw-muted": hex(fg),
    "--cw-border": hex(fg),
    "--cw-control": surface(0.1),
    "--cw-hover": surface(0.2),
  } as CSSProperties;
}
