import { Component, Suspense, lazy, type ReactNode } from "react";
import { t, useLanguage } from "./i18n";

export const Registration = lazy(() => import("./Registration"));
class LoadBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="deferred-state" role="alert">
        <p>{t("Siden kunne ikke indlæses. Genindlæs for at prøve igen.")}</p>
        <button className="button secondary" onClick={() => location.reload()}>
          {t("Genindlæs siden")}
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function Deferred({ children }: { children: ReactNode }) {
  useLanguage();
  return (
    <LoadBoundary>
      <Suspense
        fallback={
          <p className="deferred-state" role="status">
            {t("Indlæser…")}
          </p>
        }
      >
        {children}
      </Suspense>
    </LoadBoundary>
  );
}
