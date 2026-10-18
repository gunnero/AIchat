import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowClockwiseIcon,
  KeyIcon,
  ArrowSquareOutIcon,
} from "@phosphor-icons/react";
import { api } from "./client";
import { t, getLanguage, useLanguage } from "./i18n";
import "./usage.css";

export type ReportingConnection = {
  label: string;
  suffix: string;
  revision: number;
  updatedAt: string;
};
type Account = {
  id: string;
  accountId: string | null;
  name: string;
  email: string;
  role: "Admin" | "Customer";
  status: string;
  expires: string | null;
  allowance: number;
  projects: { id: string; name: string; enabled: boolean }[];
};
export type UsageOverview = {
  asOf: string;
  appTrackingEnabled: false;
  allowanceUnit: "responses";
  connection: ReportingConnection | null;
  connectionRevision: number;
  accounts: Account[];
  totalAllowance: number;
};
type Metrics = {
  costUsd: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
};
export type OpenAIReport = {
  month: string;
  start: number;
  end: number;
  connectionRevision: number;
  fetchedAt: string;
  currency: "usd";
  totals: Metrics;
  projects: (Metrics & {
    projectRef: string | null;
    appProjects: { id: string; name: string }[];
  })[];
  days: (Metrics & { day: string })[];
};
const number = (value: number) =>
  value.toLocaleString(getLanguage() === "en" ? "en-GB" : "da-DK");
