import { useSyncExternalStore } from "react";
import { translate } from "../server/messages.mjs";
export type Language = "en" | "da";
let language: Language = navigator.language.startsWith("da") ? "da" : "en";
try {
  const saved = localStorage.getItem("bo-language");
  if (saved === "en" || saved === "da") language = saved;
} catch {
  /* storage may be unavailable */
}
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export function setLanguage(value: Language) {
  language = value;
  document.documentElement.lang = value;
  try {
    localStorage.setItem("bo-language", value);
  } catch {
    /* preference only */
  }
  listeners.forEach((fn) => fn());
}
document.documentElement.lang = language;
export const t = (message: string) => translate(message, language);
export function useLanguage() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, getLanguage);
}
export function LanguagePicker() {
  const value = useLanguage();
  return (
    <label className="language-picker">
      <span>{t("Sprog")}</span>
      <select
        aria-label={t("Sprog")}
        value={value}
        onChange={(e) => setLanguage(e.target.value as Language)}
      >
        <option value="en">English</option>
        <option value="da">Dansk</option>
      </select>
    </label>
  );
}
