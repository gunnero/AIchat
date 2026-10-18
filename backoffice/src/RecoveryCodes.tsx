import { useEffect, useRef, useState } from "react";
import { api, type Session } from "./client";
import { t } from "./i18n";
export function CodeSheet({
  codes,
  done,
}: {
  codes: string[];
  done: () => void;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <section
      className="recovery-sheet"
      aria-label={t("Dine gendannelseskoder")}
    >
      <h2>{t("Gem dine gendannelseskoder")}</h2>
      <p>
        {t(
          "Hver kode kan bruges én gang. Gem dem i din adgangskodeboks eller et sikkert sted væk fra din telefon. De vises kun nu.",
        )}
      </p>
      <ol className="recovery-code-list">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ol>
      <button
        className="button secondary"
        type="button"
        onClick={() => {
          const file = new Blob(
            [
              "AI Kundetypeassistent\n" +
                t("Dine gendannelseskoder") +
                "\n\n" +
                codes.join("\n") +
                "\n",
            ],
            { type: "text/plain;charset=utf-8" },
          );
          const url = URL.createObjectURL(file);
          const link = document.createElement("a");
          link.href = url;
          link.download = "kundetypeassistent-recovery-codes.txt";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        {t("Download koder")}
      </button>
      <label className="recovery-saved">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        {t("Jeg har gemt koderne et sikkert sted.")}
      </label>
      <button
        className="button primary"
        type="button"
        disabled={!saved}
        onClick={done}
      >
        {t("Fortsæt")}
      </button>
    </section>
  );
}
export function RecoveryCodes({ session }: { session: Session }) {
  const [remaining, setRemaining] = useState<number | null>(null),
    [codes, setCodes] = useState<string[] | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    let current = true;
    api<{ remaining: number }>("/auth/codes")
      .then((v) => {
        if (active.current && current) setRemaining(v.remaining);
      })
      .catch((e) => {
        if (active.current && current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [open]);
  if (codes)
    return (
      <CodeSheet
        codes={codes}
        done={() => {
          setCodes(null);
          setOpen(false);
        }}
      />
    );
  return (
    <section className="account-password">
      <h4>{t("Gendannelseskoder")}</h4>
      <p>
        {t("Brug en gemt kode, hvis du mister adgangen til din authenticator.")}
      </p>
      {remaining !== null && (
        <p>
          {t("Ubrugte koder")}: <strong>{remaining}</strong>
        </p>
      )}
      {remaining === 0 && (
        <p className="notice">
          {t("Du har ingen gendannelseskoder. Opret og gem et sæt nu.")}
        </p>
      )}
      <button
        type="button"
        className="button secondary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {t("Opret nye gendannelseskoder")}
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = Object.fromEntries(new FormData(form));
            setBusy(true);
            setError("");
            try {
              const v = await api<{ codes: string[] }>(
                "/auth/codes",
                "POST",
                data,
                session.csrf,
              );
              if (active.current) {
                form.reset();
                setCodes(v.codes);
                setRemaining(v.codes.length);
              }
            } catch (e) {
              if (active.current) setError((e as Error).message);
            } finally {
              if (active.current) setBusy(false);
            }
          }}
        >
          <p>
            {t(
              "Nye koder erstatter alle dine gamle koder og afbryder igangværende gendannelse.",
            )}
          </p>
          <label>
            {t("Nuværende adgangskode")}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={256}
              required
            />
          </label>
          <label>
            {t("Ny authenticator-kode")}
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </label>
          <button className="button primary" disabled={busy}>
            {t(busy ? "Gemmer…" : "Opret koder")}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="alert">
          {t(error)}
        </p>
      )}
    </section>
  );
}
