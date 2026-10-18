import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api, type Session } from "./client";
import { CustomerWorkspace } from "./CustomerWorkspace";
import { Login } from "./Login";
import { Deferred, Registration } from "./Deferred";
import { t, useLanguage } from "./i18n";

export function WorkspaceApp() {
  const language = useLanguage();
  const [inviteToken] = useState(() =>
    new URLSearchParams(location.hash.slice(1)).get("invite"),
  );
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [departing, setDeparting] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  function clearSession() {
    epoch.current++;
    setSession(null);
    setError("");
  }
  useEffect(() => {
    document.title = `${t("Dit private arbejdsrum")} · Kundetypeassistent`;
  }, [language]);
  useEffect(() => {
    if (inviteToken)
      history.replaceState(null, "", location.pathname + location.search);
    let current = true;
    const version = epoch.current;
    if (!inviteToken)
      api<Session>("/auth/session")
        .then((value) => {
          if (current && version === epoch.current) setSession(value);
        })
        .catch((e) => {
          if (current && version === epoch.current && e.status !== 401)
            setError(e.message);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    const hide = () =>
      flushSync(() => {
        setDeparting(true);
        clearSession();
      });
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) location.reload();
    };
    window.addEventListener("session-expired", clearSession);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      current = false;
      epoch.current++;
      window.removeEventListener("session-expired", clearSession);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
    };
  }, [inviteToken]);
  if (departing) return null;
  if (inviteToken)
    return (
      <Deferred>
        <Registration token={inviteToken} />
      </Deferred>
    );
  if (loading)
    return (
      <div className="auth-page">
        <p role="status">{t("Åbner dit arbejdsrum…")}</p>
      </div>
    );
  if (!session) return <Login onLogin={setSession} error={t(error)} />;
  return (
    <CustomerWorkspace
      key={session.id}
      session={session}
      logout={clearSession}
      onNameChange={(name) =>
        setSession((current) =>
          current && current.id === session.id ? { ...current, name } : current,
        )
      }
    />
  );
}
