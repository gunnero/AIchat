import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  PlusIcon,
  FileTextIcon,
  LockSimpleIcon,
  ArrowSquareOutIcon,
  CaretDownIcon,
  PaperclipIcon,
  PaperPlaneTiltIcon,
  CopyIcon,
  CheckIcon,
  StopIcon,
  ListIcon,
  XIcon,
  ArrowLeftIcon,
  GearSixIcon,
  ChartBarIcon,
  UsersIcon,
  InfoIcon,
  FoldersIcon,
} from "@phosphor-icons/react";
import { Admin } from "./Admin";
import { adminTabs, type AdminTab } from "./adminNavigation";
import { BrandMark } from "./BrandMark";
import { Modal } from "./Modal";
import { ShareDialog } from "./ShareDialog";
import { MessageText } from "./MessageText";
import {
  createDemoChats,
  createDemoCustomers,
  createDemoPlans,
  createShare,
  streamDemo,
  type Chat,
  type Share,
  type Scenario,
} from "./domain";
import {
  assignedProjects,
  canContinueChat,
  createDemoAssignments,
  createDemoProjects,
  createDemoPrompts,
  createProjectChat,
  projectChats,
} from "./projects";

type Dialog = "share" | "usage" | "demo" | "attachment" | "info" | null;
const scenarios: { id: Scenario; label: string; detail: string }[] = [
  {
    id: "normal",
    label: "Normal",
    detail: "Et forberedt svar vises gradvist.",
  },
  {
    id: "slow",
    label: "Langsomt svar",
    detail: "Afprøv ventetid og stop-knappen.",
  },
  {
    id: "error",
    label: "Fejl ved svar",
    detail: "Din kladde bevares, så du kan prøve igen.",
  },
  {
    id: "exhausted",
    label: "Ingen svar tilbage",
    detail: "Se, hvordan en opbrugt pakke vises.",
  },
];

