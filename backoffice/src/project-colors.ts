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
export function projectColorStyle(value: unknown): CSSProperties {
  const color = projectColor(value);
  const background = isCustomColor(color)
    ? color
    : {
        black: "#000000",
        yellow: "#f8dc69",
        purple: "#633b88",
        green: "#275a40",
      }[color];
  const bg = rgb(background),
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
  const tint = mix(bg, white, 0.94),
    tintHover = mix(bg, white, 0.88);
  // Links, outlines and focus rings must remain readable on white and tints.
  let low = 0,
    high = 1;
  if (contrast(bg, tintHover) >= 4.5) high = 0;
  else
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (contrast(mix(bg, black, mid), tintHover) >= 4.5) high = mid;
      else low = mid;
    }
  const ink = mix(bg, black, high);
  return {
    "--cw-ink": hex(ink),
    "--cw-ink-hover": hex(mix(ink, black, 0.2)),
    "--cw-tint": hex(tint),
    "--cw-tint-hover": hex(tintHover),
    ...(isCustomColor(color)
      ? {
          "--cw-bg": background,
          "--cw-fg": hex(fg),
          "--cw-muted": hex(fg),
          "--cw-border": hex(fg),
          "--cw-control": surface(0.1),
          "--cw-hover": surface(0.2),
        }
      : {}),
  } as CSSProperties;
}
