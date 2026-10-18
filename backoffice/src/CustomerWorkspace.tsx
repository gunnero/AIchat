import {
  lazy,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  PlusIcon,
  LockKeyIcon,
  SignOutIcon,
  ListIcon,
  XIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  TrashIcon,
  ArrowUpIcon,
  ChatCircleIcon,
  ArrowClockwiseIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
} from "@phosphor-icons/react";
import { api, type Session } from "./client";
import { t, useLanguage, LanguagePicker, getLanguage } from "./i18n";
import "./customer.css";
import { Deferred } from "./Deferred";
const AccountDialog = lazy(() =>
  import("./AccountPanel").then((m) => ({ default: m.AccountDialog })),
);
import {
  projectColor,
  projectColorStyle,
  type ProjectColor,
} from "./project-colors";

type Project = {
  id: string;
  name: string;
  description: string;
  color?: ProjectColor;
};
type Conversation = {
  id: string;
  projectId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  writable: boolean;
};
type Message = {
  id: string;
  requestId: string;
  role: "user";
  sequence: number;
  text: string;
  createdAt: number;
};
type Page = { items: Conversation[]; nextCursor: string | null };
type Messages = { items: Message[]; before: number | null };
const path = (p: string, c?: string) =>
  `/customer/projects/${p}/conversations${c ? "/" + c : ""}`;

