import { api, ApiError, type Session } from "./client";
import { CustomerWorkspace } from "./CustomerWorkspace";
import { SecurityConfirmation } from "./SecurityConfirmation";
import { PlatformPromptForm } from "./PlatformPromptForm";
import { AuthenticatorSetup } from "./AuthenticatorSetup";
import { Dialog } from "./Dialog";
import { AccountPanel } from "./AccountPanel";
import { t, getLanguage, useLanguage, LanguagePicker } from "./i18n";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  SquaresFourIcon,
  UsersIcon,
  KeyIcon,
  FoldersIcon,
  ScrollIcon,
  ShieldCheckIcon,
  SignOutIcon,
  PlusIcon,
  XIcon,
  ArrowRightIcon,
  LockKeyIcon,
  ArrowClockwiseIcon,
} from "@phosphor-icons/react";

type Invitation = { id: string; status: string; expires: number } | null;
type Account = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: "Admin" | "Customer";
  status: string;
  locale: "en" | "da";
  invitation: Invitation;
  allowance?: number;
  assignments?: { projectId: string; versionId: string }[];
};
type Customer = {
  id: string;
  name: string;
  email: string;
  status: string;
  expires: string | null;
  allowance: number;
  account: {
    id: string;
    status: string;
    username: string | null;
    locale: "en" | "da";
    invitation: Invitation;
  } | null;
  assignments: { projectId: string; versionId: string }[];
};
type Connection = {
  id: string;
  label: string;
  project_ref: string;
  environment: string;
  suffix: string;
  revision: number;
  enabled: number;
  status: string;
  last_checked: string | null;
};
type Project = {
  id: string;
  name: string;
  description: string;
  connection_id: string | null;
  enabled: number;
};
type Prompt = {
  id: string;
  project_id: string;
  prompt_id: string;
  name: string;
  version: number;
  source_ref: string;
  checksum: string;
  source_kind?: "local" | "platform";
  provider_prompt_id?: string | null;
  version_policy?: "default" | null;
};
type Audit = {
  id: string;
  administrator: string;
  action: string;
  target: string;
  created_at: string;
};
type Data = {
  customers: Customer[];
  connections: Connection[];
  projects: Project[];
  prompts: Prompt[];
  audit: Audit[];
  staff: Account[];
};
const empty: Data = {
  customers: [],
  connections: [],
  projects: [],
  prompts: [],
  audit: [],
  staff: [],
};
const tabs = () => [
  { id: "overview", label: t("Overblik"), icon: SquaresFourIcon },
  { id: "customers", label: t("Kunder"), icon: UsersIcon },
  { id: "projects", label: t("Projekter og prompter"), icon: FoldersIcon },
  { id: "connections", label: t("API-forbindelser"), icon: KeyIcon },
  { id: "staff", label: "Admins", icon: ShieldCheckIcon },
  { id: "audit", label: t("Aktivitetslog"), icon: ScrollIcon },
];
const statusText = (s: string) =>
  ({
    ok: t("Kontrolleret"),
    invalid: t("Nøgle afvist"),
    restricted: t("Adgang mangler"),
    rate_limited: t("Midlertidigt begrænset"),
    error: t("Kontrol mislykkedes"),
    unchecked: t("Ikke kontrolleret"),
    pending: t("Afventer"),
    active: t("Aktiv"),
    paused: t("På pause"),
    sending: t("Sender"),
    sent: t("Afleveret til mailserver"),
    failed: t("E-mail mislykkedes"),
    revoked: t("Tilbagekaldt"),
    used: t("Aktiveret"),
  })[s] || s;
