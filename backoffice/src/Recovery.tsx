import { useEffect, useRef, useState } from "react";
import { api } from "./client";
import { t, LanguagePicker, getLanguage, useLanguage } from "./i18n";
import { Brand } from "./Brand";
import { AuthenticatorSetup } from "./AuthenticatorSetup";
import { CodeSheet } from "./RecoveryCodes";
export default function Recovery({
  token,
  onClose,
}: {
  token?: string;
  onClose: () => void;
}) {
  useLanguage();
  const [raw, setRaw] = useState(token),
    [stage, setStage] = useState(token ? "link" : "request"),
    [csrf, setCsrf] = useState(""),
    [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null),
    [codes, setCodes] = useState<string[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [support, setSupport] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const hide = () => {
      setRaw(undefined);
      setSetup(null);
      setCodes(null);
      setCsrf("");
    };
    window.addEventListener("pagehide", hide);
    return () => {
      active.current = false;
      window.removeEventListener("pagehide", hide);
    };
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  function newPassword(form: FormData) {
    if (form.get("newPassword") !== form.get("confirm"))
      throw Error("Adgangskoderne er ikke ens.");
    return String(form.get("newPassword"));
  }
  return (
    <div
      className={
        location.pathname.startsWith("/backoffice")
          ? "auth-page bo-auth"
          : "auth-page"
      }
    >
      <div className="auth-brand">
        <Brand administration={location.pathname.startsWith("/backoffice")} />
        <LanguagePicker />
      </div>
      <section className="auth-card recovery-card">
        <h1>{t("Gendan adgang til din konto")}</h1>
        {stage === "request" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const email = String(new FormData(e.currentTarget).get("email"));
              void run(async () => {
                await api("/auth/recovery/request", "POST", {
                  email,
                  locale: getLanguage(),
                });
                if (active.current) setStage("sent");
              });
            }}
          >
            <p>
              {t(
                "Få et personligt link til at nulstille din adgangskode eller tilknytte en ny authenticator.",
              )}
            </p>
            <label>
              {t("E-mail")}
              <input
                name="email"
                type="email"
                maxLength={254}
                autoComplete="email"
                required
              />
            </label>
            <button className="button primary" disabled={busy}>
              {t("Send gendannelseslink")}
            </button>
          </form>
        )}
        {stage === "sent" && (
          <>
            <p role="status" className="notice">
              {t(
                "Hvis kontoen kan gendannes, modtager du en e-mail med et link. Tjek også spam. Linket udløber efter 30 minutter.",
              )}
            </p>
            <button
              className="button secondary"
              onClick={() => setStage("request")}
            >
              {t("Prøv igen")}
            </button>
          </>
        )}
        {stage === "link" && (
          <>
            <p>
              {t("Bekræft din adgang, før du ændrer dine loginoplysninger.")}
            </p>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const v = await api<{ csrf: string }>(
                    "/auth/recovery/begin",
                    "POST",
                    { token: raw },
                  );
                  if (active.current) {
                    setCsrf(v.csrf);
                    setRaw(undefined);
                    setStage("password");
                  }
                })
              }
            >
              {t("Fortsæt")}
            </button>
          </>
        )}
        {stage === "password" && (
          <>
            <p>
              {t(
                "Har du stadig din authenticator? Vælg en ny adgangskode og indtast en ny kode fra appen.",
              )}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void run(async () => {
                  await api(
                    "/auth/recovery/password",
                    "POST",
                    { newPassword: newPassword(data), code: data.get("code") },
                    csrf,
                  );
                  if (active.current) {
                    setCsrf("");
                    setStage("done");
                  }
                });
              }}
            >
              <PasswordFields />
              <OtpField />
              <button className="button primary" disabled={busy}>
                {t("Gem ny adgangskode")}
              </button>
            </form>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setError("");
                setStage("factor");
              }}
            >
              {t("Jeg har mistet min authenticator")}
            </button>
          </>
        )}
        {stage === "factor" && (
          <>
            <p>
              {t(
                "Brug din adgangskode og én gemt gendannelseskode. Du skal derefter tilknytte en ny authenticator.",
              )}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void run(async () => {
                  const result = await api<{ secret: string; uri: string }>(
                    "/auth/recovery/authenticator",
                    "POST",
                    Object.fromEntries(data),
                    csrf,
                  );
                  if (active.current) {
                    setSetup(result);
                    setStage("enroll");
                  }
                });
              }}
            >
              {support ? (
                <label>
                  {t("Personlig supportkode")}
                  <input
                    name="supportCode"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={43}
                    required
                  />
                </label>
              ) : (
                <>
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
                    {t("Gendannelseskode")}
                    <input
                      name="recoveryCode"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      maxLength={100}
                      required
                    />
                  </label>
                </>
              )}
              <button className="button primary" disabled={busy}>
                {t("Bekræft og fortsæt")}
              </button>
            </form>
            <p className="muted">
              {t(
                "Mangler du også dine gemte koder? Kontakt support for bekræftet hjælp. En Admin kan ikke logge ind som dig.",
              )}
            </p>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setSupport((v) => !v);
                setError("");
              }}
            >
              {t(
                support
                  ? "Brug en gendannelseskode"
                  : "Jeg har fået en personlig supportkode",
              )}
            </button>
          </>
        )}
        {stage === "enroll" && setup && (
          <>
            <p>
              {t(
                "Scan QR-koden med din nye authenticator. Vælg derefter en ny adgangskode og bekræft med en kode fra den nye app.",
              )}
            </p>
            <AuthenticatorSetup uri={setup.uri} secret={setup.secret} />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void run(async () => {
                  const v = await api<{ codes: string[] }>(
                    "/auth/recovery/complete",
                    "POST",
                    { newPassword: newPassword(data), code: data.get("code") },
                    csrf,
                  );
                  if (active.current) {
                    setSetup(null);
                    setCsrf("");
                    setCodes(v.codes);
                    setStage("codes");
                  }
                });
              }}
            >
              <PasswordFields />
              <OtpField />
              <button className="button primary" disabled={busy}>
                {t("Fuldfør gendannelse")}
              </button>
            </form>
          </>
        )}
        {stage === "codes" && codes && (
          <CodeSheet
            codes={codes}
            done={() => {
              setCodes(null);
              setStage("done");
            }}
          />
        )}
        {stage === "done" && (
          <>
            <p role="status" className="notice">
              {t(
                "Din konto er gendannet. Alle tidligere login er afsluttet. Log ind med din adgangskode og en ny authenticator-kode.",
              )}
            </p>
            <button className="button primary" onClick={onClose}>
              {t("Gå til login")}
            </button>
          </>
        )}
        {error && (
          <p className="alert" role="alert">
            {t(error)}
          </p>
        )}
        {stage !== "done" && (
          <button className="text-button" disabled={busy} onClick={onClose}>
            {t("Tilbage til login")}
          </button>
        )}
      </section>
    </div>
  );
}
function PasswordFields() {
  return (
    <>
      <label>
        {t("Ny adgangskode · mindst 14 tegn")}
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={14}
          maxLength={256}
          required
        />
      </label>
      <label>
        {t("Gentag ny adgangskode")}
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={14}
          maxLength={256}
          required
        />
      </label>
    </>
  );
}
function OtpField() {
  return (
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
  );
}