const money = (value: string) => {
  const n = Number(value);
  if (n !== 0 && Math.abs(n) < 0.000001)
    return (
      (n < 0 ? "−" : "") +
      "<" +
      new Intl.NumberFormat(getLanguage() === "en" ? "en-US" : "da-DK", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 6,
      }).format(0.000001)
    );
  return new Intl.NumberFormat(getLanguage() === "en" ? "en-US" : "da-DK", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(n);
};
const date = (value: string) =>
  new Intl.DateTimeFormat(getLanguage() === "en" ? "en-GB" : "da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value)) + " UTC";
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <td role="cell">
      <span className="usage-cell-label" aria-hidden="true">
        {label}
      </span>
      <div className="usage-cell-value">{children}</div>
    </td>
  );
}
function DataTable({
  title,
  headers,
  children,
}: {
  title: string;
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div
      className="table-scroll usage-table"
      role="region"
      tabIndex={0}
      aria-label={title}
    >
      <p className="table-hint">{t("Rul til siden for flere kolonner.")}</p>
      <table role="table">
        <caption className="usage-sr-only">{title}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {headers.map((h) => (
              <th role="columnheader" scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">{children}</tbody>
      </table>
    </div>
  );
}
export function UsagePage({
  refreshKey,
  connect,
  disconnect,
  manage,
}: {
  refreshKey: number;
  connect: (connection: ReportingConnection | null, revision: number) => void;
  disconnect: (connection: ReportingConnection) => void;
  manage: () => void;
}) {
  useLanguage();
  const [overview, setOverview] = useState<UsageOverview | null>(null),
    [loadError, setLoadError] = useState("");
  const [report, setReport] = useState<OpenAIReport | null>(null),
    [reportError, setReportError] = useState(""),
    [reportBusy, setReportBusy] = useState(false);
  const [refresh, setRefresh] = useState(0),
    [search, setSearch] = useState(""),
    [project, setProject] = useState("");
  const [month, setMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const epoch = useRef(0);
  useEffect(() => {
    const version = ++epoch.current;
    let current = true;
    setOverview(null);
    setLoadError("");
    setReport(null);
    setReportError("");
    api<UsageOverview>("/usage")
      .then((data) => {
        if (current && epoch.current === version) setOverview(data);
      })
      .catch((error) => {
        if (current) setLoadError(error.message);
      });
    return () => {
      current = false;
    };
  }, [refreshKey, refresh]);
  const revision = overview?.connection?.revision;
  useEffect(() => {
    let current = true;
    const version = epoch.current;
    setReport(null);
    setReportError("");
    setReportBusy(false);
    if (revision === undefined || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      return;
    setReportBusy(true);
    api<OpenAIReport>("/usage/openai?month=" + encodeURIComponent(month))
      .then((data) => {
        if (!current || version !== epoch.current) return;
        if (data.month !== month || data.connectionRevision !== revision)
          throw new Error(
            "Rapporteringsforbindelsen er ændret. Genindlæs siden.",
          );
        setReport(data);
      })
      .catch((error) => {
        if (current && version === epoch.current) setReportError(error.message);
      })
      .finally(() => {
        if (current && version === epoch.current) setReportBusy(false);
      });
    return () => {
      current = false;
    };
  }, [revision, month, overview?.asOf]);
  const oldest = new Date();
  oldest.setUTCMonth(oldest.getUTCMonth() - 23, 1);
  const projects = [
    ...new Map(
      overview?.accounts.flatMap((a) =>
        a.projects.map((p) => [p.id, p] as const),
      ) || [],
    ).values(),
  ];
  const selectedProject = projects.some((p) => p.id === project) ? project : "";
  const accounts =
    overview?.accounts.filter(
      (a) =>
        (!selectedProject ||
          a.projects.some((p) => p.id === selectedProject)) &&
        (!search ||
          [a.name, a.email].some((v) =>
            v.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
          )),
    ) || [];
  return (
    <div className="usage-page">
      <div className="usage-toolbar">
        <p>
          {t(
            "Tal for appen og din tilsluttede OpenAI-organisation vises hver for sig.",
          )}
        </p>
        <button
          className="button secondary"
          onClick={() => setRefresh((v) => v + 1)}
        >
          <ArrowClockwiseIcon size={19} />
          {t("Opdatér overblik")}
        </button>
      </div>
      {loadError && (
        <div className="alert" role="alert">
          {t(loadError)}{" "}
          <button onClick={() => setRefresh((v) => v + 1)}>
            {t("Prøv igen")}
          </button>
        </div>
      )}
      {!overview && !loadError && <p role="status">{t("Indlæser…")}</p>}
      {overview && (
        <>
          <section
            className="usage-section"
            aria-labelledby="usage-openai-heading"
          >
            <div className="usage-section-heading">
              <div>
                <p className="eyebrow">OPENAI</p>
                <h2 id="usage-openai-heading">
                  {t("OpenAI-forbrug og udgifter")}
                </h2>
              </div>
              <a
                className="button secondary"
                href="https://platform.openai.com/usage"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ArrowSquareOutIcon size={18} />
                {t("Se i OpenAI")}
              </a>
            </div>
            {!overview.connection ? (
              <div className="usage-connect">
                <KeyIcon size={30} />
                <div>
                  <h3>{t("Tilslut OpenAI-rapportering")}</h3>
                  <p>
                    {t(
                      "Tilføj en Admin API-nøgle for at se organisationens faktiske udgifter og modeltokens. Projektnøgler giver ikke denne rapportadgang.",
                    )}
                  </p>
                  <button
                    className="button primary"
                    onClick={() => connect(null, overview.connectionRevision)}
                  >
                    {t("Tilslut rapportering")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="usage-connection">
                  <div>
                    <strong>{overview.connection.label}</strong>
                    <small>
                      {t("Rapporteringsnøgle")} · ••••{" "}
                      {overview.connection.suffix}
                    </small>
                  </div>
                  <div className="row-actions">
                    <button
                      className="text-button"
                      onClick={() =>
                        connect(
                          overview.connection,
                          overview.connectionRevision,
                        )
                      }
                    >
                      {t("Udskift nøgle")}
                    </button>
                    <button
                      className="text-button"
                      onClick={() => disconnect(overview.connection!)}
                    >
                      {t("Afbryd rapportering")}
                    </button>
                  </div>
                </div>
                <label className="usage-month">
                  {t("Måned · UTC")}
                  <input
                    type="month"
                    value={month}
                    min={oldest.toISOString().slice(0, 7)}
                    max={new Date().toISOString().slice(0, 7)}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                </label>
              </>
            )}
            <div className="usage-metrics" aria-busy={reportBusy}>
              <div className="usage-metric">
                <span>{t("OpenAI-udgifter · USD")}</span>
                <strong>{report ? money(report.totals.costUsd) : "—"}</strong>
                <small>{t("Rapporteret af OpenAI")}</small>
              </div>
              <div className="usage-metric">
                <span>{t("Modeltokens")}</span>
                <strong>
                  {report
                    ? number(
                        report.totals.inputTokens + report.totals.outputTokens,
                      )
                    : "—"}
                </strong>
                <small>
                  {t("Input og output; cachetokens tælles én gang")}
                </small>
              </div>
              <div className="usage-metric">
                <span>{t("Modelkald")}</span>
                <strong>{report ? number(report.totals.requests) : "—"}</strong>
                <small>{t("I den valgte måned")}</small>
              </div>
            </div>
            {reportBusy && <p role="status">{t("Henter OpenAI-rapport…")}</p>}
            {reportError && (
              <p className="alert" role="alert">
                {t(reportError)}
              </p>
            )}
            {report && (
              <>
                <p className="usage-updated">
                  {t("Senest hentet")}: {date(report.fetchedAt)}
                </p>
                <DataTable
                  title={t("OpenAI-forbrug pr. projekt")}
                  headers={[
                    t("OpenAI-projekt"),
                    t("Inputtokens"),
                    t("Outputtokens"),
                    t("Modelkald"),
                    t("Udgifter · USD"),
                  ]}
                >
                  {report.projects.map((p) => (
                    <tr role="row" key={p.projectRef || "unallocated"}>
                      <Cell label={t("OpenAI-projekt")}>
                        <strong>
                          {p.appProjects.map((a) => a.name).join(", ") ||
                            (p.projectRef
                              ? t("Øvrigt OpenAI-projekt")
                              : t("Ikke fordelt på projekt"))}
                        </strong>
                        {p.projectRef && <small>{p.projectRef}</small>}
                      </Cell>
                      <Cell label={t("Inputtokens")}>
                        {number(p.inputTokens)}
                      </Cell>
                      <Cell label={t("Outputtokens")}>
                        {number(p.outputTokens)}
                      </Cell>
                      <Cell label={t("Modelkald")}>{number(p.requests)}</Cell>
                      <Cell label={t("Udgifter · USD")}>
                        {money(p.costUsd)}
                      </Cell>
                    </tr>
                  ))}
                  {!report.projects.length && (
                    <tr role="row">
                      <td colSpan={5}>
                        {t(
                          "OpenAI har endnu ikke rapporteret forbrug i denne periode.",
                        )}
                      </td>
                    </tr>
                  )}
                </DataTable>
                {!!report.days.length && (
                  <details className="usage-daily">
                    <summary>{t("Vis dagligt forbrug")}</summary>
                    <DataTable
                      title={t("Dagligt OpenAI-forbrug")}
                      headers={[
                        t("Dato · UTC"),
                        t("Modeltokens"),
                        t("Udgifter · USD"),
                      ]}
                    >
                      {report.days.map((d) => (
                        <tr role="row" key={d.day}>
                          <Cell label={t("Dato · UTC")}>{d.day}</Cell>
                          <Cell label={t("Modeltokens")}>
                            {number(d.inputTokens + d.outputTokens)}
                          </Cell>
                          <Cell label={t("Udgifter · USD")}>
                            {money(d.costUsd)}
                          </Cell>
                        </tr>
                      ))}
                    </DataTable>
                  </details>
                )}
              </>
            )}
            <p className="footnote">
              {t(
                "OpenAI-totaler omfatter også Platform-tests og andre værktøjer i den tilsluttede organisation. Modeltokens omfatter modelkald; øvrige betalte tjenester kan indgå i udgifterne. Tallene kan blive opdateret med forsinkelse og er ikke kundebetalinger.",
              )}
            </p>
          </section>
          <section
            className="usage-section"
            aria-labelledby="usage-app-heading"
          >
            <div className="usage-section-heading">
              <div>
                <p className="eyebrow">{t("DENNE APP")}</p>
                <h2 id="usage-app-heading">
                  {t("Brugere og tildelte rammer")}
                </h2>
              </div>
              <button className="button secondary" onClick={manage}>
                {t("Administrér kunder")}
              </button>
            </div>
            <div className="usage-app-summary">
              <strong>{number(overview.totalAllowance)}</strong>
              <span>{t("Tildelt svarramme i alt")}</span>
              <small>{t("Svar, ikke tokens eller penge")}</small>
            </div>
            <p className="notice">
              {t(
                "AI-svar er endnu ikke aktiveret i appen. Tokens, brugt beløb og resterende saldo pr. bruger er derfor ikke målt. Den tildelte svarramme håndhæves endnu ikke.",
              )}
            </p>
            <div className="usage-filters">
              <label>
                {t("Søg efter bruger")}
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  maxLength={100}
                  placeholder={t("Navn eller e-mail")}
                />
              </label>
              <label>
                {t("Projekt")}
                <select
                  value={selectedProject}
                  onChange={(e) => setProject(e.target.value)}
                >
                  <option value="">{t("Alle projekter")}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <DataTable
              title={t("Brugere og tildelte rammer")}
              headers={[
                t("Bruger"),
                t("Projekter"),
                t("Svarramme"),
                t("Brugte tokens"),
                t("Brugt beløb · USD"),
              ]}
            >
              {accounts.map((a) => (
                <tr role="row" key={a.id}>
                  <Cell label={t("Bruger")}>
                    <strong>{a.name}</strong>
                    <small>{a.email}</small>
                    <small>
                      {a.role === "Admin" ? "Admin" : t("Kunde")} ·{" "}
                      {t(
                        a.status === "active"
                          ? "Aktiv"
                          : a.status === "paused"
                            ? "På pause"
                            : "Afventer",
                      )}
                      {a.expires
                        ? " · " + t("Adgang til") + " " + a.expires
                        : ""}
                    </small>
                  </Cell>
                  <Cell label={t("Projekter")}>
                    {a.projects.length
                      ? a.projects.map((p) => (
                          <span className="usage-project" key={p.id}>
                            {p.name}
                            {!p.enabled ? " · " + t("På pause") : ""}
                          </span>
                        ))
                      : "—"}
                  </Cell>
                  <Cell label={t("Svarramme")}>{number(a.allowance)}</Cell>
                  <Cell label={t("Brugte tokens")}>{t("Ikke målt")}</Cell>
                  <Cell label={t("Brugt beløb · USD")}>{t("Ikke målt")}</Cell>
                </tr>
              ))}
              {!accounts.length && (
                <tr role="row">
                  <td colSpan={5}>{t("Ingen brugere matcher filtrene.")}</td>
                </tr>
              )}
            </DataTable>
            <p className="footnote">
              {t(
                "Rammen gemmes pr. person og vises én gang, selv når flere projekter er tildelt. OpenAI-udgifter fordeles ikke automatisk på appens brugere. Samtaletitler og beskeder vises aldrig her.",
              )}
            </p>
          </section>
        </>
      )}
    </div>
  );
}

export function ReportingConnectionForm({
  connection,
  revision,
  busy,
  save,
}: {
  connection: ReportingConnection | null;
  revision: number;
  busy: boolean;
  save: (value: {
    label: string;
    apiKey: string;
    revision: number;
  }) => Promise<boolean>;
}) {
  const [error, setError] = useState("");
  const keyInput = useRef<HTMLInputElement>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const apiKey = String(f.get("apiKey")).trim();
        if (apiKey.startsWith("sk-proj-")) {
          setError(
            "Brug en OpenAI Admin API-nøgle til rapportering, ikke en projektnøgle.",
          );
          keyInput.current?.focus();
          return;
        }
        setError("");
        void save({
          label: String(f.get("label")).trim(),
          apiKey,
          revision,
        });
      }}
    >
      <p>
        {t(
          "Opret en særskilt OpenAI Admin API-nøgle med adgang til Usage og Costs. Appen bruger den kun til at læse rapporter. Den erstatter ikke projekternes chatnøgler.",
        )}
      </p>
      <label>
        {t("Navn på rapporteringsforbindelsen")}
        <input
          name="label"
          defaultValue={connection?.label}
          maxLength={80}
          required
          disabled={busy}
        />
      </label>
      <label>
        {t("OpenAI Admin API-nøgle")}
        <input
          name="apiKey"
          ref={keyInput}
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          minLength={25}
          maxLength={512}
          required
          disabled={busy}
          aria-invalid={!!error}
          onChange={() => setError("")}
        />
      </label>
      {error && (
        <p className="alert" role="alert">
          {t(error)}
        </p>
      )}
      <p className="footnote">
        {t(
          "Nøglen sendes sikkert til serveren, kontrolleres og gemmes krypteret. Den vises aldrig igen. En afvist ny nøgle ændrer ikke den eksisterende forbindelse.",
        )}
      </p>
      <a
        href="https://platform.openai.com/settings/organization/admin-keys"
        target="_blank"
        rel="noopener noreferrer"
      >
        {t("Åbn OpenAI Admin-nøgler")}
      </a>
      <div className="form-actions">
        <button className="button primary" disabled={busy}>
          {t(busy ? "Arbejder…" : "Kontrollér og gem")}
        </button>
      </div>
    </form>
  );
}
