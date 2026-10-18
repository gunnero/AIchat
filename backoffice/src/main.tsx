import { lazy, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Deferred, Recovery } from "./Deferred";
import { WorkspaceApp } from "./WorkspaceApp";
const AdminApp = lazy(() =>
  import("./AdminApp").then((m) => ({ default: m.AdminApp })),
);
export function App() {
  const [departing, setDeparting] = useState(false);
  const [recover, setRecover] = useState(() =>
    new URLSearchParams(location.hash.slice(1)).get("recover"),
  );
  useEffect(() => {
    const read = () => {
      const raw = new URLSearchParams(location.hash.slice(1)).get("recover");
      if (raw) {
        history.replaceState(null, "", location.pathname + location.search);
        setRecover(raw);
      }
    };
    read();
    const hide = () =>
      flushSync(() => {
        setDeparting(true);
        setRecover(null);
      });
    const show = (e: PageTransitionEvent) => {
      if (e.persisted) location.reload();
    };
    window.addEventListener("hashchange", read);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
    };
  }, []);
  if (departing) return null;
  if (recover)
    return (
      <Deferred>
        <Recovery token={recover} onClose={() => setRecover(null)} />
      </Deferred>
    );
  return location.pathname.startsWith("/backoffice") ? (
    <Deferred>
      <AdminApp />
    </Deferred>
  ) : (
    <WorkspaceApp />
  );
}