export function App() {
  const [chats, setChats] = useState(createDemoChats);
  const [selectedProjectId, setSelectedProjectId] = useState("green");
  const [activeIds, setActiveIds] = useState<Record<string, string>>({
    green: "welcome",
    yellow: "yellow-plan",
  });
  const [projects, setProjects] = useState(createDemoProjects);
  const [prompts, setPrompts] = useState(createDemoPrompts);
  const [assignments, setAssignments] = useState(createDemoAssignments);
  const [customers, setCustomers] = useState(createDemoCustomers);
  const [plans, setPlans] = useState(createDemoPlans);
  const [shares, setShares] = useState<Share[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [view, setView] = useState<"customer" | "admin">("customer");
  const [adminTab, setAdminTab] = useState<AdminTab>("customers");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState("");
  const controller = useRef<AbortController | null>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const wasBusy = useRef(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileMenuButton = useRef<HTMLButtonElement>(null);
  const customer = customers.find((c) => c.id === "sofie")!;
  const customerProjects = assignedProjects(
    customer.id,
    projects,
    prompts,
    assignments,
  );
  const activeProject =
    customerProjects.find((p) => p.project.id === selectedProjectId) ??
    customerProjects[0];
  const scopedChats = activeProject
    ? projectChats(chats, customer.id, activeProject.project.id)
    : [];
  const active =
    scopedChats.find(
      (c) => c.id === activeIds[activeProject?.project.id ?? ""],
    ) ?? scopedChats[0];
  const activeId = active?.id ?? "";
  const pinnedPrompt =
    active &&
    prompts.find(
      (p) =>
        p.projectId === active.projectId &&
        p.id === active.promptId &&
        p.version === active.promptVersion,
    );
  const promptChanged = !!(
    active &&
    activeProject &&
    !canContinueChat(active, customer.id, activeProject)
  );
  const plan = plans.find((p) => p.id === customer.planId)!;
  const remaining =
    scenario === "exhausted" ? 0 : Math.max(0, plan.allowance - customer.used);
  const isExpired = customer.expires < "2026-10-16"; // Fixed demo clock, not a production access check.
  const accessPaused = customer.status !== "active" || isExpired;
  const draft = drafts[activeId] ?? "";
  const sharedCount = shares.filter(
    (s) => s.chatId === activeId && !s.revoked,
  ).length;

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (wasBusy.current && !busy) composer.current?.focus();
    wasBusy.current = busy;
  }, [busy]);
  useEffect(() => {
    if (!mobileNav) return;
    const opener = mobileMenuButton.current;
    sidebarRef.current
      ?.querySelector<HTMLButtonElement>(".mobile-close")
      ?.focus();
    const resize = () => {
      if (window.innerWidth > 760) setMobileNav(false);
    };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      opener?.focus();
    };
  }, [mobileNav]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (busy && scrollArea.current)
      scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
  }, [chats, busy]);
  useEffect(() => {
    if (!profileOpen) return;
    profileRef.current
      ?.querySelector<HTMLButtonElement>(".profile-menu button")
      ?.focus();
    const close = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node))
        setProfileOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        profileRef.current
          ?.querySelector<HTMLButtonElement>(".profile-button")
          ?.focus();
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", escape);
    };
  }, [profileOpen]);

  function changeChat(id: string) {
    if (!activeProject || !scopedChats.some((c) => c.id === id)) return;
    setActiveIds((previous) => ({
      ...previous,
      [activeProject.project.id]: id,
    }));
    setError("");
    setMobileNav(false);
    if (scrollArea.current) scrollArea.current.scrollTop = 0;
  }
  function newChat() {
    if (!activeProject || busy) return;
    const chat: Chat = createProjectChat(
      customer.id,
      activeProject,
      crypto.randomUUID(),
    );
    setChats((previous) => [chat, ...previous]);
    setActiveIds((previous) => ({
      ...previous,
      [activeProject.project.id]: chat.id,
    }));
    setError("");
    setMobileNav(false);
    requestAnimationFrame(() => composer.current?.focus());
  }
  function changeProject(id: string) {
    if (busy || !customerProjects.some((p) => p.project.id === id)) return;
    setSelectedProjectId(id);
    setError("");
    setMobileNav(false);
    if (scrollArea.current) scrollArea.current.scrollTop = 0;
  }
  function updateAssistant(
    chatId: string,
    messageId: string,
    content: string,
    status: "streaming" | "complete" | "cancelled",
  ) {
    setChats((previous) =>
      previous.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === messageId
                  ? { ...message, content, status }
                  : message,
              ),
            }
          : chat,
      ),
    );
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (
      !active ||
      !activeProject ||
      !canContinueChat(active, customer.id, activeProject) ||
      !draft.trim() ||
      controller.current ||
      remaining <= 0 ||
      accessPaused
    )
      return;
    const prompt = draft.trim();
    const chatId = activeId;
    const userId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const requestController = new AbortController();
    controller.current = requestController;
    setBusy(true);
    setError("");
    setDrafts((previous) => ({ ...previous, [chatId]: "" }));
    setChats((previous) =>
      previous.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              title: chat.messages.length ? chat.title : prompt.slice(0, 52),
              messages: [
                ...chat.messages,
                {
                  id: userId,
                  role: "user",
                  content: prompt,
                  status: "complete",
                },
                {
                  id: messageId,
                  role: "assistant",
                  content: "",
                  status: "streaming",
                },
              ],
            }
          : chat,
      ),
    );
    let content = "";
    try {
      for await (const chunk of streamDemo(
        prompt,
        scenario,
        requestController.signal,
        activeProject.prompt.demoReply,
      )) {
        content += chunk;
        updateAssistant(chatId, messageId, content, "streaming");
      }
      updateAssistant(chatId, messageId, content, "complete");
      setCustomers((previous) =>
        previous.map((c) =>
          c.id === "sofie" ? { ...c, used: c.used + 1 } : c,
        ),
      );
    } catch (cause) {
      if (requestController.signal.aborted) {
        updateAssistant(
          chatId,
          messageId,
          content || "Svaret blev stoppet, inden teksten var klar.",
          "cancelled",
        );
        setToast("Svaret er stoppet. Ingen demosvar er trukket fra.");
      } else {
        setChats((previous) =>
          previous.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  messages: chat.messages.filter(
                    (m) => m.id !== userId && m.id !== messageId,
                  ),
                }
              : chat,
          ),
        );
        setDrafts((previous) => ({ ...previous, [chatId]: prompt }));
        setError(
          cause instanceof Error ? cause.message : "Noget gik galt. Prøv igen.",
        );
      }
    } finally {
      controller.current = null;
      setBusy(false);
      composer.current?.focus();
    }
  }
  async function copyText(id: string, content: string) {
    try {
      await navigator.clipboard.writeText(content.replace(/^## /gm, ""));
      setCopied(id);
      setToast("Teksten er kopieret.");
    } catch {
      setToast("Kunne ikke kopiere. Markér teksten og kopiér den manuelt.");
    }
  }
  function openDialog(value: Dialog) {
    setDialog(value);
    setProfileOpen(false);
    setMobileNav(false);
  }
  function switchView(value: "customer" | "admin") {
    setView(value);
    setProfileOpen(false);
    setMobileNav(false);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Gå til indhold
      </a>
      <div className="mobile-bar" inert={mobileNav}>
        <button
          className="icon-button"
          aria-label="Åbn menu"
          ref={mobileMenuButton}
          aria-expanded={mobileNav}
          onClick={() => setMobileNav(true)}
        >
          <ListIcon size={26} />
        </button>
        <span>AI - Kundetypeassistent</span>
        <span className="mobile-demo">Demo</span>
      </div>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Luk menu"
          tabIndex={-1}
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        className={"sidebar " + (mobileNav ? "sidebar-open" : "")}
        aria-label="Hovedmenu"
        role={mobileNav ? "dialog" : undefined}
        aria-modal={mobileNav || undefined}
        onKeyDown={(event) => {
          if (!mobileNav) return;
          if (event.key === "Escape") {
            setMobileNav(false);
            return;
          }
          if (event.key !== "Tab") return;
          const buttons = Array.from(
            sidebarRef.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), select:not(:disabled)",
            ) ?? [],
          ).filter((button) => button.offsetParent !== null);
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <button
          className="mobile-close icon-button"
          aria-label="Luk menu"
          onClick={() => setMobileNav(false)}
        >
          <XIcon size={24} />
        </button>
        <div className="brand">
          <BrandMark />
          <div className="brand-name">AI - Kundetypeassistent</div>
        </div>
        {view === "customer" ? (
          <>
            <div className="project-picker">
              <label htmlFor="customer-project">Dit projekt</label>
              <select
                id="customer-project"
                aria-label="Vælg projekt"
                value={activeProject?.project.id ?? ""}
                disabled={busy || !customerProjects.length}
                onChange={(event) => changeProject(event.target.value)}
              >
                {!customerProjects.length && (
                  <option value="">Ingen projekter</option>
                )}
                {customerProjects.map(({ project }) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              {activeProject && (
                <p>
                  Tildelt prompt: {activeProject.prompt.name} · v
                  {activeProject.prompt.version}
                </p>
              )}
            </div>
            <button
              className="new-chat"
              onClick={newChat}
              disabled={busy || !activeProject}
            >
              <PlusIcon size={27} weight="light" />
              Ny samtale
            </button>
            <nav className="conversation-nav" aria-label="Dine samtaler">
              <h2>Dine samtaler</h2>
              <div className="history-list">
                {scopedChats.map((chat) => (
                  <button
                    key={chat.id}
                    className={
                      "history-item " + (activeId === chat.id ? "active" : "")
                    }
                    onClick={() => changeChat(chat.id)}
                    aria-current={activeId === chat.id ? "page" : undefined}
                    disabled={busy}
                  >
                    <FileTextIcon size={25} weight="light" />
                    <span>{chat.title}</span>
                  </button>
                ))}
              </div>
              {!scopedChats.length && (
                <p className="history-empty">
                  {activeProject
                    ? "Ingen samtaler i dette projekt endnu."
                    : "Kontakt Helle for at få projektadgang."}
                </p>
              )}
            </nav>
          </>
        ) : (
          <>
            <button className="new-chat" onClick={() => switchView("customer")}>
              <ArrowLeftIcon size={24} />
              Til mine samtaler
            </button>
            <nav className="conversation-nav" aria-label="Administration">
              <h2>Administration</h2>
              {adminTabs.map((item) => (
                <button
                  key={item.id}
                  className={
                    "history-item " + (adminTab === item.id ? "active" : "")
                  }
                  onClick={() => {
                    setAdminTab(item.id);
                    setMobileNav(false);
                  }}
                  aria-current={adminTab === item.id ? "page" : undefined}
                >
                  <item.icon size={24} weight="light" />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          {view === "customer" && (
            <button
              className="allowance"
              onClick={() => openDialog("usage")}
              aria-label="Se dit forbrug"
            >
              <span className="allowance-label">
                <strong>{plan.name}</strong>
                <span>
                  {remaining} af {plan.allowance} svar tilbage
                </span>
              </span>
              <progress
                max={plan.allowance}
                value={remaining}
                aria-label="Svar tilbage"
              />
            </button>
          )}
          <div className="profile-area" ref={profileRef}>
            {profileOpen && (
              <div className="profile-menu">
                <button onClick={() => openDialog("usage")}>
                  <ChartBarIcon size={20} />
                  Mit forbrug
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    switchView(view === "customer" ? "admin" : "customer")
                  }
                >
                  <UsersIcon size={20} />
                  {view === "customer"
                    ? "Administration (demo)"
                    : "Til mine samtaler"}
                </button>
                <button disabled={busy} onClick={() => openDialog("demo")}>
                  <GearSixIcon size={20} />
                  Demoindstillinger
                </button>
                <button onClick={() => openDialog("info")}>
                  <InfoIcon size={20} />
                  Om prototypen
                </button>
              </div>
            )}
            <button
              className="profile-button"
              onClick={() => setProfileOpen(!profileOpen)}
              aria-expanded={profileOpen}
              aria-label="Åbn profilmenu"
            >
              <span className="avatar">
                {view === "customer" ? "SJ" : "HB"}
              </span>
              <span>
                {view === "customer" ? "Sofie Jensen" : "Helle Bodeholt"}
              </span>
              <CaretDownIcon size={20} />
            </button>
          </div>
          <button className="demo-label" onClick={() => openDialog("info")}>
            Demo · fiktive data
          </button>
        </div>
      </aside>
      <main id="main" className="workspace" tabIndex={-1} inert={mobileNav}>
        {view === "admin" ? (
          <Admin
            tab={adminTab}
            customers={customers}
            setCustomers={setCustomers}
            plans={plans}
            setPlans={setPlans}
            projects={projects}
            setProjects={setProjects}
            prompts={prompts}
            setPrompts={setPrompts}
            assignments={assignments}
            setAssignments={setAssignments}
            shares={shares}
            onBack={() => switchView("customer")}
            notify={setToast}
          />
        ) : !activeProject || !active ? (
          <div className="project-empty">
            <FoldersIcon size={48} weight="light" />
            <h1>
              {activeProject
                ? activeProject.project.name
                : "Ingen projekter tildelt endnu"}
            </h1>
            <p>
              {activeProject
                ? activeProject.project.description
                : "Helle kan give dig adgang til et eller flere projekter."}
            </p>
            {activeProject && (
              <>
                <p className="muted">
                  Din prompt: {activeProject.prompt.name} · v
                  {activeProject.prompt.version}
                </p>
                <button className="button primary" onClick={newChat}>
                  Start en samtale
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <header className="workspace-header">
              <div className="heading-group">
                <div className="chat-heading">
                  <p className="project-context">
                    {activeProject.project.name} ·{" "}
                    {pinnedPrompt?.name ?? "Tidligere prompt"} · v
                    {active.promptVersion}
                  </p>
                  <h1>{active.title}</h1>
                </div>
                <span className="privacy-state">
                  <LockSimpleIcon size={21} weight="light" />
                  {sharedCount ? "Kopi delt" : "Privat"}
                </span>
              </div>
              <button
                className="button share-button"
                aria-label="Del med Helle"
                onClick={() => openDialog("share")}
                disabled={busy || !active.messages.length}
              >
                <ArrowSquareOutIcon size={25} weight="light" />
                <span>Del med Helle</span>
              </button>
            </header>
            <div
              className="messages-scroll"
              ref={scrollArea}
              aria-label="Samtale"
            >
              {active.messages.length === 0 ? (
                <div className="welcome-empty">
                  <BrandMark />
                  <p className="eyebrow">ET GODT STED AT BEGYNDE</p>
                  <h2>Hvad vil du gerne arbejde med?</h2>
                  <p>
                    Find de ord, der skaber ro, nærvær og tillid hos dine
                    kunder.
                  </p>
                  <div className="suggestions">
                    {[
                      "En varm velkomstmail",
                      "Et roligt opslag til LinkedIn",
                      "En tryg tekst til min forside",
                    ].map((text) => (
                      <button
                        key={text}
                        onClick={() => {
                          setDrafts((previous) => ({
                            ...previous,
                            [activeId]: text,
                          }));
                          composer.current?.focus();
                        }}
                      >
                        {text}
                        <ArrowSquareOutIcon size={19} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                active.messages.map((message) => (
                  <article
                    key={message.id}
                    className={"message " + message.role}
                    aria-label={
                      message.role === "user"
                        ? "Din besked"
                        : "Assistentens svar"
                    }
                  >
                    {message.role === "assistant" && (
                      <BrandMark className="assistant-avatar" />
                    )}
                    <div className="message-body">
                      {message.role === "user" ? (
                        <p className="user-bubble">{message.content}</p>
                      ) : (
                        <>
                          {message.content ? (
                            <MessageText content={message.content} />
                          ) : (
                            <p className="thinking" role="status">
                              Finder de rette ord…
                            </p>
                          )}
                          {message.status === "cancelled" && (
                            <p className="cancelled-note">
                              Stoppet · svaret er ikke færdigt
                            </p>
                          )}
                          {message.status !== "streaming" && (
                            <button
                              className="copy-button"
                              onClick={() =>
                                copyText(message.id, message.content)
                              }
                            >
                              {copied === message.id ? (
                                <CheckIcon size={21} />
                              ) : (
                                <CopyIcon size={21} weight="light" />
                              )}
                              {copied === message.id
                                ? "Kopieret"
                                : "Kopier tekst"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {message.role === "user" && (
                      <span
                        className="avatar message-avatar"
                        aria-hidden="true"
                      >
                        SJ
                      </span>
                    )}
                  </article>
                ))
              )}
            </div>
            <footer className="composer-area">
              {(error || !remaining || accessPaused || promptChanged) && (
                <div className="composer-alert" role="alert">
                  <span>
                    {accessPaused
                      ? "Din demoadgang er sat på pause eller udløbet."
                      : promptChanged
                        ? "Din prompttildeling er ændret. Start en ny samtale med den aktuelle prompt."
                        : !remaining
                          ? "Du har brugt dine svar. Kontakt Helle for at forny din pakke."
                          : error}
                  </span>
                  {promptChanged && (
                    <button className="text-button" onClick={newChat}>
                      Start ny samtale
                    </button>
                  )}
                  {!remaining && (
                    <button
                      className="text-button"
                      onClick={() => openDialog("usage")}
                    >
                      Se pakke
                    </button>
                  )}
                  {error && (
                    <button
                      className="icon-button"
                      aria-label="Luk fejlbesked"
                      onClick={() => setError("")}
                    >
                      <XIcon size={18} />
                    </button>
                  )}
                </div>
              )}
              <form className="composer" onSubmit={send}>
                <button
                  type="button"
                  className="attach-button icon-button"
                  aria-label="Om vedhæftninger"
                  onClick={() => openDialog("attachment")}
                >
                  <PaperclipIcon size={28} weight="light" />
                </button>
                <textarea
                  ref={composer}
                  aria-label="Skriv en besked"
                  placeholder="Hvad vil du gerne arbejde videre med?"
                  value={draft}
                  maxLength={4000}
                  rows={1}
                  disabled={busy || !remaining || accessPaused || promptChanged}
                  onChange={(e) =>
                    setDrafts((previous) => ({
                      ...previous,
                      [activeId]: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                {busy ? (
                  <button
                    type="button"
                    className="send-button"
                    aria-label="Stop svar"
                    onClick={() => controller.current?.abort()}
                  >
                    <StopIcon size={24} weight="fill" />
                  </button>
                ) : (
                  <button
                    className="send-button"
                    type="submit"
                    aria-label="Send besked"
                    disabled={
                      !draft.trim() ||
                      !remaining ||
                      accessPaused ||
                      promptChanged
                    }
                  >
                    <PaperPlaneTiltIcon size={27} weight="light" />
                  </button>
                )}
              </form>
              <p className="privacy-note">
                <LockSimpleIcon size={16} weight="light" />
                Dine samtaler er private, indtil du vælger at dele dem.
              </p>
            </footer>
          </>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckIcon size={20} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Luk besked"
            onClick={() => setToast("")}
          >
            <XIcon size={18} />
          </button>
        </div>
      )}
      {dialog === "share" && active && (
        <ShareDialog
          chat={active}
          shares={shares.filter(
            (s) =>
              s.customerId === customer.id && s.projectId === active.projectId,
          )}
          onClose={() => setDialog(null)}
          onShare={(selected) =>
            setShares((previous) => [
              ...previous,
              createShare(
                active,
                selected,
                crypto.randomUUID(),
                new Date().toISOString(),
              ),
            ])
          }
          onRevoke={(id) => {
            setShares((previous) =>
              previous.map((s) => (s.id === id ? { ...s, revoked: true } : s)),
            );
            setToast("Delingen er tilbagekaldt i demoen.");
          }}
        />
      )}
      {dialog === "usage" && (
        <Modal title="Din pakke og dit forbrug" onClose={() => setDialog(null)}>
          <span className="eyebrow">DEMOPAKKE</span>
          <h3 className="usage-plan">{plan.name}</h3>
          <p className="usage-big">
            {remaining}
            <span> af {plan.allowance} svar tilbage</span>
          </p>
          <progress
            className="usage-progress"
            max={plan.allowance}
            value={remaining}
            aria-label="Din resterende pakke"
          />
          <dl className="detail-list">
            <div>
              <dt>Svar brugt</dt>
              <dd>{customer.used}</dd>
            </div>
            <div>
              <dt>Adgang til</dt>
              <dd>
                {new Date(customer.expires + "T12:00:00").toLocaleDateString(
                  "da-DK",
                )}
              </dd>
            </div>
            <div>
              <dt>Betaling</dt>
              <dd>Aftales med Helle</dd>
            </div>
          </dl>
          <p className="notice">
            Kun færdige demosvar tæller i prototypen. Demoen måler ikke rigtige
            tokens, pris eller AI-hastighed.
          </p>
          <button
            className="button primary full-width"
            onClick={() => {
              setDialog("info");
            }}
          >
            Om fornyelse og adgang
          </button>
        </Modal>
      )}
      {dialog === "demo" && (
        <Modal
          title="Afprøv forskellige situationer"
          onClose={() => setDialog(null)}
        >
          <p className="muted">
            Vælg, hvordan det næste demosvar opfører sig. Der kaldes ingen
            AI-tjeneste.
          </p>
          <div className="scenario-list">
            {scenarios.map((item) => (
              <label key={item.id} className="scenario-option">
                <input
                  type="radio"
                  name="scenario"
                  value={item.id}
                  checked={scenario === item.id}
                  onChange={() => setScenario(item.id)}
                />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setChats(createDemoChats());
                setCustomers(createDemoCustomers());
                setPlans(createDemoPlans());
                setProjects(createDemoProjects());
                setPrompts(createDemoPrompts());
                setAssignments(createDemoAssignments());
                setShares([]);
                setDrafts({});
                setSelectedProjectId("green");
                setActiveIds({ green: "welcome", yellow: "yellow-plan" });
                setScenario("normal");
                setError("");
                setCopied("");
                setDialog(null);
                setView("customer");
                setToast("Demoen er nulstillet.");
              }}
            >
              Nulstil demo
            </button>
            <button className="button primary" onClick={() => setDialog(null)}>
              Brug indstilling
            </button>
          </div>
        </Modal>
      )}
      {dialog === "attachment" && (
        <Modal title="Vedhæftninger" onClose={() => setDialog(null)}>
          <p>
            Private dokumenter er planlagt som en mulig udvidelse. I denne
            prototype kan du afprøve samtaler med tekst.
          </p>
          <p className="notice">Brug kun fiktive oplysninger i demoen.</p>
          <button className="button primary" onClick={() => setDialog(null)}>
            Forstået
          </button>
        </Modal>
      )}
      {dialog === "info" && (
        <Modal
          title="En forsmag på din assistent"
          onClose={() => setDialog(null)}
        >
          <p>
            Her kan du afprøve samtaler, deling, pakker og administration med
            fiktive kunder.
          </p>
          <p>
            Svarene er forberedte eksempler. Der sendes ingen e-mails, ingen
            betalinger gennemføres, og dine indtastninger bliver kun i denne
            sides hukommelse. Genindlæsning nulstiller demoen.
          </p>
          <p>
            Den færdige løsning får personlige konti, adgangskontrol og Helles
            godkendte materiale. Pakker og adgang aftales med Helle; prototypen
            har ingen kontakt- eller betalingsforbindelse.
          </p>
          <p className="notice">
            Brug kun fiktive oplysninger. Demoen demonstrerer brugeroplevelsen,
            ikke produktionssikkerhed eller GDPR-overholdelse.
          </p>
          <button className="button primary" onClick={() => setDialog(null)}>
            Tilbage til demoen
          </button>
        </Modal>
      )}
    </div>
  );
}
