import { lazy } from "react";
import { Deferred } from "./Deferred";
import { WorkspaceApp } from "./WorkspaceApp";
const AdminApp = lazy(() =>
  import("./AdminApp").then((m) => ({ default: m.AdminApp })),
);
export function App() {
  return location.pathname.startsWith("/backoffice") ? (
    <Deferred>
      <AdminApp />
    </Deferred>
  ) : (
    <WorkspaceApp />
  );
}
