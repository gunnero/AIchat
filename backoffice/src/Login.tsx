import { useState } from "react";
import { ShieldCheckIcon, LockKeyIcon } from "@phosphor-icons/react";
import { api, type Session } from "./client";
import { t, LanguagePicker } from "./i18n";
import { Brand } from "./Brand";
import { Save } from "./FormActions";
export function Login({
  onLogin,
  error: initial,
}: {
  onLogin: (s: Session) => void;
  error: string;
}) {
  const backoffice = location.pathname.startsWith("/backoffice");
  const [error, setError] = useState(initial),
    [busy, setBusy] = useState(false);
  return (
    <div className={backoffice ? "auth-page bo-auth" : "auth-page"}>
      <div className="auth-brand">
        <Brand administration={backoffice} />
        <LanguagePicker />
      </div>
      <section className="auth-card">
        <span className="icon-circle">
          {backoffice ? (
            <ShieldCheckIcon size={30} />
          ) : (
            <LockKeyIcon size={30} />
          )}
        </span>
        <p className="eyebrow">{t("VELKOMMEN TILBAGE")}</p>
        <h1>
          {t(
            backoffice
              ? "Log ind i administrationen"
              : "Log ind i dit arbejdsrum",
          )}
        </h1>
        <p className="muted">
          {t(
            backoffice
              ? "Administrér kunder, projekter og adgang."
              : "Dine assistenter og private samtaler venter her.",
          )}{" "}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              const result = await api<Session>(
                "/auth/login",
                "POST",
                Object.fromEntries(f),
              );
              e.currentTarget?.reset();
              onLogin(result);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {t("E-mail eller brugernavn")}{" "}
            <input name="email" type="text" autoComplete="username" required />
          </label>
          <label>
            {t("Adgangskode")}{" "}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={256}
              required
            />
          </label>
          <label>
            {t("Authenticator-kode")}{" "}
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              placeholder={t("6 cifre")}
            />
          </label>
          {error && (
            <p className="alert" role="alert">
              {t(error)}
            </p>
          )}
          <Save busy={busy} label={t("Log ind")} />
        </form>
        <p className="footnote">
          {t(
            "Adgang kræver en invitation, en personlig adgangskode og en authenticator-kode.",
          )}{" "}
        </p>
      </section>
      <p className="auth-footer">AI · Kundetypeassistent</p>
    </div>
  );
}