function Dialog({
  children,
  close,
  title,
}: {
  children: ReactNode;
  close: () => void;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="cw-dialog" aria-label={title} onCancel={close}>
      <div className="cw-dialog-heading">
        <h2>{title}</h2>
        <button type="button" onClick={close} aria-label={t("Luk")}>
          <XIcon size={24} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function CustomerWorkspace({
  session,
  logout,
  onNameChange,
}: {
  session: Session;
  logout: () => void;
  onNameChange?: (name: string) => void;
}) {
  useLanguage();
  const [projects, setProjects] = useState<Project[] | null>(null),
    [projectId, setProjectId] = useState(""),
    [chatId, setChatId] = useState("");
  const [items, setItems] = useState<Conversation[]>([]),
    [next, setNext] = useState<string | null>(null),
    [listBusy, setListBusy] = useState(false);
  const [chat, setChat] = useState<Conversation | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [before, setBefore] = useState<number | null>(null),
    [chatBusy, setChatBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [homeError, setHomeError] = useState(false),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState("");
  const [draft, setDraft] = useState(""),
    [saving, setSaving] = useState(false),
    [refresh, setRefresh] = useState(0),
    [chatRefresh, setChatRefresh] = useState(0);
  const [drawer, setDrawer] = useState(false),
    [modal, setModal] = useState<"rename" | "delete" | null>(null),
    [rename, setRename] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const active = useRef(true),
    selection = useRef(""),
    listTicket = useRef(0),
    chatTicket = useRef(0),
    homeTicket = useRef(0),
    busyRef = useRef(false);
  const drafts = useRef(new Map<string, string>()),
    pending = useRef(new Map<string, { text: string; requestId: string }>()),
    creates = useRef(new Map<string, string>());
  const bottom = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    drawerRef = useRef<HTMLDialogElement>(null);
  const key = projectId + ":" + chatId;
  selection.current = key;
  const project = projects?.find((p) => p.id === projectId);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      drafts.current.clear();
      pending.current.clear();
      creates.current.clear();
      selection.current = "";
      listTicket.current++;
      chatTicket.current++;
      homeTicket.current++;
    };
  }, []);
  function switchTo(p: string, c = "") {
    if (p !== selection.current.split(":")[0]) {
      listTicket.current++;
      setListBusy(false);
    }
    selection.current = p + ":" + c;
    chatTicket.current++;
    setChatBusy(false);
    setProjectId(p);
    setChatId(c);
    setChat(null);
    setMessages([]);
    setBefore(null);
    setError("");
    setNotice("");
    setModal(null);
    setDrawer(false);
    setDraft(drafts.current.get(p + ":" + c) || "");
    if (p !== projectId) {
      setSearch("");
      setQuery("");
      setItems([]);
      setNext(null);
    }
  }
  async function loadProjects() {
    const ticket = ++homeTicket.current;
    try {
      const result = await api<{ projects: Project[] }>("/customer/projects");
      if (!active.current || ticket !== homeTicket.current) return;
      setProjects(result.projects);
      setHomeError(false);
      const selected = selection.current.split(":")[0];
      if (!result.projects.some((p) => p.id === selected)) {
        drafts.current.clear();
        pending.current.clear();
        creates.current.clear();
        switchTo(result.projects[0]?.id || "");
      }
    } catch (e) {
      if (active.current && ticket === homeTicket.current) {
        setError((e as Error).message);
        setHomeError(true);
        setProjects(null);
        setItems([]);
        setMessages([]);
        setChat(null);
      }
    }
  }
  useEffect(() => {
    void loadProjects();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadProjects();
    }, 30000);
    const focus = () => {
      void loadProjects();
      setChatRefresh((v) => v + 1);
      setRefresh((v) => v + 1);
    };
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (drawer) drawerRef.current?.showModal();
    else drawerRef.current?.close();
  }, [drawer]);
  const date = (time: number) =>
    new Intl.DateTimeFormat(getLanguage() === "en" ? "en-GB" : "da-DK", {
      dateStyle: "medium",
    }).format(time);
  async function loadList(cursor?: string) {
    if (!projectId) return;
    const ticket = ++listTicket.current,
      p = projectId;
    setListBusy(true);
    if (!cursor) {
      setItems([]);
      setNext(null);
    }
    try {
      const params = new URLSearchParams({
        q: query,
        ...(cursor ? { cursor } : {}),
      });
      const result = await api<Page>(path(p) + "?" + params);
      if (
        !active.current ||
        ticket !== listTicket.current ||
        selection.current.split(":")[0] !== p
      )
        return;
      setItems((previous) =>
        cursor
          ? [
              ...previous,
              ...result.items.filter(
                (i) => !previous.some((old) => old.id === i.id),
              ),
            ]
          : result.items,
      );
      setNext(result.nextCursor);
    } catch (e) {
      if (active.current && ticket === listTicket.current) {
        setError((e as Error).message);
        void loadProjects();
      }
    } finally {
      if (active.current && ticket === listTicket.current) setListBusy(false);
    }
  }
  useEffect(() => {
    void loadList();
  }, [projectId, query, refresh]);
  async function loadChat(older = false) {
    if (!chatId) return;
    const ticket = ++chatTicket.current,
      expected = key;
    setChatBusy(true);
    try {
      const [meta, page] = await Promise.all([
        api<Conversation>(path(projectId, chatId)),
        api<Messages>(
          path(projectId, chatId) +
            `/messages${older && before ? "?before=" + before : ""}`,
        ),
      ]);
      if (
        !active.current ||
        ticket !== chatTicket.current ||
        selection.current !== expected
      )
        return;
      setChat(meta);
      setMessages((previous) =>
        older
          ? [
              ...page.items.filter(
                (m) => !previous.some((old) => old.id === m.id),
              ),
              ...previous,
            ]
          : page.items,
      );
      setBefore(page.before);
      if (!older)
        setTimeout(() => bottom.current?.scrollIntoView({ block: "end" }), 0);
    } catch (e) {
      if (active.current && ticket === chatTicket.current) {
        setError((e as Error).message);
        setChat(null);
        setMessages([]);
        void loadProjects();
      }
    } finally {
      if (active.current && ticket === chatTicket.current) setChatBusy(false);
    }
  }
  useEffect(() => {
    void loadChat();
  }, [projectId, chatId, chatRefresh]);
  async function newChat() {
    if (!projectId || busyRef.current) return;
    const expected = key,
      p = projectId;
    busyRef.current = true;
    setSaving(true);
    setError("");
    const requestId = creates.current.get(p) || crypto.randomUUID();
    creates.current.set(p, requestId);
    try {
      const created = await api<Conversation>(
        path(p),
        "POST",
        { requestId },
        session.csrf,
      );
      if (!active.current || selection.current !== expected) return;
      creates.current.delete(p);
      switchTo(p, created.id);
      setRefresh((v) => v + 1);
    } catch (e) {
      if (active.current && selection.current === expected)
        setError((e as Error).message);
    } finally {
      busyRef.current = false;
      if (active.current) setSaving(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !chat?.writable || busyRef.current) return;
    const expected = key,
      text = draft.trim();
    let request = pending.current.get(expected);
    if (!request || request.text !== text) {
      request = { text, requestId: crypto.randomUUID() };
      pending.current.set(expected, request);
    }
    busyRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<Message>(
        path(projectId, chatId) + "/messages",
        "POST",
        request,
        session.csrf,
      );
      if (!active.current || selection.current !== expected) return;
      setMessages((previous) =>
        previous.some((m) => m.id === saved.id)
          ? previous
          : [...previous, saved].sort((a, b) => a.sequence - b.sequence),
      );
      drafts.current.delete(expected);
      pending.current.delete(expected);
      setDraft("");
      setNotice(t("Beskeden er gemt."));
      setRefresh((v) => v + 1);
      setChatRefresh((v) => v + 1);
      composer.current?.focus();
    } catch (e) {
      if (active.current && selection.current === expected) {
        setError((e as Error).message);
        setChatRefresh((v) => v + 1);
      }
    } finally {
      busyRef.current = false;
      if (active.current) setSaving(false);
    }
  }
  async function manage(e: FormEvent) {
    e.preventDefault();
    if (!chat || busyRef.current) return;
    const expected = key;
    busyRef.current = true;
    setSaving(true);
    setError("");
    try {
      if (modal === "rename") {
        const updated = await api<Conversation>(
          path(projectId, chatId),
          "PATCH",
          { title: rename },
          session.csrf,
        );
        if (active.current && selection.current === expected) {
          setChat(updated);
          setModal(null);
          setRefresh((v) => v + 1);
        }
      } else {
        await api(path(projectId, chatId), "DELETE", {}, session.csrf);
        if (active.current && selection.current === expected) {
          drafts.current.delete(key);
          pending.current.delete(key);
          switchTo(projectId);
          setRefresh((v) => v + 1);
        }
      }
    } catch (e) {
      if (active.current && selection.current === expected)
        setError((e as Error).message);
    } finally {
      busyRef.current = false;
      if (active.current) setSaving(false);
    }
  }
  async function signOut() {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      await api("/auth/logout", "POST", {}, session.csrf);
      logout();
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      busyRef.current = false;
      if (active.current) setSaving(false);
    }
  }
  const sidebar = (
    <>
      <div className="cw-brand">
        <div>
          <strong>Kundetypeassistent</strong>
          <span>{t("Dit private arbejdsrum")}</span>
        </div>
      </div>
      <LanguagePicker />
      <label className="cw-project-label">
        {t("Dine projekter")}
        <select
          value={projectId}
          disabled={!projects?.length || saving}
          onChange={(e) => switchTo(e.target.value)}
        >
          {!projects?.length && (
            <option value="">{t("Ingen projekter")}</option>
          )}
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="cw-new"
        disabled={!project || saving}
        onClick={() => void newChat()}
      >
        <PlusIcon size={21} />
        {t("Ny samtale")}
      </button>
      <label className="cw-search">
        <MagnifyingGlassIcon size={19} />
        <input
          type="search"
          placeholder={t("Søg i samtaletitler")}
          aria-label={t("Søg i samtaletitler")}
          value={search}
          maxLength={100}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="cw-history" aria-busy={listBusy}>
        <p className="cw-label">{t("Dine samtaler")}</p>
        {!listBusy && !items.length && project && (
          <p className="cw-empty-history">
            {t(
              query
                ? "Ingen titler matcher din søgning."
                : "Ingen samtaler endnu.",
            )}
          </p>
        )}
        {items.map((c) => (
          <button
            key={c.id}
            className={
              c.id === chatId ? "cw-history-item selected" : "cw-history-item"
            }
            onClick={() => switchTo(projectId, c.id)}
            disabled={saving}
            aria-current={c.id === chatId ? "page" : undefined}
          >
            <ChatCircleIcon size={19} />
            <span>
              <strong>{c.title || t("Ny samtale")}</strong>
              <small>{date(c.updatedAt)}</small>
            </span>
          </button>
        ))}
        {listBusy && <p role="status">{t("Indlæser…")}</p>}
        {next && (
          <button
            className="cw-more"
            disabled={listBusy}
            onClick={() => void loadList(next)}
          >
            {t("Vis flere samtaler")}
          </button>
        )}
      </div>
      <div className="cw-person">
        <button
          className="cw-profile"
          aria-label={t("Min konto")}
          onClick={() => {
            setDrawer(false);
            setAccountOpen(true);
          }}
        >
          <span className="cw-avatar">
            {session.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{session.name}</strong>
            <small>
              <LockKeyIcon />
              {t("Privat konto · 2FA")}
            </small>
          </div>
        </button>
        <button
          onClick={() => void signOut()}
          disabled={saving}
          aria-label={t("Log ud")}
          title={t("Log ud")}
        >
          <SignOutIcon size={23} />
        </button>
      </div>
      {session.role === "Admin" && (
        <a className="cw-admin-link" href="/backoffice/">
          <ShieldCheckIcon size={20} />
          {t("Åbn administration")}
          <ArrowRightIcon size={18} />
        </a>
      )}
    </>
  );
  return (
    <div
      className="cw-shell"
      data-project-color={projectColor(project?.color)}
      style={projectColorStyle(project?.color)}
    >
      <aside className="cw-sidebar">{sidebar}</aside>
      <dialog
        ref={drawerRef}
        className="cw-mobile-sidebar"
        aria-label={t("Dine samtaler")}
        onCancel={() => setDrawer(false)}
      >
        <button
          className="cw-close-drawer"
          onClick={() => setDrawer(false)}
          aria-label={t("Luk")}
        >
          <XIcon size={24} />
        </button>
        {sidebar}
      </dialog>
      <section
        className="cw-workspace"
        aria-label={t("Dit private arbejdsrum")}
      >
        <header className="cw-header">
          <button
            className="cw-menu"
            onClick={() => setDrawer(true)}
            aria-label={t("Åbn samtaler")}
          >
            <ListIcon size={25} />
          </button>
          <div>
            <span className="cw-label">
              {project?.name || "AI · KUNDETYPEASSISTENT"}
            </span>
            <h1>
              {chat?.title ||
                t(chatId ? "Ny samtale" : "Dit private arbejdsrum")}
            </h1>
          </div>
          <span className="cw-private">
            <LockKeyIcon size={19} />
            {t("Privat")}
          </span>
          {chat && (
            <div className="cw-actions">
              <button
                onClick={() => {
                  setRename(chat.title);
                  setModal("rename");
                }}
                disabled={saving}
                aria-label={t("Omdøb samtale")}
                title={t("Omdøb samtale")}
              >
                <PencilSimpleIcon size={21} />
              </button>
              <button
                onClick={() => setModal("delete")}
                disabled={saving}
                aria-label={t("Slet samtale")}
                title={t("Slet samtale")}
              >
                <TrashIcon size={21} />
              </button>
            </div>
          )}
        </header>
        <div className="cw-ai-notice">
          <LockKeyIcon size={20} />
          <p>
            {t("Dine beskeder gemmes privat. AI-svar er endnu ikke aktiveret.")}
          </p>
        </div>
        {error && (
          <div className="cw-alert" role="alert">
            <span>{t(error)}</span>
            <button
              onClick={() => {
                setError("");
                void loadProjects();
                setRefresh((v) => v + 1);
                setChatRefresh((v) => v + 1);
              }}
            >
              <ArrowClockwiseIcon size={18} />
              {t("Prøv igen")}
            </button>
          </div>
        )}
        <main className="cw-thread" aria-busy={chatBusy}>
          {projects === null ? (
            <div className="cw-welcome">
              <p role="status">
                {t(
                  homeError
                    ? "Arbejdsrummet kunne ikke åbnes. Prøv igen."
                    : "Indlæser…",
                )}
              </p>
            </div>
          ) : !project ? (
            <div className="cw-welcome">
              <LockKeyIcon size={42} />
              <h2>{t("Du har endnu ingen tildelte projekter.")}</h2>
              <p>
                {t(
                  session.role === "Admin"
                    ? "Åbn administration, vælg Admins, og tildel en assistent til din konto."
                    : "Kontakt din administrator for at få adgang.",
                )}
              </p>
            </div>
          ) : !chatId ? (
            <div className="cw-welcome">
              <p className="cw-label">{project.name}</p>
              <h2>{t("Plads til dine tanker.")}</h2>
              <p>
                {project.description ||
                  t("Start en samtale og gem dine beskeder på ét privat sted.")}
              </p>
              <button
                className="button"
                disabled={saving}
                onClick={() => void newChat()}
              >
                <PlusIcon size={20} />
                {t("Start en samtale")}
              </button>
            </div>
          ) : (
            <>
              {before && (
                <button
                  className="cw-older"
                  disabled={chatBusy}
                  onClick={() => void loadChat(true)}
                >
                  {t("Vis tidligere beskeder")}
                </button>
              )}
              {messages.map((m) => (
                <article className="cw-message" key={m.id}>
                  <span className="cw-avatar">
                    {session.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <p className="cw-label">
                      {t("Dig")} · {date(m.createdAt)}
                    </p>
                    <div className="cw-message-text">
                      {m.text
                        .split("\n\n")
                        .map((block, i) =>
                          block.startsWith("## ") ? (
                            <h2 key={i}>{block.slice(3)}</h2>
                          ) : (
                            <p key={i}>{block}</p>
                          ),
                        )}
                    </div>
                  </div>
                </article>
              ))}
              {!messages.length && !chatBusy && chat && (
                <div className="cw-welcome">
                  <ChatCircleIcon size={42} />
                  <h2>{t("Hvad vil du arbejde med?")}</h2>
                  <p>{t("Skriv din første besked nedenfor.")}</p>
                </div>
              )}
              {chatBusy && (
                <p className="cw-loading" role="status">
                  {t("Indlæser…")}
                </p>
              )}
              <div ref={bottom} />
            </>
          )}
        </main>
        {chatId && chat && (
          <footer className="cw-composer-area">
            {!chat.writable ? (
              <p className="cw-readonly">
                {t(
                  "Prompten er ændret. Denne samtale kan læses. Start en ny samtale for at fortsætte.",
                )}
              </p>
            ) : (
              <form className="cw-composer" onSubmit={save}>
                <label htmlFor="cw-message" className="cw-sr-only">
                  {t("Din besked")}
                </label>
                <textarea
                  id="cw-message"
                  ref={composer}
                  rows={3}
                  maxLength={20000}
                  placeholder={t("Skriv din besked…")}
                  value={draft}
                  disabled={saving}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    drafts.current.set(key, e.target.value);
                  }}
                />
                <div>
                  <span>{draft.length.toLocaleString()} / 20.000</span>
                  <button type="submit" disabled={!draft.trim() || saving}>
                    <ArrowUpIcon size={20} />
                    {t(saving ? "Gemmer…" : "Gem besked")}
                  </button>
                </div>
              </form>
            )}
            <p className="cw-privacy-note">
              {t("Kun du har adgang til dine private samtaler i appen.")}
            </p>
            <p className="cw-sr-only" role="status">
              {notice}
            </p>
          </footer>
        )}
      </section>
      {modal && (
        <Dialog
          title={t(modal === "rename" ? "Omdøb samtale" : "Slet samtale")}
          close={() => {
            if (!saving) setModal(null);
          }}
        >
          <form onSubmit={manage}>
            {modal === "rename" ? (
              <label>
                {t("Samtaletitel")}
                <input
                  value={rename}
                  maxLength={120}
                  required
                  autoFocus
                  onChange={(e) => setRename(e.target.value)}
                />
              </label>
            ) : (
              <p>
                {t(
                  "Samtalen og alle dens beskeder slettes. Handlingen kan ikke fortrydes.",
                )}
              </p>
            )}
            {error && <p role="alert">{t(error)}</p>}
            <div className="cw-dialog-actions">
              <button
                type="button"
                className="button secondary"
                disabled={saving}
                onClick={() => setModal(null)}
              >
                {t("Annullér")}
              </button>
              <button
                className="button"
                disabled={saving || (modal === "rename" && !rename.trim())}
              >
                {t(
                  saving
                    ? "Gemmer…"
                    : modal === "rename"
                      ? "Gem ændringer"
                      : "Slet samtale",
                )}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {accountOpen && (
        <Deferred>
          <AccountDialog
            key={session.id}
            session={session}
            onNameChange={onNameChange}
            logout={logout}
            close={() => setAccountOpen(false)}
          />
        </Deferred>
      )}
    </div>
  );
}
