import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
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
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "./style.css";

type Session = { name: string; email: string; csrf: string };
type Customer = {
  id: string;
  name: string;
  email: string;
  status: string;
  expires: string | null;
  allowance: number;
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
};
const empty: Data = {
  customers: [],
  connections: [],
  projects: [],
  prompts: [],
  audit: [],
};
const tabs = [
  { id: "overview", label: "Overblik", icon: SquaresFourIcon },
  { id: "customers", label: "Kunder", icon: UsersIcon },
  { id: "projects", label: "Projekter og prompter", icon: FoldersIcon },
  { id: "connections", label: "API-forbindelser", icon: KeyIcon },
  { id: "audit", label: "Aktivitetslog", icon: ScrollIcon },
];
const statusText = (s: string) =>
  ({
    ok: "Kontrolleret",
    invalid: "Nøgle afvist",
    restricted: "Adgang mangler",
    rate_limited: "Midlertidigt begrænset",
    error: "Kontrol mislykkedes",
    unchecked: "Ikke kontrolleret",
    pending: "Afventer",
    active: "Aktiv",
    paused: "På pause",
  })[s] || s;
const date = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat("da-DK", {
        dateStyle: "medium",
        ...(s.includes("T") ? { timeStyle: "short" } : {}),
      }).format(new Date(s))
    : "—";
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  csrf?: string,
): Promise<T> {
  const response = await fetch("/backoffice/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.message || "Handlingen kunne ikke gennemføres.",
    );
  return data;
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">AI</span>
      <div>
        <strong>Kundetypeassistent</strong>
        <span>Administration</span>
      </div>
    </div>
  );
}
function App() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("overview");
  const [data, setData] = useState<Data>(empty),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<{
    type: string;
    value?: Customer | Project | Connection | Prompt;
  } | null>(null);
  const setup = new URLSearchParams(location.search).get("setup") === "1";
  useEffect(() => {
    if (!setup)
      api<Session>("/auth/session")
        .then(setSession)
        .catch((e) => {
          if (e.status !== 401) setError(e.message);
        })
        .finally(() => setLoading(false));
  }, [setup]);
  async function reload() {
    const [customers, connections, projects, prompts, audit] =
      await Promise.all([
        api<Customer[]>("/customers"),
        api<Connection[]>("/connections"),
        api<Project[]>("/projects"),
        api<Prompt[]>("/prompts"),
        api<Audit[]>("/audit"),
      ]);
    setData({ customers, connections, projects, prompts, audit });
  }
  useEffect(() => {
    if (session)
      reload().catch((e) => {
        setError(e.message);
        if (e.status === 401) {
          setSession(null);
          setData(empty);
        }
      });
  }, [session]);
  async function mutate(
    path: string,
    body: unknown,
    method = "POST",
    message = "Ændringerne er gemt.",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ message?: string }>(
        path,
        method,
        body,
        session?.csrf,
      );
      await reload();
      setNotice(result?.message || message);
      setModal(null);
      return true;
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      if (err.status === 401 && path !== "/auth/reauth") {
        setSession(null);
        setData(empty);
        setModal(null);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (setup) return <Setup />;
  if (loading)
    return (
      <div className="auth-page">
        <p role="status">Åbner administrationen…</p>
      </div>
    );
  if (!session) return <Login onLogin={setSession} error={error} />;
  const selected = tabs.find((t) => t.id === tab)!;
  const navigate = (id: string) => {
    setTab(id);
    setError("");
    setNotice("");
  };
  return (
    <div className="shell">
      <aside>
        <Brand />
        <p className="nav-label">DIT ARBEJDSRUM</p>
        <nav aria-label="Administration">
          {tabs.map((t) => (
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
          <div className="admin-person">
            <span>{session.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{session.name}</strong>
              <small>Administrator · MFA</small>
            </div>
          </div>
          <button onClick={() => setModal({ type: "password" })}>
            Skift adgangskode
          </button>
          <button
            onClick={async () => {
              setBusy(true);
              try {
                await api("/auth/logout", "POST", {}, session.csrf);
                setSession(null);
                setData(empty);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            <SignOutIcon size={20} />
            Log ud
          </button>
        </div>
      </aside>
      <div className="main">
        <header>
          <div>
            <p className="eyebrow">AI · KUNDETYPEASSISTENT</p>
            <h1>{selected.label}</h1>
          </div>
          <button
            className="button secondary"
            onClick={() => setModal({ type: "reauth" })}
          >
            <ShieldCheckIcon size={19} />
            Bekræft adgang
          </button>
        </header>
        <main>
          <div className="intro">
            <span className="eyebrow">ET ROLIGT OVERBLIK</span>
            <h2>
              {tab === "overview"
                ? "Plads til det, der er vigtigt."
                : tab === "customers"
                  ? "Menneskene bag samtalerne"
                  : tab === "projects"
                    ? "Den rette assistent til hver kunde"
                    : tab === "connections"
                      ? "Dine forbindelser til OpenAI"
                      : "Et spor af vigtige ændringer"}
            </h2>
            <p>
              {tab === "overview"
                ? "Administrér dine kunder, projekter og forbindelser ét sted."
                : tab === "customers"
                  ? "Styr adgang, projekttildelinger og svarrammer. Private kundesamtaler vises ikke her."
                  : tab === "projects"
                    ? "Opret projekter og gem gennemgåede promptversioner, som du kan tildele dine kunder."
                    : tab === "connections"
                      ? "Tilføj en projektnøgle, kontrollér forbindelsen, og vælg den i dit app-projekt."
                      : "Her ser du login og administrative handlinger. Nøgler, adgangskoder og beskedindhold indgår ikke."}
            </p>
          </div>
          {error && !modal && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          {tab === "overview" && (
            <>
              <div className="metrics">
                {[
                  {
                    title: "Kunder",
                    n: data.customers.length,
                    id: "customers",
                  },
                  {
                    title: "Projekter",
                    n: data.projects.length,
                    id: "projects",
                  },
                  {
                    title: "API-forbindelser",
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
                <h3>Kom godt i gang</h3>
                <p>
                  Forbind OpenAI, opret et projekt og tilføj din første kunde.
                </p>
                <div className="steps">
                  <button onClick={() => navigate("connections")}>
                    <b>01</b>
                    <span>
                      Tilføj en API-forbindelse
                      <small>Du ejer nøglerne og vælger selv projekt.</small>
                    </span>
                    <ArrowRightIcon size={21} />
                  </button>
                  <button onClick={() => navigate("projects")}>
                    <b>02</b>
                    <span>
                      Opret projekt og prompt
                      <small>
                        Gem en gennemgået version af instruktionerne.
                      </small>
                    </span>
                    <ArrowRightIcon size={21} />
                  </button>
                  <button onClick={() => navigate("customers")}>
                    <b>03</b>
                    <span>
                      Opret og tildel kunder
                      <small>
                        Vælg adgang og den rette prompt til hver kunde.
                      </small>
                    </span>
                    <ArrowRightIcon size={21} />
                  </button>
                </div>
              </section>
              <p className="footnote">
                Denne første backoffice-version gemmer rigtige
                administrationsdata. Kundelogin, live AI-chat, betaling og
                automatisk e-mail er næste byggeetaper.
              </p>
            </>
          )}
          {tab === "customers" && (
            <>
              <Toolbar
                title="Dine kunder"
                action="Tilføj kunde"
                onClick={() => setModal({ type: "customer" })}
              />
              <Table
                headings={[
                  "Kunde",
                  "Status",
                  "Projekter",
                  "Svarramme",
                  "Adgang til",
                  "Handling",
                ]}
                empty={
                  !data.customers.length
                    ? "Ingen kunder endnu. Tilføj den første kunde for at komme i gang."
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
                    <td>{c.expires ? date(c.expires) : "Ingen udløbsdato"}</td>
                    <td>
                      <button
                        className="text-button"
                        aria-label={"Administrér " + c.name}
                        onClick={() => setModal({ type: "customer", value: c })}
                      >
                        Administrér
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
              <p className="footnote">
                Oprettelse sender ingen invitation endnu. En svarramme er en
                indstilling; faktisk forbrug og håndhævelse tilføjes sammen med
                AI-chatten.
              </p>
            </>
          )}
          {tab === "connections" && (
            <>
              <div className="security-note">
                <LockKeyIcon size={23} />
                <p>
                  <strong>Nøglen er kun synlig, når du tilføjer den.</strong>
                  <br />
                  Efter gemning vises kun de sidste fire tegn. Udskiftning
                  kontrollerer den nye nøgle, før den gamle erstattes.
                </p>
              </div>
              <Toolbar
                title="API-forbindelser"
                action="Tilføj forbindelse"
                onClick={() => setModal({ type: "connection" })}
              />
              <Table
                headings={[
                  "Forbindelse",
                  "Nøgle",
                  "Status",
                  "Seneste kontrol",
                  "Handlinger",
                ]}
                empty={
                  !data.connections.length
                    ? "Ingen forbindelser endnu. Tilføj din første OpenAI-projektnøgle."
                    : undefined
                }
              >
                {data.connections.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.label}</strong>
                      <small>
                        {c.project_ref} ·{" "}
                        {c.environment === "test" ? "Test" : "Produktion"}
                      </small>
                    </td>
                    <td>
                      <code>•••• {c.suffix}</code>
                      <small>Version {c.revision}</small>
                    </td>
                    <td>
                      <span className="pill">
                        {c.enabled ? statusText(c.status) : "På pause"}
                      </span>
                    </td>
                    <td>{date(c.last_checked)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          disabled={busy || !c.enabled}
                          className="text-button"
                          onClick={() =>
                            mutate("/connections/" + c.id + "/check", {})
                          }
                        >
                          Kontrollér
                        </button>
                        <button
                          disabled={busy}
                          className="text-button"
                          onClick={() => setModal({ type: "rotate", value: c })}
                        >
                          Udskift nøgle
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
                                ? "Forbindelsen er sat på pause."
                                : "Forbindelsen er aktiveret.",
                            )
                          }
                        >
                          {c.enabled ? "Sæt på pause" : "Aktivér"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
              <p className="footnote">
                Kontrollen afprøver adgang til OpenAI-modellisten. Den bekræfter
                ikke alle modelrettigheder, kreditbalance eller adgang til et
                promptbibliotek. Prompter tilføjes særskilt under projekter.
              </p>
            </>
          )}
          {tab === "projects" && (
            <>
              <Toolbar
                title="Dine projekter"
                action="Tilføj projekt"
                onClick={() => setModal({ type: "project" })}
              />
              {!data.projects.length && (
                <div className="empty">
                  Ingen projekter endnu. Opret et projekt, og vælg eventuelt en
                  API-forbindelse.
                </div>
              )}
              <div className="project-cards">
                {data.projects.map((p) => (
                  <section className="project-card" key={p.id}>
                    <div className="card-heading">
                      <div>
                        <h3>{p.name}</h3>
                        <span className="pill">
                          {p.enabled ? "Aktivt" : "På pause"}
                        </span>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setModal({ type: "project", value: p })}
                      >
                        Redigér
                      </button>
                    </div>
                    <p>{p.description || "Ingen beskrivelse tilføjet."}</p>
                    <p className="connection-label">
                      <KeyIcon size={18} />
                      {data.connections.find((c) => c.id === p.connection_id)
                        ?.label || "Ingen API-forbindelse valgt"}
                    </p>
                    <div className="prompt-heading">
                      <h4>Promptversioner</h4>
                      <button
                        className="text-button"
                        onClick={() => setModal({ type: "prompt", value: p })}
                      >
                        <PlusIcon size={17} />
                        Tilføj prompt
                      </button>
                    </div>
                    {data.prompts
                      .filter((v) => v.project_id === p.id)
                      .map((v) => (
                        <div className="prompt-row" key={v.id}>
                          <span>
                            <strong>{v.name}</strong>
                            <small>
                              v{v.version}
                              {v.source_ref ? " · " + v.source_ref : ""}
                            </small>
                          </span>
                          <button
                            className="text-button"
                            onClick={() =>
                              setModal({ type: "version", value: v })
                            }
                          >
                            Se / ny version
                          </button>
                        </div>
                      ))}
                    {!data.prompts.some((v) => v.project_id === p.id) && (
                      <p className="muted">
                        Tilføj den første prompt, før projektet tildeles en
                        kunde.
                      </p>
                    )}
                  </section>
                ))}
              </div>
              <p className="footnote">
                Kopiér godkendte instruktioner fra OpenAI Platform, eller skriv
                dem her. Promptindhold hentes ikke automatisk via en API-nøgle.
                Nye versioner ændrer ikke eksisterende kundetildelinger.
              </p>
            </>
          )}
          {tab === "audit" && (
            <Table
              headings={["Tidspunkt", "Administrator", "Handling", "Reference"]}
              empty={
                !data.audit.length ? "Ingen aktiviteter endnu." : undefined
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
          Adgang med authenticator · Private kundesamtaler indgår ikke
        </footer>
      </div>
      {modal && (
        <Dialog
          title={
            modal.type === "customer"
              ? modal.value
                ? "Administrér kunde"
                : "Tilføj kunde"
              : modal.type === "project"
                ? modal.value
                  ? "Redigér projekt"
                  : "Tilføj projekt"
                : modal.type === "connection"
                  ? "Tilføj API-forbindelse"
                  : modal.type === "rotate"
                    ? "Udskift API-nøgle"
                    : modal.type === "password"
                      ? "Skift adgangskode"
                      : modal.type === "reauth"
                        ? "Bekræft din adgang"
                        : "Prompt og instruktioner"
          }
          onClose={() => {
            if (!busy) {
              setModal(null);
              setError("");
            }
          }}
        >
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
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
                modal.type === "prompt" ? (modal.value as Project) : undefined
              }
              version={
                modal.type === "version" ? (modal.value as Prompt) : undefined
              }
              busy={busy}
              save={(v) => mutate("/prompts", v)}
            />
          )}
          {modal.type === "reauth" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                mutate(
                  "/auth/reauth",
                  { code: f.get("code") },
                  "POST",
                  "Adgangen er bekræftet i ti minutter.",
                );
              }}
            >
              <p>
                Brug en ny kode fra din authenticator før ændringer af
                API-nøgler.
              </p>
              <label>
                Authenticator-kode
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                />
              </label>
              <Save busy={busy} label="Bekræft adgang" />
            </form>
          )}
          {modal.type === "password" && (
            <form
              onSubmit={async (e) => {
                const f = values(e);
                setBusy(true);
                setError("");
                try {
                  await api("/auth/password", "POST", f, session.csrf);
                  setModal(null);
                  setSession(null);
                  setData(empty);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p>Alle dine aktive sessioner afsluttes efter ændringen.</p>
              <label>
                Nuværende adgangskode
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  maxLength={256}
                  required
                />
              </label>
              <label>
                Ny adgangskode · mindst 14 tegn
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
                Ny authenticator-kode
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
              </label>
              <Save busy={busy} label="Skift adgangskode" />
            </form>
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
      </div>
      <section className="auth-card">
        <span className="icon-circle">
          <LockKeyIcon size={30} />
        </span>
        <p className="eyebrow">VELKOMMEN TILBAGE</p>
        <h1>Dit overblik begynder her.</h1>
        <p className="muted">
          Log ind for at administrere kunder, projekter og API-forbindelser.
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
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
            />
          </label>
          <label>
            Adgangskode
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={256}
              required
            />
          </label>
          <label>
            Authenticator-kode
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              placeholder="6 cifre"
            />
          </label>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <Save busy={busy} label="Log ind" />
        </form>
        <p className="footnote">
          Kun for administratorer. Adgang kræver en personlig konto og
          authenticator. Første konto oprettes gennem den private opsætning.
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
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState("");
  useEffect(() => {
    api<{ secret: string; uri: string; csrf: string }>("/setup")
      .then(setSetup)
      .catch(() =>
        setError(
          "Den private opsætning er kun tilgængelig gennem den lokale forbindelse, før den første administrator er oprettet.",
        ),
      );
  }, []);
  return (
    <div className="auth-page">
      <Brand />
      <section className="auth-card">
        <p className="eyebrow">PRIVAT OPSÆTNING</p>
        <h1>Opret din administrator.</h1>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {done ? (
          <>
            <p role="status" className="notice">
              {done}
            </p>
            <a
              className="button primary"
              href="https://ai.igurl.dk/backoffice/"
            >
              Gå til login
            </a>
          </>
        ) : (
          setup && (
            <>
              <p>
                Tilføj først denne opsætningsnøgle manuelt i din authenticator
                som en tidsbaseret kode. Gem den i din godkendte adgangskodeboks
                til gendannelse.
              </p>
              <code className="setup-secret">{setup.secret}</code>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  const f = new FormData(e.currentTarget);
                  try {
                    const result = await api<{ message: string }>(
                      "/setup",
                      "POST",
                      Object.fromEntries(f),
                      setup.csrf,
                    );
                    setSetup(null);
                    setDone(result.message);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Dit navn
                  <input name="name" maxLength={100} required autoFocus />
                </label>
                <label>
                  E-mail
                  <input
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                  />
                </label>
                <label>
                  Ny adgangskode · mindst 14 tegn
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
                  Authenticator-kode
                  <input
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                  />
                </label>
                <Save busy={busy} label="Opret administrator" />
              </form>
            </>
          )
        )}
      </section>
    </div>
  );
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button aria-label="Luk" className="icon-button" onClick={onClose}>
          <XIcon size={24} />
        </button>
      </div>
      {children}
    </dialog>
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
    <div className="table-scroll">
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
  label = "Gem ændringer",
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
            Arbejder…
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
          Navn
          <input
            name="name"
            defaultValue={c?.name}
            maxLength={100}
            required
            autoFocus
          />
        </label>
        <label>
          E-mail
          <input
            name="email"
            defaultValue={c?.email}
            type="email"
            maxLength={254}
            required
          />
        </label>
        <label>
          Status
          <select name="status" defaultValue={c?.status || "pending"}>
            <option value="pending">Afventer</option>
            <option value="active">Aktiv</option>
            <option value="paused">På pause</option>
          </select>
        </label>
        <label>
          Svarramme
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
          Adgang til · valgfri dato
          <input name="expires" type="date" defaultValue={c?.expires || ""} />
        </label>
      </div>
      <fieldset>
        <legend>Projekter og promptversioner</legend>
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
                {!p.enabled ? " · på pause" : ""}
              </label>
              {selected ? (
                <select
                  aria-label={"Prompt til " + p.name}
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
                      {v.name} · v{v.version}
                    </option>
                  ))}
                </select>
              ) : (
                <small>
                  {versions.length ? "Ikke tildelt" : "Tilføj først en prompt"}
                </small>
              )}
            </div>
          );
        })}
        {!data.projects.length && (
          <p className="muted">
            Opret projekter og promptversioner for at tildele adgang.
          </p>
        )}
      </fieldset>
      <p className="footnote">
        Kontoen gemmes uden at sende e-mail. Kundelogin og invitationslevering
        følger i næste etape.
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
        Projektnavn
        <input
          name="name"
          defaultValue={p?.name}
          maxLength={80}
          required
          autoFocus
        />
      </label>
      <label>
        Beskrivelse
        <textarea
          name="description"
          defaultValue={p?.description}
          rows={3}
          maxLength={1000}
        />
      </label>
      <label>
        API-forbindelse
        <select name="connectionId" defaultValue={p?.connection_id || ""}>
          <option value="">Vælg senere</option>
          {data.connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} · {c.environment === "test" ? "Test" : "Produktion"}
              {c.enabled ? "" : " · på pause"}
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
        Projektet er aktivt
      </label>
      <p className="footnote">
        Et projekt med promptversioner beholder sin OpenAI-forbindelse. Opret et
        nyt projekt, hvis det skal flyttes til en anden forbindelse.
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
  return (
    <form
      onSubmit={(e) => {
        const form = e.currentTarget,
          f = values(e);
        save(c ? { apiKey: f.apiKey, revision: c.revision } : f).then((ok) => {
          if (ok) form.reset();
        });
      }}
    >
      {c ? (
        <p>
          Ny nøgle til <strong>{c.label}</strong> · {c.project_ref}. Brug en
          nøgle fra det samme OpenAI-projekt.
        </p>
      ) : (
        <>
          <label>
            Navn på forbindelsen
            <input
              name="label"
              placeholder="F.eks. Helles grønne assistent"
              maxLength={80}
              required
              autoFocus
            />
          </label>
          <label>
            OpenAI-projekt-ID
            <input
              name="projectRef"
              placeholder="proj_…"
              pattern="proj_[A-Za-z0-9_-]{3,100}"
              maxLength={105}
              required
            />
          </label>
          <label>
            Miljø
            <select name="environment" defaultValue="test">
              <option value="test">Test</option>
              <option value="production">Produktion</option>
            </select>
          </label>
        </>
      )}
      <label>
        {c ? "Ny API-nøgle" : "API-nøgle"}
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
        Indsæt din egen projektnøgle. Den sendes til serveren over den aktuelle
        forbindelse og gemmes krypteret efter en vellykket kontrol. Nøglen
        returneres aldrig til browseren. Brug kun nøgler fra den angivne
        OpenAI-konto og projekt.
      </p>
      <Save
        busy={busy}
        label={c ? "Kontrollér og udskift" : "Kontrollér og gem"}
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
          ? "Gemning opretter en ny, uforanderlig version. Eksisterende tildelinger bevares."
          : "Gennemgå instruktionerne, før du gemmer den første version og tildeler den til kunder."}
      </p>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <label>
        Promptnavn
        <input
          name="name"
          defaultValue={version?.name}
          maxLength={80}
          required
          autoFocus
        />
      </label>
      <label>
        Kildereference · valgfri
        <input
          name="sourceRef"
          defaultValue={version?.source_ref}
          maxLength={150}
          placeholder="Oprindeligt prompt-ID og version"
        />
      </label>
      <label>
        Instruktioner
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
        Der er ingen automatisk synkronisering med OpenAI Platform. Kopiér kun
        instruktioner, du har ret til at bruge. Evaluering mod et godkendt
        testsæt tilføjes før kundepilot.
      </p>
      <Save busy={busy || loading || !!error} label="Gem ny version" />
    </form>
  );
}
function auditText(action: string) {
  return (
    {
      "admin.enrolled": "Administrator oprettet",
      "admin.login": "Login",
      "admin.logout": "Log ud",
      "admin.reauthenticated": "Adgang bekræftet",
      "customer.created": "Kunde oprettet",
      "customer.updated": "Kunde opdateret",
      "project.created": "Projekt oprettet",
      "project.updated": "Projekt opdateret",
      "prompt.version_created": "Promptversion oprettet",
      "prompt.viewed": "Prompt åbnet",
      "connection.created": "API-forbindelse tilføjet",
      "connection.rotated": "API-nøgle udskiftet",
      "connection.paused": "API-forbindelse sat på pause",
      "connection.updated": "API-forbindelse opdateret",
    }[action] ||
    (action.startsWith("connection.checked.")
      ? "API-forbindelse kontrolleret · " +
        statusText(action.split(".").at(-1)!)
      : action)
  );
}
createRoot(document.getElementById("root")!).render(<App />);