const date = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat(getLanguage() === "en" ? "en-GB" : "da-DK", {
        dateStyle: "medium",
        ...(s.includes("T") ? { timeStyle: "short" } : {}),
      }).format(new Date(s))
    : "—";
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">AI</span>
      <div>
        <strong>Kundetypeassistent</strong>
        <span>
          {location.pathname.startsWith("/backoffice")
            ? "Administration"
            : t("Dit private arbejdsrum")}
        </span>
      </div>
    </div>
  );
}
export function App() {
  useLanguage();
  const [inviteToken] = useState(() =>
    new URLSearchParams(location.hash.slice(1)).get("invite"),
  );
  useEffect(() => {
    if (inviteToken)
      history.replaceState(null, "", location.pathname + location.search);
  }, [inviteToken]);
  const authEpoch = useRef(0);
  const activeMutation = useRef<symbol | null>(null);
  const pendingVerification = useRef<{
    epoch: number;
    verifying: boolean;
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const [verification, setVerification] = useState<{
    busy: boolean;
    error: string;
  } | null>(null);
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("overview");
  const [data, setData] = useState<Data>(empty),
    [notice, setNotice] = useState<
      string | { imported: number; skipped: number }
    >(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<{
    type: string;
    value?: Customer | Project | Connection | Prompt | Account;
  } | null>(null);
  const backoffice = location.pathname.startsWith("/backoffice");
  const setup =
    backoffice && new URLSearchParams(location.search).get("setup") === "1";
  function cancelVerification() {
    const pending = pendingVerification.current;
    pendingVerification.current = null;
    setVerification(null);
    pending?.resolve(false);
  }
  function clearSession() {
    authEpoch.current++;
    activeMutation.current = null;
    cancelVerification();
    setSession(null);
    setData(empty);
    setModal(null);
    setBusy(false);
    setError("");
    setNotice("");
  }
  useEffect(
    () => () => {
      authEpoch.current++;
      activeMutation.current = null;
      const pending = pendingVerification.current;
      pendingVerification.current = null;
      pending?.resolve(false);
    },
    [],
  );
  useEffect(() => {
    document.title = "AI · Kundetypeassistent";
    const restore = (e: PageTransitionEvent) => {
      if (e.persisted) location.reload();
    };
    window.addEventListener("session-expired", clearSession);
    const pageHide = () => flushSync(clearSession);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("session-expired", clearSession);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("pageshow", restore);
    };
  }, []);
  useEffect(() => {
    const epoch = authEpoch.current;
    let mounted = true;
    if (!setup && !inviteToken)
      api<Session>("/auth/session")
        .then((value) => {
          if (mounted && epoch === authEpoch.current) setSession(value);
        })
        .catch((e) => {
          if (mounted && epoch === authEpoch.current && e.status !== 401)
            setError(e.message);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    return () => {
      mounted = false;
    };
  }, [setup, inviteToken]);
  async function reload(epoch = authEpoch.current) {
    const [customers, connections, projects, prompts, audit, staff] =
      await Promise.all([
        api<Customer[]>("/customers"),
        api<Connection[]>("/connections"),
        api<Project[]>("/projects"),
        api<Prompt[]>("/prompts"),
        api<Audit[]>("/audit"),
        api<Account[]>("/staff"),
      ]);
    const next = { customers, connections, projects, prompts, audit, staff };
    if (epoch === authEpoch.current) setData(next);
    return next;
  }
  useEffect(() => {
    const epoch = authEpoch.current;
    if (session?.role === "Admin" && backoffice)
      reload(epoch).catch((e) => {
        if (epoch !== authEpoch.current) return;
        setError(e.message);
        if (e.status === 401) clearSession();
      });
  }, [session]);
  async function mutate(
    path: string,
    body: unknown,
    method = "POST",
    message = t("Ændringerne er gemt."),
  ) {
    if (activeMutation.current) return false;
    const operation = Symbol(),
      epoch = authEpoch.current;
    activeMutation.current = operation;
    const current = () =>
      epoch === authEpoch.current && activeMutation.current === operation;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      type Result = {
        message?: string;
        messageKey?: string;
        invitation?: string;
        projectId?: string;
        projectCreated?: boolean;
        imported?: number;
        skipped?: number;
        linked?: boolean;
      };
      let result: Result;
      try {
        result = await api<Result>(path, method, body, session?.csrf);
      } catch (e) {
        if (!current()) return false;
        const err = e as ApiError;
        if (err.status !== 403 || err.code !== "reauth_required") throw e;
        setBusy(false);
        const confirmed = await new Promise<boolean>((resolve) => {
          pendingVerification.current = { epoch, verifying: false, resolve };
          setVerification({ busy: false, error: "" });
        });
        if (!confirmed || !current()) return false;
        setBusy(true);
        result = await api<Result>(path, method, body, session?.csrf);
      }
      if (!current()) return false;
      const next = await reload(epoch);
      if (!current()) return false;
      setNotice(
        result.invitation === "failed"
          ? t(
              "Kontoen er gemt, men e-mailen kunne ikke sendes. Send invitationen igen.",
            )
          : result.invitation === "sent"
            ? t(
                "Invitationen er afleveret til mailserveren. Levering er endnu ikke bekræftet.",
              )
            : result?.messageKey || result?.message || message,
      );
      setModal(null);
      if (
        result.projectId &&
        (path === "/connections" ||
          /^\/connections\/[^/]+\/project$/.test(path))
      ) {
        navigate("projects");
        const project = next.projects.find((p) => p.id === result.projectId);
        if (result.projectCreated && project) {
          setNotice(t("Projektet er oprettet. Tilknyt nu din OpenAI-prompt."));
          setModal({ type: "prompt-link", value: project });
        }
      }
      if (result.imported !== undefined)
        setNotice({ imported: result.imported, skipped: result.skipped ?? 0 });
      if (result.linked)
        setNotice(
          t("Prompten er tilknyttet. Foretag ændringer i OpenAI Platform."),
        );
      return true;
    } catch (e) {
      if (!current()) return false;
      const err = e as ApiError;
      setError(err.message);
      if (err.status === 401) clearSession();
      return false;
    } finally {
      if (activeMutation.current === operation) {
        activeMutation.current = null;
        setBusy(false);
      }
    }
  }
  async function confirmVerification(code: string) {
    const pending = pendingVerification.current;
    if (!pending || pending.verifying) return;
    pending.verifying = true;
    setVerification({ busy: true, error: "" });
    try {
      await api("/auth/reauth", "POST", { code }, session?.csrf);
      if (
        pendingVerification.current !== pending ||
        pending.epoch !== authEpoch.current
      )
        return;
      pendingVerification.current = null;
      setVerification(null);
      pending.resolve(true);
    } catch (e) {
      if (
        pendingVerification.current !== pending ||
        pending.epoch !== authEpoch.current
      )
        return;
      const err = e as ApiError;
      if (err.status === 401 && err.code !== "invalid_otp") {
        clearSession();
        return;
      }
      pending.verifying = false;
      setVerification({ busy: false, error: err.message });
    }
  }
  if (inviteToken) return <Registration token={inviteToken} />;
  if (setup) return <Setup />;
  if (loading)
    return (
      <div className="auth-page">
        <p role="status">{t("Åbner administrationen…")}</p>
      </div>
    );
  if (!session) return <Login onLogin={setSession} error={t(error)} />;
  if (!backoffice || session.role === "Customer") {
    if (backoffice) {
      location.replace("/");
      return null;
    }
    return (
      <CustomerWorkspace
        key={session.id}
        session={session}
        logout={clearSession}
        onNameChange={(name) =>
          setSession((current) =>
            current && current.id === session.id
              ? { ...current, name }
              : current,
          )
        }
      />
    );
  }
  const selected = tabs().find((t) => t.id === tab)!;
  const navigate = (id: string) => {
    setTab(id);
    setError("");
    setNotice("");
  };
  return (
    <div className="shell">
      <aside>
        <Brand />
        <LanguagePicker />
        <p className="nav-label">{t("DIT ARBEJDSRUM")}</p>
        <nav aria-label="Administration">
          {tabs().map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "selected" : ""}
              onClick={() => navigate(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <t.icon size={22} />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="side-footer">
          <button
            className="admin-person account-trigger"
            onClick={() => setModal({ type: "account" })}
            aria-label={t("Min konto")}
          >
            <span>{session.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{session.name}</strong>
              <small>Admin · 2FA</small>
            </div>
          </button>
          <a className="workspace-link" href="/">
            {t("Åbn mit arbejdsrum")}
          </a>
          <button onClick={() => setModal({ type: "password" })}>
            {t("Skift adgangskode")}{" "}
          </button>
          <button
            onClick={async () => {
              setBusy(true);
              try {
                await api("/auth/logout", "POST", {}, session.csrf);
                clearSession();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            <SignOutIcon size={20} />
            {t("Log ud")}{" "}
          </button>
        </div>
      </aside>
      <div className="main">
        <header>
          <div>
            <p className="eyebrow">AI · KUNDETYPEASSISTENT</p>
            <h1>{selected.label}</h1>
          </div>
        </header>
        <main>
          <div className="intro">
            <span className="eyebrow">{t("ET ROLIGT OVERBLIK")}</span>
            <h2>
              {tab === "overview"
                ? t("Plads til det, der er vigtigt.")
                : tab === "customers"
                  ? t("Menneskene bag samtalerne")
                  : tab === "projects"
                    ? t("Den rette assistent til hver kunde")
                    : tab === "connections"
                      ? t("Dine forbindelser til OpenAI")
                      : tab === "staff"
                        ? t("Administrér dit team")
                        : t("Et spor af vigtige ændringer")}
            </h2>
            <p>
              {tab === "overview"
                ? t(
                    "Administrér dine kunder, projekter og forbindelser ét sted.",
                  )
                : tab === "customers"
                  ? t(
                      "Styr adgang, projekttildelinger og svarrammer. Private kundesamtaler vises ikke her.",
                    )
                  : tab === "projects"
                    ? t(
                        "Tilknyt dine OpenAI-prompter, og vælg den rette assistent til hver kunde.",
                      )
                    : tab === "connections"
                      ? t(
                          "Tilføj en projektnøgle. Vi opretter projektet, så du kan tilknytte din OpenAI-prompt.",
                        )
                      : tab === "staff"
                        ? t(
                            "Invitér administratorer og administrér deres adgang.",
                          )
                        : t(
                            "Her ser du login og administrative handlinger. Nøgler, adgangskoder og beskedindhold indgår ikke.",
                          )}
            </p>
          </div>
          {error && !modal && (
            <p role="alert" className="alert">
              {t(error)}
            </p>
          )}
          {notice && (
            <p role="status" className="notice">
              {typeof notice === "string"
                ? t(notice)
                : t("Importeret: {imported}. Allerede tilføjet: {skipped}.")
                    .replace("{imported}", String(notice.imported))
                    .replace("{skipped}", String(notice.skipped))}
            </p>
          )}
          {tab === "overview" && (
            <>
              <div className="metrics">
                {[
                  {
                    title: t("Kunder"),
                    n: data.customers.length,
                    id: "customers",
                  },
                  {
                    title: t("Projekter"),
                    n: data.projects.length,
                    id: "projects",
                  },
                  {
                    title: t("API-forbindelser"),
                    n: data.connections.length,
                    id: "connections",
                  },
                ].map((m) => (
                  <button
                    key={m.id}
                    className="metric"
                    onClick={() => navigate(m.id)}
                  >
                    <span>
                      {m.title}
                      <ArrowRightIcon size={20} />
                    </span>
                    <strong>{m.n}</strong>
                  </button>
                ))}
              </div>
              <section className="welcome-card">
                <div className="icon-circle">
                  <ShieldCheckIcon size={30} />
                </div>
                <h3>{t("Kom godt i gang")}</h3>
                <p>
                  {t(
                    "Forbind OpenAI, tilknyt din prompt og invitér din første kunde.",
                  )}{" "}
                </p>
                <div className="steps">
                  <button onClick={() => navigate("connections")}>
                    <b>01</b>
                    <span>
                      {t("Tilføj en API-forbindelse")}{" "}
                      <small>
                        {t("Du ejer nøglerne og vælger selv projekt.")}
                      </small>
                    </span>
                    <ArrowRightIcon size={21} />
                  </button>
                  <button onClick={() => navigate("projects")}>
                    <b>02</b>
                    <span>
                      {t("Tilknyt din OpenAI-prompt")}{" "}
                      <small>
                        {t(
                          "Opret og redigér instruktionerne i OpenAI Platform.",
                        )}{" "}
                      </small>
                    </span>
                    <ArrowRightIcon size={21} />
                  </button>
                  <button onClick={() => navigate("customers")}>
                    <b>03</b>
                    <span>
                      {t("Opret og tildel kunder")}{" "}
                      <small>
                        {t(
                          "Vælg adgang og den rette prompt til hver kunde.",
                        )}{" "}
                      </small>
                    </span>
                    <ArrowRightIcon size={21} />
                  </button>
                </div>
              </section>
              <p className="footnote">
                {t(
                  "Kunder får adgang via en invitation. Deres samtaler er private. AI-svar er endnu ikke aktiveret.",
                )}{" "}
              </p>
            </>
          )}
          {tab === "customers" && (
            <>
              <Toolbar
                title={t("Dine kunder")}
                action={t("Tilføj kunde")}
                onClick={() => setModal({ type: "customer" })}
              />
              <Table
                headings={[
                  t("Kunde"),
                  "Status",
                  t("Projekter"),
                  t("Svarramme"),
                  t("Adgang til"),
                  t("Handling"),
                ]}
                empty={
                  !data.customers.length
                    ? t(
                        "Ingen kunder endnu. Tilføj den første kunde for at komme i gang.",
                      )
                    : undefined
                }
              >
                {data.customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      <small>{c.email}</small>
                    </td>
                    <td>
                      <span className="pill">{statusText(c.status)}</span>
                    </td>
                    <td>{c.assignments.length}</td>
                    <td>{c.allowance}</td>
                    <td>
                      {c.expires ? date(c.expires) : t("Ingen udløbsdato")}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        aria-label={t("Administrér ") + c.name}
                        onClick={() => setModal({ type: "customer", value: c })}
                      >
                        {t("Administrér")}{" "}
                      </button>
                      {c.account?.status === "pending" && (
                        <InviteActions
                          accountId={c.account.id}
                          invitation={c.account.invitation}
                          busy={busy}
                          act={mutate}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
              <p className="footnote">
                {t(
                  "Oprettelse sender en personlig invitation. Svarrammen er en indstilling; faktisk forbrug og håndhævelse tilføjes sammen med AI-chatten.",
                )}{" "}
              </p>
            </>
          )}
          {tab === "connections" && (
            <>
              <div className="security-note">
                <LockKeyIcon size={23} />
                <p>
                  <strong>
                    {t("Nøglen er kun synlig, når du tilføjer den.")}
                  </strong>
                  <br />
                  {t(
                    "Efter gemning vises kun de sidste fire tegn. Udskiftning kontrollerer den nye nøgle, før den gamle erstattes.",
                  )}{" "}
                </p>
              </div>
              <Toolbar
                title={t("API-forbindelser")}
                action={t("Tilføj forbindelse")}
                onClick={() => setModal({ type: "connection" })}
              />
              <Table
                headings={[
                  t("Forbindelse"),
                  t("Nøgle"),
                  "Status",
                  t("Seneste kontrol"),
                  t("Handlinger"),
                ]}
                empty={
                  !data.connections.length
                    ? t(
                        "Ingen forbindelser endnu. Tilføj din første OpenAI-projektnøgle.",
                      )
                    : undefined
                }
              >
                {data.connections.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.label}</strong>
                      <small>
                        {c.project_ref} ·{" "}
                        {c.environment === "test" ? "Test" : t("Produktion")}
                      </small>
                    </td>
                    <td>
                      <code>•••• {c.suffix}</code>
                      <small>Version {c.revision}</small>
                    </td>
                    <td>
                      <span className="pill">
                        {c.enabled ? statusText(c.status) : t("På pause")}
                      </span>
                    </td>
                    <td>{date(c.last_checked)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          disabled={busy}
                          className="text-button"
                          onClick={() =>
                            mutate("/connections/" + c.id + "/project", {})
                          }
                        >
                          {t("Åbn projekt")}
                        </button>
                        <button
                          disabled={busy || !c.enabled}
                          className="text-button"
                          onClick={() =>
                            mutate("/connections/" + c.id + "/check", {})
                          }
                        >
                          {t("Kontrollér")}{" "}
                        </button>
                        <button
                          disabled={busy}
                          className="text-button"
                          onClick={() => setModal({ type: "rotate", value: c })}
                        >
                          {t("Udskift nøgle")}{" "}
                        </button>
                        <button
                          disabled={busy}
                          className="text-button"
                          onClick={() =>
                            mutate(
                              "/connections/" + c.id,
                              {
                                label: c.label,
                                enabled: !c.enabled,
                                revision: c.revision,
                              },
                              "PUT",
                              c.enabled
                                ? t("Forbindelsen er sat på pause.")
                                : t("Forbindelsen er aktiveret."),
                            )
                          }
                        >
                          {c.enabled ? t("Sæt på pause") : t("Aktivér")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
              <p className="footnote">
                {t(
                  "Når forbindelsen gemmes, oprettes et projekt i appen. Tilknyt derefter din gemte OpenAI-prompt med dens ID. Kontrollen bekræfter ikke adgang til prompten eller kreditbalance.",
                )}{" "}
              </p>
            </>
          )}
          {tab === "projects" && (
            <>
              <Toolbar
                title={t("Dine projekter")}
                action={t("Tilføj projekt")}
                onClick={() => setModal({ type: "project" })}
              />
              {!data.projects.length && (
                <div className="empty">
                  {t(
                    "Ingen projekter endnu. Opret et projekt, og vælg eventuelt en API-forbindelse.",
                  )}{" "}
                </div>
              )}
              <div className="project-cards">
                {data.projects.map((p) => (
                  <section className="project-card" key={p.id}>
                    <div className="card-heading">
                      <div>
                        <h3>{p.name}</h3>
                        <span className="pill">
                          {p.enabled ? t("Aktivt") : t("På pause")}
                        </span>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setModal({ type: "project", value: p })}
                      >
                        {t("Redigér")}{" "}
                      </button>
                    </div>
                    <p>{p.description || t("Ingen beskrivelse tilføjet.")}</p>
                    <p className="connection-label">
                      <KeyIcon size={18} />
                      {data.connections.find((c) => c.id === p.connection_id)
                        ?.label || t("Ingen API-forbindelse valgt")}
                    </p>
                    <div className="prompt-heading">
                      <h4>{t("Prompter")}</h4>
                      <button
                        className="text-button"
                        onClick={() =>
                          setModal({ type: "prompt-link", value: p })
                        }
                      >
                        <PlusIcon size={17} />
                        {t("Tilknyt OpenAI-prompt")}
                      </button>
                    </div>
                    {data.prompts
                      .filter((v) => v.project_id === p.id)
                      .map((v) => (
                        <div className="prompt-row" key={v.id}>
                          <span>
                            <strong>{v.name}</strong>
                            <small>
                              {v.source_kind === "platform"
                                ? t(
                                    "Administreres i OpenAI · Udgivet standardversion",
                                  )
                                : "v" + v.version}
                              {v.source_ref ? " · " + v.source_ref : ""}
                            </small>
                          </span>
                          {v.source_kind === "platform" ? (
                            <a
                              className="text-button"
                              href="https://platform.openai.com"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {t("Redigér i OpenAI")}
                            </a>
                          ) : (
                            <button
                              className="text-button"
                              onClick={() =>
                                setModal({ type: "version", value: v })
                              }
                            >
                              {t("Se / ny version")}
                            </button>
                          )}
                        </div>
                      ))}
                    {!data.prompts.some((v) => v.project_id === p.id) && (
                      <p className="muted">
                        {t(
                          "Tilknyt en OpenAI-prompt, før projektet tildeles en kunde.",
                        )}{" "}
                      </p>
                    )}
                  </section>
                ))}
              </div>
              <p className="footnote">
                {t(
                  "Instruktionerne administreres i OpenAI Platform. Appen gemmer tilknytningen og kundernes adgang. AI-svar er endnu ikke aktiveret.",
                )}{" "}
              </p>
            </>
          )}
          {tab === "staff" && (
            <>
              <Toolbar
                title="Admins"
                action={t("Invitér Admin")}
                onClick={() => setModal({ type: "staff" })}
              />
              <p className="footnote">
                {t("Administratorkonti kræver personlig adgangskode og 2FA.")}
              </p>
              <Table
                headings={[
                  t("Navn"),
                  t("Brugernavn"),
                  t("Rolle"),
                  "Status",
                  t("Handling"),
                ]}
              >
                {data.staff.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.name}</strong>
                      <small>{a.email}</small>
                    </td>
                    <td>{a.username || "—"}</td>
                    <td>Admin</td>
                    <td>{statusText(a.status)}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setModal({ type: "staff", value: a })}
                      >
                        {t("Administrér")}
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          setModal({ type: "staff-workspace", value: a })
                        }
                      >
                        {t("Tildel assistenter")}
                      </button>
                      {a.status === "pending" && (
                        <InviteActions
                          accountId={a.id}
                          invitation={a.invitation}
                          busy={busy}
                          act={mutate}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            </>
          )}
          {tab === "audit" && (
            <Table
              headings={[
                t("Tidspunkt"),
                t("Administrator"),
                t("Handling"),
                "Reference",
              ]}
              empty={
                !data.audit.length ? t("Ingen aktiviteter endnu.") : undefined
              }
            >
              {data.audit.map((a) => (
                <tr key={a.id}>
                  <td>{date(a.created_at)}</td>
                  <td>{a.administrator || "System"}</td>
                  <td>{auditText(a.action)}</td>
                  <td>
                    <code className="reference">{a.target.slice(0, 8)}</code>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </main>
        <footer>
          <ShieldCheckIcon size={17} />
          {t("Sikker adgang · Kundernes samtaler er private")}{" "}
        </footer>
      </div>
      {(modal || verification) && (
        <Dialog
          title={
            verification
              ? t("Bekræft ændringen")
              : modal
                ? modal.type === "account"
                  ? t("Min konto")
                  : modal.type === "staff-workspace"
                    ? t("Tildel assistenter")
                    : modal.type === "staff"
                      ? t("Administrér Admin")
                      : modal.type === "customer"
                        ? modal.value
                          ? t("Administrér kunde")
                          : t("Tilføj kunde")
                        : modal.type === "project"
                          ? modal.value
                            ? t("Redigér projekt")
                            : t("Tilføj projekt")
                          : modal.type === "connection"
                            ? t("Tilføj API-forbindelse")
                            : modal.type === "rotate"
                              ? t("Udskift API-nøgle")
                              : modal.type === "prompt-link"
                                ? t("Tilknyt OpenAI-prompt")
                                : modal.type === "password"
                                  ? t("Skift adgangskode")
                                  : t("Prompt og instruktioner")
                : ""
          }
          onClose={() => {
            if (verification) cancelVerification();
            else if (!busy) {
              setModal(null);
              setError("");
            }
          }}
        >
          {verification && (
            <SecurityConfirmation
              busy={verification.busy}
              error={verification.error}
              hasForm={!!modal}
              confirm={confirmVerification}
              cancel={cancelVerification}
            />
          )}
          {modal && (
            <div hidden={!!verification}>
              {error && (
                <p className="alert" role="alert">
                  {t(error)}
                </p>
              )}
              {modal.type === "account" && (
                <AccountPanel
                  session={session}
                  onNameChange={(name) =>
                    setSession((current) =>
                      current && current.id === session.id
                        ? { ...current, name }
                        : current,
                    )
                  }
                  logout={clearSession}
                />
              )}
              {modal.type === "staff-workspace" && (
                <StaffWorkspaceForm
                  account={modal.value as Account}
                  data={data}
                  busy={busy}
                  save={(v) =>
                    mutate("/staff/" + modal.value!.id + "/workspace", v, "PUT")
                  }
                />
              )}
              {modal.type === "staff" && (
                <StaffForm
                  value={modal.value as Account | undefined}
                  busy={busy}
                  save={(id, v) =>
                    mutate(
                      "/staff" + (id ? "/" + id : ""),
                      v,
                      id ? "PUT" : "POST",
                    )
                  }
                />
              )}
              {modal.type === "customer" && (
                <CustomerForm
                  value={modal.value as Customer | undefined}
                  data={data}
                  busy={busy}
                  save={(id, v) =>
                    mutate(
                      "/customers" + (id ? "/" + id : ""),
                      v,
                      id ? "PUT" : "POST",
                    )
                  }
                />
              )}
              {modal.type === "project" && (
                <ProjectForm
                  value={modal.value as Project | undefined}
                  data={data}
                  busy={busy}
                  save={(id, v) =>
                    mutate(
                      "/projects" + (id ? "/" + id : ""),
                      v,
                      id ? "PUT" : "POST",
                    )
                  }
                />
              )}
              {(modal.type === "connection" || modal.type === "rotate") && (
                <ConnectionForm
                  value={modal.value as Connection | undefined}
                  busy={busy}
                  save={(v) =>
                    modal.type === "rotate"
                      ? mutate("/connections/" + modal.value!.id + "/rotate", v)
                      : mutate("/connections", v)
                  }
                />
              )}
              {(modal.type === "prompt" || modal.type === "version") && (
                <PromptForm
                  key={modal.value!.id}
                  project={
                    modal.type === "prompt"
                      ? (modal.value as Project)
                      : undefined
                  }
                  version={
                    modal.type === "version"
                      ? (modal.value as Prompt)
                      : undefined
                  }
                  busy={busy}
                  save={(v) => mutate("/prompts", v)}
                />
              )}
              {modal.type === "prompt-link" && (
                <PlatformPromptForm
                  key={modal.value!.id}
                  project={modal.value as Project}
                  busy={busy}
                  save={(v) =>
                    mutate("/projects/" + modal.value!.id + "/prompts/link", v)
                  }
                />
              )}
              {modal.type === "password" && (
                <form
                  onSubmit={async (e) => {
                    const f = values(e);
                    setBusy(true);
                    setError("");
                    try {
                      await api("/auth/password", "POST", f, session.csrf);
                      clearSession();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <p>
                    {t("Alle dine aktive sessioner afsluttes efter ændringen.")}
                  </p>
                  <label>
                    {t("Nuværende adgangskode")}{" "}
                    <input
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      maxLength={256}
                      required
                    />
                  </label>
                  <label>
                    {t("Ny adgangskode · mindst 14 tegn")}{" "}
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
                    {t("Ny authenticator-kode")}{" "}
                    <input
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                    />
                  </label>
                  <Save busy={busy} label={t("Skift adgangskode")} />
                </form>
              )}
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
function Login({
  onLogin,
  error: initial,
}: {
  onLogin: (s: Session) => void;
  error: string;
}) {
  const [error, setError] = useState(initial),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Brand />
        <LanguagePicker />
      </div>
      <section className="auth-card">
        <span className="icon-circle">
          <LockKeyIcon size={30} />
        </span>
        <p className="eyebrow">{t("VELKOMMEN TILBAGE")}</p>
        <h1>{t("Dit overblik begynder her.")}</h1>
        <p className="muted">
          {t("Log ind med din personlige konto og authenticator.")}{" "}
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
            <input
              name="email"
              type="text"
              autoComplete="username"
              required
              autoFocus
            />
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
function Setup() {
  const [setup, setSetup] = useState<{
      secret: string;
      uri: string;
      csrf: string;
      identity: { name: string; email: string; username: string } | null;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState("");
  useEffect(() => {
    api<{
      secret: string;
      uri: string;
      csrf: string;
      identity: { name: string; email: string; username: string } | null;
    }>("/setup")
      .then(setSetup)
      .catch(() =>
        setError(
          t(
            "Den private opsætning er kun tilgængelig gennem den lokale forbindelse, før den første administrator er oprettet.",
          ),
        ),
      );
  }, []);
  return (
    <div className="auth-page">
      <Brand />
      <LanguagePicker />
      <section className="auth-card">
        <p className="eyebrow">{t("PRIVAT OPSÆTNING")}</p>
        <h1>{t("Opret din administrator.")}</h1>
        {error && (
          <p role="alert" className="alert">
            {t(error)}
          </p>
        )}
        {done ? (
          <>
            <p role="status" className="notice">
              {t(done)}
            </p>
            <a
              className="button primary"
              href="https://ai.igurl.dk/backoffice/"
            >
              {t("Gå til login")}{" "}
            </a>
          </>
        ) : (
          setup && (
            <>
              <AuthenticatorSetup uri={setup.uri} secret={setup.secret} />
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  const f = new FormData(e.currentTarget);
                  try {
                    const result = await api<{
                      message: string;
                      messageKey: string;
                    }>("/setup", "POST", Object.fromEntries(f), setup.csrf);
                    setSetup(null);
                    setDone(result.messageKey || result.message);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  {t("Dit navn")}{" "}
                  <input
                    name="name"
                    maxLength={100}
                    defaultValue={setup.identity?.name}
                    readOnly={!!setup.identity}
                    required
                    autoFocus
                  />
                </label>
                <label>
                  {t("E-mail")}{" "}
                  <input
                    name="email"
                    type="email"
                    autoComplete="username"
                    defaultValue={setup.identity?.email}
                    readOnly={!!setup.identity}
                    required
                  />
                </label>
                <label>
                  {t("Brugernavn")}{" "}
                  <input
                    name="username"
                    defaultValue={setup.identity?.username}
                    readOnly={!!setup.identity}
                    pattern="[a-z0-9][a-z0-9_.-]{2,39}"
                    minLength={3}
                    maxLength={40}
                    required
                  />
                </label>
                <label>
                  {t("Ny adgangskode · mindst 14 tegn")}{" "}
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
                  {t("Authenticator-kode")}{" "}
                  <input
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                  />
                </label>
                <Save busy={busy} label={t("Opret administrator")} />
              </form>
            </>
          )
        )}
      </section>
    </div>
  );
}
function Toolbar({
  title,
  action,
  onClick,
}: {
  title: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="toolbar">
      <h3>{title}</h3>
      <button className="button primary" onClick={onClick}>
        <PlusIcon size={20} />
        {action}
      </button>
    </div>
  );
}
function Table({
  headings,
  empty,
  children,
}: {
  headings: string[];
  empty?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label={t("Tabel med vandret rulning")}
    >
      <p className="table-hint">{t("Rul til siden for flere kolonner.")}</p>
      <table>
        <thead>
          <tr>
            {headings.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <p className="empty">{empty}</p>}
    </div>
  );
}
function Save({
  busy,
  label = t("Gem ændringer"),
}: {
  busy: boolean;
  label?: string;
}) {
  return (
    <div className="form-actions">
      <button className="button primary" disabled={busy}>
        {busy ? (
          <>
            <ArrowClockwiseIcon size={19} />
            {t("Arbejder…")}{" "}
          </>
        ) : (
          label
        )}
      </button>
    </div>
  );
}
function values(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget)) as Record<
    string,
    string
  >;
}
function CustomerForm({
  value: c,
  data,
  busy,
  save,
}: {
  value?: Customer;
  data: Data;
  busy: boolean;
  save: (id: string | undefined, v: unknown) => Promise<boolean>;
}) {
  const [assignments, setAssignments] = useState(c?.assignments || []);
  return (
    <form
      onSubmit={(e) => {
        const f = values(e);
        save(c?.id, {
          ...f,
          allowance: Number(f.allowance),
          expires: f.expires || null,
          assignments,
        });
      }}
    >
      <div className="form-grid">
        <label>
          {t("Navn")}{" "}
          <input
            name="name"
            defaultValue={c?.name}
            maxLength={100}
            required
            autoFocus
          />
        </label>
        <label>
          {t("E-mail")}{" "}
          <input
            name="email"
            defaultValue={c?.email}
            type="email"
            maxLength={254}
            readOnly={!!c?.account}
            required
          />
        </label>
        <label>
          {t("Invitationssprog")}{" "}
          <select
            name="locale"
            defaultValue={c?.account?.locale || getLanguage()}
          >
            <option value="en">English</option>
            <option value="da">Dansk</option>
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={c?.status || "pending"}>
            <option value="pending">{t("Afventer")}</option>
            <option value="active">{t("Aktiv")}</option>
            <option value="paused">{t("På pause")}</option>
          </select>
        </label>
        <label>
          {t("Svarramme")}{" "}
          <input
            name="allowance"
            type="number"
            min={0}
            max={1000000}
            defaultValue={c?.allowance ?? 300}
            required
          />
        </label>
        <label>
          {t("Adgang til · valgfri dato")}{" "}
          <input name="expires" type="date" defaultValue={c?.expires || ""} />
        </label>
      </div>
      <AssignmentFields
        data={data}
        assignments={assignments}
        setAssignments={setAssignments}
      />
      <p className="footnote">
        {t(
          "En ny kunde får en invitation til at vælge brugernavn og adgangskode og tilknytte en authenticator. Linket udløber efter 48 timer. Eksisterende konti får ikke en ny invitation ved redigering.",
        )}{" "}
      </p>
      <Save busy={busy} />
    </form>
  );
}
function ProjectForm({
  value: p,
  data,
  busy,
  save,
}: {
  value?: Project;
  data: Data;
  busy: boolean;
  save: (id: string | undefined, v: unknown) => Promise<boolean>;
}) {
  return (
    <form
      onSubmit={(e) => {
        const f = values(e);
        save(p?.id, {
          name: f.name,
          description: f.description,
          connectionId: f.connectionId || null,
          enabled: f.enabled === "on",
        });
      }}
    >
      <label>
        {t("Projektnavn")}{" "}
        <input
          name="name"
          defaultValue={p?.name}
          maxLength={80}
          required
          autoFocus
        />
      </label>
      <label>
        {t("Beskrivelse")}{" "}
        <textarea
          name="description"
          defaultValue={p?.description}
          rows={3}
          maxLength={1000}
        />
      </label>
      <label>
        {t("API-forbindelse")}{" "}
        <select name="connectionId" defaultValue={p?.connection_id || ""}>
          <option value="">{t("Vælg senere")}</option>
          {data.connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} · {c.environment === "test" ? "Test" : t("Produktion")}
              {c.enabled ? "" : t(" · på pause")}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={p ? !!p.enabled : true}
        />
        {t("Projektet er aktivt")}{" "}
      </label>
      <p className="footnote">
        {t(
          "Du kan vælge den første forbindelse senere. Et tilknyttet projekt med promptversioner beholder sin OpenAI-forbindelse. Opret et nyt projekt, hvis det skal flyttes til en anden forbindelse.",
        )}{" "}
      </p>
      <Save busy={busy} />
    </form>
  );
}
function ConnectionForm({
  value: c,
  busy,
  save,
}: {
  value?: Connection;
  busy: boolean;
  save: (v: unknown) => Promise<boolean>;
}) {
  const projectInput = useRef<HTMLInputElement>(null);
  const [projectError, setProjectError] = useState("");
  const validProject = (value: string) =>
    /^proj_[A-Za-z0-9_-]{3,100}$/.test(value);
  const projectMessage = (value: string) =>
    value.startsWith("key_")
      ? t("Dette er et nøgle-ID. Indsæt projektets ID, som starter med proj_.")
      : t("Indsæt projektets ID fra OpenAI. Det starter med proj_.");
  return (
    <form
      onSubmit={(e) => {
        const form = e.currentTarget,
          f = values(e);
        if (!c) {
          f.projectRef = f.projectRef.trim();
          if (!validProject(f.projectRef)) {
            setProjectError(projectMessage(f.projectRef));
            projectInput.current?.focus();
            return;
          }
        }
        save(c ? { apiKey: f.apiKey, revision: c.revision } : f).then((ok) => {
          if (ok) form.reset();
        });
      }}
    >
      {c ? (
        <p>
          {t("Ny nøgle til")} <strong>{c.label}</strong> · {c.project_ref}
          {t(". Brug en nøgle fra det samme OpenAI-projekt.")}{" "}
        </p>
      ) : (
        <>
          <label>
            {t("Navn på forbindelsen")}{" "}
            <input
              name="label"
              placeholder={t("F.eks. Helles grønne assistent")}
              maxLength={80}
              required
              autoFocus
            />
          </label>
          <p className="footnote">
            {t("Vi opretter også et projekt i appen med dette navn.")}
          </p>
          <label>
            {t("OpenAI-projekt-ID")}{" "}
            <input
              ref={projectInput}
              name="projectRef"
              placeholder="proj_abc123"
              pattern={"proj_[A-Za-z0-9_\\-]{3,100}"}
              maxLength={105}
              required
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              aria-invalid={!!projectError}
              aria-describedby={
                projectError
                  ? "connection-project-help connection-project-error"
                  : "connection-project-help"
              }
              onChange={() => setProjectError("")}
              onBlur={(e) => {
                e.currentTarget.value = e.currentTarget.value.trim();
              }}
              onInvalid={(e) => {
                e.preventDefault();
                setProjectError(projectMessage(e.currentTarget.value.trim()));
                e.currentTarget.focus();
              }}
            />
          </label>
          <p className="footnote" id="connection-project-help">
            {t(
              "Kopiér projekt-ID'et fra projektets indstillinger i OpenAI. Det starter med proj_.",
            )}{" "}
            <a
              href="https://platform.openai.com/settings/organization/general"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("Åbn OpenAI-indstillinger")}
            </a>
          </p>
          {projectError && (
            <p className="alert" id="connection-project-error" role="alert">
              {projectError}
            </p>
          )}
          <label>
            {t("Miljø")}{" "}
            <select name="environment" defaultValue="test">
              <option value="test">Test</option>
              <option value="production">{t("Produktion")}</option>
            </select>
          </label>
        </>
      )}
      <label>
        {c ? t("Ny API-nøgle") : t("API-nøgle")}
        <input
          name="apiKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          maxLength={512}
          minLength={25}
          placeholder="sk-proj-…"
          required
          data-lpignore="true"
        />
      </label>
      <p className="footnote">
        {t(
          "Indsæt din egen projektnøgle. Den sendes til serveren over den aktuelle forbindelse og gemmes krypteret efter en vellykket kontrol. Nøglen returneres aldrig til browseren. Brug kun nøgler fra den angivne OpenAI-konto og projekt.",
        )}{" "}
      </p>
      <Save
        busy={busy}
        label={c ? t("Kontrollér og udskift") : t("Kontrollér og gem")}
      />
    </form>
  );
}
function PromptForm({
  project,
  version,
  busy,
  save,
}: {
  project?: Project;
  version?: Prompt;
  busy: boolean;
  save: (v: unknown) => Promise<boolean>;
}) {
  const [instructions, setInstructions] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(!!version);
  useEffect(() => {
    if (version)
      api<Prompt & { instructions: string }>("/prompts/" + version.id)
        .then((v) => setInstructions(v.instructions))
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
  }, [version]);
  return (
    <form
      onSubmit={(e) => {
        const f = values(e);
        save({
          projectId: project?.id || version!.project_id,
          promptId: version?.prompt_id || null,
          name: f.name,
          instructions,
          sourceRef: f.sourceRef,
        });
      }}
    >
      <p className="notice">
        {version
          ? t(
              "Gemning opretter en ny, uforanderlig version. Eksisterende tildelinger bevares.",
            )
          : t(
              "Gennemgå instruktionerne, før du gemmer den første version og tildeler den til kunder.",
            )}
      </p>
      {error && (
        <p role="alert" className="alert">
          {t(error)}
        </p>
      )}
      <label>
        {t("Promptnavn")}{" "}
        <input
          name="name"
          defaultValue={version?.name}
          maxLength={80}
          required
          autoFocus
        />
      </label>
      <label>
        {t("Kildereference · valgfri")}{" "}
        <input
          name="sourceRef"
          defaultValue={version?.source_ref}
          maxLength={150}
          placeholder={t("Oprindeligt prompt-ID og version")}
        />
      </label>
      <label>
        {t("Instruktioner")}{" "}
        <textarea
          name="instructions"
          rows={10}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          required
          maxLength={48000}
          disabled={loading || !!error}
        />
      </label>
      <p className="footnote">
        {t(
          "Der er ingen automatisk synkronisering med OpenAI Platform. Kopiér kun instruktioner, du har ret til at bruge. Evaluering mod et godkendt testsæt tilføjes før kundepilot.",
        )}{" "}
      </p>
      <Save busy={busy || loading || !!error} label={t("Gem ny version")} />
    </form>
  );
}
function auditText(action: string) {
  return (
    {
      "staff.created": t("Admin inviteret"),
      "staff.updated": t("Admin opdateret"),
      "staff.workspace_updated": t("Assistenter tildelt"),
      "account.profile_updated": t("Profil opdateret"),
      "staff.disabled": t("Admin deaktiveret"),
      "invitation.created": t("Invitation oprettet"),
      "invitation.queued": t("Invitation afleveret til mailserver"),
      "invitation.failed": t("Invitation mislykkedes"),
      "invitation.revoked": t("Invitation tilbagekaldt"),
      "account.activated": t("Konto aktiveret"),
      "admin.password_changed": t("Adgangskode ændret"),
      "admin.enrolled": t("Administrator oprettet"),
      "admin.login": "Login",
      "admin.logout": t("Log ud"),
      "admin.reauthenticated": t("Adgang bekræftet"),
      "customer.created": t("Kunde oprettet"),
      "customer.updated": t("Kunde opdateret"),
      "project.created": t("Projekt oprettet"),
      "project.updated": t("Projekt opdateret"),
      "prompt.linked": t("OpenAI-prompt tilknyttet"),
      "prompt.version_created": t("Promptversion oprettet"),
      "prompt.viewed": t("Prompt åbnet"),
      "connection.created": t("API-forbindelse tilføjet"),
      "connection.rotated": t("API-nøgle udskiftet"),
      "connection.paused": t("API-forbindelse sat på pause"),
      "connection.updated": t("API-forbindelse opdateret"),
    }[action] ||
    (action.startsWith("connection.checked.")
      ? t("API-forbindelse kontrolleret · ") +
        statusText(action.split(".").at(-1)!)
      : action)
  );
}
function InviteActions({
  accountId,
  invitation,
  busy,
  act,
}: {
  accountId: string;
  invitation: Invitation;
  busy: boolean;
  act: (path: string, v: unknown) => Promise<boolean>;
}) {
  return (
    <div className="invite-actions">
      <small>
        {invitation ? statusText(invitation.status) : t("Ingen invitation")}
      </small>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => act("/invitations/" + accountId + "/resend", {})}
      >
        {t("Send invitation igen")}
      </button>
      {invitation?.status === "sent" && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => act("/invitations/" + accountId + "/revoke", {})}
        >
          {t("Tilbagekald invitation")}
        </button>
      )}
    </div>
  );
}
function StaffForm({
  value: a,
  busy,
  save,
}: {
  value?: Account;
  busy: boolean;
  save: (id: string | undefined, v: unknown) => Promise<boolean>;
}) {
  return (
    <form
      onSubmit={(e) => {
        const f = values(e);
        save(a?.id, f);
      }}
    >
      <label>
        {t("Navn")}
        <input name="name" defaultValue={a?.name} maxLength={100} required />
      </label>
      {!a && (
        <label>
          {t("E-mail")}
          <input name="email" type="email" maxLength={254} required />
        </label>
      )}
      <label>
        {t("Invitationssprog")}
        <select name="locale" defaultValue={a?.locale || getLanguage()}>
          <option value="en">English</option>
          <option value="da">Dansk</option>
        </select>
      </label>
      {a && (
        <label>
          Status
          <select name="status" defaultValue={a.status}>
            {a.status === "pending" ? (
              <option value="pending">{t("Afventer")}</option>
            ) : (
              <>
                <option value="active">{t("Aktiv")}</option>
                <option value="paused">{t("På pause")}</option>
              </>
            )}
          </select>
        </label>
      )}
      <p className="footnote">
        {t(
          "En ny Admin får en personlig invitation og skal vælge sin egen adgangskode og tilknytte en authenticator.",
        )}
      </p>
      <Save busy={busy} label={a ? t("Gem ændringer") : t("Send invitation")} />
    </form>
  );
}
function Registration({ token }: { token: string }) {
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
  return (
    <div className="auth-page">
      <Brand />
      <LanguagePicker />
      <section className="auth-card">
        <p className="eyebrow">{t("DIN PERSONLIGE INVITATION")}</p>
        <h1>{t("Velkommen til Kundetypeassistent")}</h1>
        {done ? (
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
                  await api("/register/complete", "POST", f, details.csrf);
                  setDetails(null);
                  setDone(true);
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

function AssignmentFields({
  data,
  assignments,
  setAssignments,
}: {
  data: Data;
  assignments: { projectId: string; versionId: string }[];
  setAssignments: React.Dispatch<
    React.SetStateAction<{ projectId: string; versionId: string }[]>
  >;
}) {
  return (
    <fieldset>
      <legend>{t("Projekter og promptversioner")}</legend>
      {data.projects.map((p) => {
        const selected = assignments.find((a) => a.projectId === p.id),
          versions = data.prompts.filter((v) => v.project_id === p.id);
        return (
          <div className="assignment" key={p.id}>
            <label className="check">
              <input
                type="checkbox"
                checked={!!selected}
                disabled={!versions.length}
                onChange={(e) =>
                  setAssignments((previous) =>
                    e.target.checked
                      ? [
                          ...previous,
                          { projectId: p.id, versionId: versions[0].id },
                        ]
                      : previous.filter((a) => a.projectId !== p.id),
                  )
                }
              />
              {p.name}
              {!p.enabled ? t(" · på pause") : ""}
            </label>
            {selected ? (
              <select
                aria-label={t("Prompt til ") + p.name}
                value={selected.versionId}
                onChange={(e) =>
                  setAssignments((previous) =>
                    previous.map((a) =>
                      a.projectId === p.id
                        ? { ...a, versionId: e.target.value }
                        : a,
                    ),
                  )
                }
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ·{" "}
                    {v.source_kind === "platform"
                      ? t("OpenAI-standardversion")
                      : "v" + v.version}
                  </option>
                ))}
              </select>
            ) : (
              <small>
                {versions.length
                  ? t("Ikke tildelt")
                  : t("Tilføj først en prompt")}
              </small>
            )}
          </div>
        );
      })}
      {!data.projects.length && (
        <p className="muted">
          {t("Opret projekter og promptversioner for at tildele adgang.")}{" "}
        </p>
      )}
    </fieldset>
  );
}
function StaffWorkspaceForm({
  account,
  data,
  busy,
  save,
}: {
  account: Account;
  data: Data;
  busy: boolean;
  save: (v: unknown) => Promise<boolean>;
}) {
  const [assignments, setAssignments] = useState(account.assignments || []);
  return (
    <form
      onSubmit={(e) => {
        const f = values(e);
        void save({ allowance: Number(f.allowance), assignments });
      }}
    >
      <p>
        <strong>{account.name}</strong> · {account.email}
      </p>
      <p>
        {t(
          "Admin bruger sit eget private arbejdsrum. Tildelingen giver ikke adgang til andres samtaler.",
        )}
      </p>
      <label>
        {t("Svarramme")}
        <input
          name="allowance"
          type="number"
          min={0}
          max={1000000}
          defaultValue={account.allowance ?? 0}
          required
        />
      </label>
      <AssignmentFields
        data={data}
        assignments={assignments}
        setAssignments={setAssignments}
      />
      <Save busy={busy} />
    </form>
  );
}
