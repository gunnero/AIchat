import { useState } from "react";
import { api } from "./client";
import { t, LanguagePicker } from "./i18n";
import { Brand } from "./Brand";
import { Save, values } from "./FormActions";
import { AuthenticatorSetup } from "./AuthenticatorSetup";
import { CodeSheet } from "./RecoveryCodes";
export default function Registration({ token }: { token: string }) {
  const [details, setDetails] = useState<{
      name: string;
      email: string;
      secret: string;
      uri: string;
      csrf: string;
      role: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  return (
    <div className="auth-page">
      <Brand />
      <LanguagePicker />
      <section className="auth-card">
        <p className="eyebrow">{t("DIN PERSONLIGE INVITATION")}</p>
        <h1>{t("Velkommen til Kundetypeassistent")}</h1>
        {codes ? (
          <CodeSheet
            codes={codes}
            done={() => {
              setCodes(null);
              setDone(true);
            }}
          />
        ) : done ? (
          <>
            <p className="notice">
              {t(
                "Din konto er aktiveret. Log ind med adgangskode og en ny authenticator-kode.",
              )}
            </p>
            <a className="button primary" href="/backoffice/">
              {t("Gå til login")}
            </a>
          </>
        ) : !details ? (
          <>
            <p>
              {t(
                "Aktivér din konto. Du vælger selv din adgangskode og skal tilknytte en authenticator.",
              )}
            </p>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setDetails(await api("/register/begin", "POST", { token }));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Fortsæt til registrering")}
            </button>
          </>
        ) : (
          <>
            <p>
              <strong>{details.name}</strong> · {details.email} · {details.role}
            </p>
            <AuthenticatorSetup uri={details.uri} secret={details.secret} />
            <form
              onSubmit={async (e) => {
                const f = values(e);
                setBusy(true);
                setError("");
                try {
                  const result = await api<{ codes?: string[] }>(
                    "/register/complete",
                    "POST",
                    f,
                    details.csrf,
                  );
                  setDetails(null);
                  if (result.codes) setCodes(result.codes);
                  else setDone(true);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                {t("Brugernavn")}
                <input
                  name="username"
                  autoComplete="username"
                  pattern="[a-z0-9][a-z0-9_.-]{2,39}"
                  minLength={3}
                  maxLength={40}
                  required
                />
                <small>
                  {t(
                    "3–40 små bogstaver, tal, punktum, bindestreg eller understregning.",
                  )}
                </small>
              </label>
              <label>
                {t("Ny adgangskode · mindst 14 tegn")}
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={14}
                  maxLength={256}
                  required
                />
              </label>
              <label>
                {t("Authenticator-kode")}
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
              </label>
              <Save busy={busy} label={t("Aktivér konto")} />
            </form>
          </>
        )}
        {error && (
          <p className="alert" role="alert">
            {t(error)}
          </p>
        )}
      </section>
    </div>
  );
}
