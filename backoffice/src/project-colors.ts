import "./project-colors.css";

export const projectColors = [
  { id: "black", label: "Sort" },
  { id: "yellow", label: "Gul" },
  { id: "purple", label: "Lilla" },
  { id: "green", label: "Grøn" },
] as const;
export type ProjectColor = (typeof projectColors)[number]["id"];
export function projectColor(value: unknown): ProjectColor {
  return projectColors.find((color) => color.id === value)?.id || "black";
}
