import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type Session } from "./client";
import { t, useLanguage, getLanguage } from "./i18n";
import { Dialog } from "./Dialog";

type Account = {
  id: string;
  allowance: number;
  expires: string | null;
  projects: { id: string; name: string }[];
  usageAvailable: false;
  billingAvailable: false;
};
export function AccountDialog(props: {
  session: Session;
  onNameChange?: (name: string) => void;
  logout: () => void;
  close: () => void;
}) {
  useLanguage();
  return (
    <Dialog title={t("Min konto")} onClose={props.close}>
      <AccountPanel {...props} />
    </Dialog>
  );
}
export function AccountPanel({
  session,
  onNameChange,
  logout,
}: {
  session: Session;
  onNameChange?: (name: string) => void;
  logout: () => void;
}) {
  useLanguage();
  const [account, setAccount] = useState<Account | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState(session.name);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const active = useRef(true);
  const identity = useRef(session.id);
  identity.current = session.id;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    setName(session.name);
    setError("");
    setNotice("");
    setBusy(false);
    setPassword(false);
  }, [session.id]);
  useEffect(() => {
    let current = true;
    setAccount(null);
    setLoadError("");
    api<Account>("/account")
      .then((result) => {
        if (!current) return;
        if (!result || !session.id || result.id !== session.id)
          throw new Error(
            "Kontooplysningerne kunne ikke indlæses. Genindlæs siden og prøv igen.",
          );
        setAccount(result);
      })
      .catch((e) => {
        if (current) setLoadError(e.message);
      });
    return () => {
      current = false;
    };
  }, [session.id, refresh]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ id: string; name: string }>(
        "/account/profile",
        "PUT",
        { name: name.trim() },
        session.csrf,
      );
      if (
        active.current &&
        identity.current === session.id &&
        result.id === session.id
      ) {
        onNameChange?.(result.name);
        setNotice("Dit navn er gemt.");
      }
    } catch (e) {
      if (active.current && identity.current === session.id)
        setError((e as Error).message);
    } finally {
      if (active.current && identity.current === session.id) setBusy(false);
    }
  }
  return (
    <div className="account-panel">
      <form onSubmit={save}>
        <h3>{t("Din profil")}</h3>
        <p className="muted">
          {session.email} · {session.username} ·{" "}
          {session.role === "Admin" ? "Admin" : t("Kunde")}
        </p>
        <label>
          {t("Navn")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            autoComplete="name"
          />
        </label>
        {error && (
          <p className="alert" role="alert">
            {t(error)}
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {t(notice)}
          </p>
        )}
        <button className="button primary" disabled={busy || !name.trim()}>
          {t(busy ? "Gemmer…" : "Gem navn")}
        </button>
      </form>
      <section className="account-allowance">
        <h3>{t("Din adgang og ramme")}</h3>
        {!account && !loadError && <p role="status">{t("Indlæser…")}</p>}
        {loadError && (
          <>
            <p className="alert" role="alert">
              {t(loadError)}
            </p>
            <button
              className="button secondary"
              onClick={() => setRefresh((v) => v + 1)}
            >
              {t("Prøv igen")}
            </button>
          </>
        )}
        {account && (
          <>
            <p className="account-balance">
              <strong>
                {account.allowance.toLocaleString(
                  getLanguage() === "da" ? "da-DK" : "en-GB",
                )}
              </strong>
              <span>{t("Svarramme")}</span>
            </p>
            <p>
              {t(
                "Dette er din tildelte ramme. Faktisk tokenforbrug og håndhævelse er endnu ikke aktiveret.",
              )}
            </p>
            <p className="muted">
              {t(
                "Betalingshistorik og pakker vises, når betalingssystemet er tilsluttet.",
              )}
            </p>
            {account.expires && (
              <p>
                {t("Adgang til")}: {account.expires}
              </p>
            )}
            <h4>{t("Dine assistenter")}</h4>
            {account.projects.length ? (
              <ul>
                {account.projects.map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
              </ul>
            ) : (
              <p>{t("Ingen assistenter tildelt endnu.")}</p>
            )}
          </>
        )}
      </section>
      <section>
        <h3>{t("Sikkerhed")}</h3>
        <p>{t("Totrinslogin er påkrævet for din konto.")}</p>
        <button
          className="button secondary"
          onClick={() => setPassword((v) => !v)}
          aria-expanded={password}
        >
          {t("Skift adgangskode")}
        </button>
        {password && <PasswordForm session={session} logout={logout} />}
      </section>
    </div>
  );
}

function PasswordForm({
  session,
  logout,
}: {
  session: Session;
  logout: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(true);
  useEffect(
    () => () => {
      active.current = false;
    },
    [],
  );
  return (
    <form
      className="account-password"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget));
        setBusy(true);
        setError("");
        try {
          await api("/auth/password", "POST", data, session.csrf);
          if (active.current) logout();
        } catch (e) {
          if (active.current) setError((e as Error).message);
        } finally {
          if (active.current) setBusy(false);
        }
      }}
    >
      <p>{t("Alle dine aktive sessioner afsluttes efter ændringen.")}</p>
      <label>
        {t("Nuværende adgangskode")}
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          maxLength={256}
          required
        />
      </label>
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
      {error && (
        <p className="alert" role="alert">
          {t(error)}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {t(busy ? "Gemmer…" : "Skift adgangskode")}
      </button>
    </form>
  );
}
