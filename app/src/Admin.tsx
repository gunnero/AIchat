import { useState, type Dispatch, type SetStateAction } from "react";
import {
  EnvelopeSimpleIcon,
  PlusIcon,
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  TrayIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { Modal } from "./Modal";
import { MessageText } from "./MessageText";
import { ProjectsAdmin } from "./ProjectsAdmin";
import {
  promptKey,
  validateAssignments,
  type AssistantProject,
  type ProjectAssignment,
  type PromptVersion,
} from "./projects";
import {
  adminCustomerRows,
  validateInvitation,
  visibleShares,
  type Customer,
  type Plan,
  type Share,
} from "./domain";

import { adminTabs, type AdminTab } from "./adminNavigation";

export function Admin({
  tab,
  customers,
  setCustomers,
  plans,
  setPlans,
  projects,
  setProjects,
  prompts,
  setPrompts,
  assignments,
  setAssignments,
  shares,
  onBack,
  notify,
}: {
  tab: AdminTab;
  customers: Customer[];
  setCustomers: Dispatch<SetStateAction<Customer[]>>;
  plans: Plan[];
  setPlans: Dispatch<SetStateAction<Plan[]>>;
  projects: AssistantProject[];
  setProjects: Dispatch<SetStateAction<AssistantProject[]>>;
  prompts: PromptVersion[];
  setPrompts: Dispatch<SetStateAction<PromptVersion[]>>;
  assignments: ProjectAssignment[];
  setAssignments: Dispatch<SetStateAction<ProjectAssignment[]>>;
  shares: Share[];
  onBack: () => void;
  notify: (text: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | "invite" | null>(null);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [openedShare, setOpenedShare] = useState<string | null>(null);
  const shared = visibleShares(shares);
  const currentShare = shared.find((s) => s.id === openedShare);
  const rows = adminCustomerRows(customers).filter((c) =>
    (c.name + c.email).toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <header className="workspace-header">
        <div className="heading-group">
          <h1>{adminTabs.find((t) => t.id === tab)?.label}</h1>
          <span className="status-badge">Administration · demo</span>
        </div>
        <button className="button secondary" onClick={onBack}>
          <ArrowLeftIcon size={21} />
          Til samtaler
        </button>
      </header>
      <div className="admin-content">
        <p className="eyebrow">ET ROLIGT OVERBLIK</p>
        <h2>
          {tab === "customers"
            ? "Menneskene bag samtalerne"
            : tab === "projects"
              ? "Den rette assistent til hver kunde"
              : tab === "plans"
                ? "En pakke til hvert behov"
                : "Kun det, kunden har valgt at dele"}
        </h2>
        <p className="muted">
          {tab === "customers"
            ? "Administrér adgang og forbrug. Kundernes private samtaler vises ikke her."
            : tab === "projects"
              ? "Administrér projekter og promptversioner. Tildel derefter projekter og en bestemt prompt til hver kunde."
              : tab === "plans"
                ? "Afprøv pakker og svargrænser. Alle priser er illustrative; betaling foregår eksternt."
                : "Her vises faste kopier af de beskeder, en kunde har delt med Helle."}
        </p>
        {tab === "customers" && (
          <>
            <div className="metrics-grid">
              <div className="metric">
                <span>Aktive kunder</span>
                <strong>
                  {customers.filter((c) => c.status === "active").length}
                </strong>
              </div>
              <div className="metric">
                <span>Afventer invitation</span>
                <strong>
                  {customers.filter((c) => c.status === "invited").length}
                </strong>
              </div>
              <div className="metric">
                <span>Svar brugt · demo</span>
                <strong>{customers.reduce((sum, c) => sum + c.used, 0)}</strong>
              </div>
            </div>
            <div className="table-toolbar">
              <label className="search-box">
                <MagnifyingGlassIcon size={20} />
                <input
                  aria-label="Søg kunder"
                  placeholder="Søg efter navn eller e-mail"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button
                className="button primary"
                onClick={() => setEditing("invite")}
              >
                <PlusIcon size={20} />
                Invitér kunde
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Kunde</th>
                    <th>Pakke</th>
                    <th>Projekter</th>
                    <th>Adgang</th>
                    <th>Forbrug</th>
                    <th>
                      <span className="sr-only">Handlinger</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const projectCount = assignments.filter(
                      (a) => a.customerId === c.id,
                    ).length;
                    return (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                          <span className="table-email">{c.email}</span>
                        </td>
                        <td>{plans.find((p) => p.id === c.planId)?.name}</td>
                        <td>
                          {projectCount}{" "}
                          {projectCount === 1 ? "projekt" : "projekter"}
                        </td>
                        <td>
                          <span className={"pill " + c.status}>
                            {statusLabel(c.status)}
                          </span>
                        </td>
                        <td>
                          {c.used} /{" "}
                          {plans.find((p) => p.id === c.planId)?.allowance}
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => setEditing(c)}
                            aria-label={"Administrér " + c.name}
                          >
                            Administrér
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!rows.length && (
                <p className="empty-note">Ingen kunder matcher din søgning.</p>
              )}
            </div>
            <p className="fine-print">
              <EnvelopeSimpleIcon size={17} /> Demoen sender ingen e-mails og
              opretter ingen rigtige konti.
            </p>
          </>
        )}
        {tab === "projects" && (
          <ProjectsAdmin
            projects={projects}
            setProjects={setProjects}
            prompts={prompts}
            setPrompts={setPrompts}
            assignments={assignments}
            notify={notify}
          />
        )}
        {tab === "plans" && (
          <div className="plans-grid">
            {plans.map((p) => (
              <article className="plan-card" key={p.id}>
                <span className="eyebrow">DEMOPAKKE</span>
                <h3>{p.name}</h3>
                <p className="plan-price">
                  {p.price} kr.<span> / måned</span>
                </p>
                <p>{p.allowance} svar pr. periode</p>
                <button
                  className="button secondary"
                  onClick={() => setEditingPlan(p)}
                >
                  Redigér pakke
                </button>
              </article>
            ))}
          </div>
        )}
        {tab === "shares" && (
          <div className="shared-list">
            {shared.length === 0 ? (
              <div className="empty-panel">
                <TrayIcon size={38} weight="light" />
                <h3>Ingen delte samtaler endnu</h3>
                <p>Kunden vælger selv, om noget skal deles.</p>
              </div>
            ) : (
              shared.map((s) => (
                <button
                  className="shared-row"
                  key={s.id}
                  onClick={() => setOpenedShare(s.id)}
                >
                  <span>
                    <strong>{s.title}</strong>
                    <small>
                      {customers.find((c) => c.id === s.customerId)?.name ??
                        "Kunde"}{" "}
                      ·{" "}
                      {projects.find((p) => p.id === s.projectId)?.name ??
                        "Projekt"}{" "}
                      · {s.messages.length}{" "}
                      {s.messages.length === 1 ? "besked" : "beskeder"} · fast
                      kopi
                    </small>
                  </span>
                  <ArrowSquareOutIcon size={22} />
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {editing && (
        <CustomerEditor
          customer={editing}
          customers={customers}
          plans={plans}
          projects={projects}
          prompts={prompts}
          assignments={assignments}
          onClose={() => setEditing(null)}
          onSave={(customer, customerAssignments) => {
            setCustomers((previous) =>
              editing === "invite"
                ? [...previous, customer]
                : previous.map((c) => (c.id === customer.id ? customer : c)),
            );
            setAssignments((previous) => [
              ...previous.filter((a) => a.customerId !== customer.id),
              ...customerAssignments,
            ]);
            notify(
              editing === "invite"
                ? "Demoinvitation oprettet. Ingen e-mail er sendt."
                : "Kundens demoadgang er opdateret.",
            );
            setEditing(null);
          }}
        />
      )}
      {editingPlan && (
        <PlanEditor
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSave={(plan) => {
            setPlans((previous) =>
              previous.map((p) => (p.id === plan.id ? plan : p)),
            );
            setEditingPlan(null);
            notify("Demopakken er opdateret.");
          }}
        />
      )}
      {currentShare && (
        <Modal
          title={currentShare.title}
          wide
          onClose={() => setOpenedShare(null)}
        >
          <p className="notice">
            Delt af{" "}
            {customers.find((c) => c.id === currentShare.customerId)?.name ??
              "kunden"}{" "}
            i{" "}
            {projects.find((p) => p.id === currentShare.projectId)?.name ??
              "projektet"}
            . Denne kopi indeholder kun de valgte beskeder.
          </p>
          <div className="snapshot-messages">
            {currentShare.messages.map((m) => (
              <article key={m.id}>
                <span className="eyebrow">
                  {m.role === "user" ? "KUNDE" : "ASSISTENT"}
                </span>
                <MessageText content={m.content} />
              </article>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function statusLabel(status: Customer["status"]) {
  return { active: "Aktiv", invited: "Inviteret", suspended: "Sat på pause" }[
    status
  ];
}

function CustomerEditor({
  customer,
  customers,
  plans,
  projects,
  prompts,
  assignments,
  onClose,
  onSave,
}: {
  customer: Customer | "invite";
  customers: Customer[];
  plans: Plan[];
  projects: AssistantProject[];
  prompts: PromptVersion[];
  assignments: ProjectAssignment[];
  onClose: () => void;
  onSave: (customer: Customer, assignments: ProjectAssignment[]) => void;
}) {
  const isNew = customer === "invite";
  const [name, setName] = useState(isNew ? "" : customer.name);
  const [email, setEmail] = useState(isNew ? "" : customer.email);
  const [planId, setPlanId] = useState(isNew ? "standard" : customer.planId);
  const [status, setStatus] = useState<Customer["status"]>(
    isNew ? "invited" : customer.status,
  );
  const [expires, setExpires] = useState(
    isNew ? "2026-11-16" : customer.expires,
  );
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      assignments
        .filter((a) => !isNew && a.customerId === customer.id)
        .map((a) => [a.projectId, `${a.promptId}:${a.promptVersion}`]),
    ),
  );
  return (
    <Modal
      title={isNew ? "Invitér en kunde" : "Administrér " + customer.name}
      onClose={onClose}
      wide
    >
      <p className="muted">
        Demo med fiktive oplysninger. Ingen e-mail eller loginoplysninger bliver
        sendt.
      </p>
      <form
        className="form-stack customer-editor"
        onSubmit={(event) => {
          event.preventDefault();
          const invalid = isNew ? validateInvitation(email, customers) : null;
          if (invalid) {
            setError(invalid);
            return;
          }
          if (!name.trim()) {
            setError("Skriv kundens navn.");
            return;
          }
          const customerId = isNew ? crypto.randomUUID() : customer.id;
          const customerAssignments: ProjectAssignment[] = [];
          for (const [projectId, key] of Object.entries(selected)) {
            const prompt = prompts.find(
              (p) => p.projectId === projectId && promptKey(p) === key,
            );
            if (!prompt)
              return setError(
                "Vælg en gyldig prompt til hvert tildelt projekt.",
              );
            customerAssignments.push({
              customerId,
              projectId,
              promptId: prompt.id,
              promptVersion: prompt.version,
            });
          }
          const invalidAssignments = validateAssignments(
            customerId,
            customerAssignments,
            projects,
            prompts,
          );
          if (invalidAssignments) return setError(invalidAssignments);
          onSave(
            {
              id: customerId,
              name: name.trim(),
              email: email.trim().toLowerCase(),
              planId,
              status,
              expires,
              used: isNew ? 0 : customer.used,
            },
            customerAssignments,
          );
        }}
      >
        <div className="customer-account-fields">
          <label>
            Navn
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              autoFocus
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              required
              disabled={!isNew}
              placeholder="kunde@example.test"
            />
          </label>
          <label>
            Pakke
            <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.allowance} svar
                </option>
              ))}
            </select>
          </label>
          {!isNew && (
            <label>
              Adgang
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as Customer["status"])
                }
              >
                <option value="active">Aktiv</option>
                <option value="invited">Inviteret</option>
                <option value="suspended">Sat på pause</option>
              </select>
            </label>
          )}
          <label>
            Adgang til
            <input
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              required
            />
          </label>
        </div>
        <fieldset className="assignment-list">
          <legend>Projekter og prompter</legend>
          <p className="muted">
            Vælg flere projekter og én promptversion i hvert projekt. Uden en
            tildeling har kunden ingen projektadgang.
          </p>
          {projects.map((project) => {
            const options = prompts.filter((p) => p.projectId === project.id);
            return (
              <div className="assignment-row" key={project.id}>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    aria-label={`Adgang til ${project.name}`}
                    checked={project.id in selected}
                    disabled={!options.length}
                    onChange={(event) =>
                      setSelected((previous) => {
                        if (event.target.checked)
                          return {
                            ...previous,
                            [project.id]: promptKey(options[0]),
                          };
                        const next = { ...previous };
                        delete next[project.id];
                        return next;
                      })
                    }
                  />
                  <span>
                    {project.name}
                    {project.enabled ? "" : " · på pause"}
                  </span>
                </label>
                {project.id in selected && (
                  <label>
                    Prompt til {project.name}
                    <select
                      aria-label={`Prompt til ${project.name}`}
                      value={selected[project.id]}
                      onChange={(event) =>
                        setSelected((previous) => ({
                          ...previous,
                          [project.id]: event.target.value,
                        }))
                      }
                    >
                      {options.map((prompt) => (
                        <option
                          key={promptKey(prompt)}
                          value={promptKey(prompt)}
                        >
                          {prompt.name} · v{prompt.version}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!options.length && (
                  <small className="muted">
                    Tilføj først en prompt til projektet.
                  </small>
                )}
              </div>
            );
          })}
        </fieldset>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Annullér
          </button>
          <button className="button primary" type="submit">
            {isNew ? "Opret demoinvitation" : "Gem ændringer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PlanEditor({
  plan,
  onClose,
  onSave,
}: {
  plan: Plan;
  onClose: () => void;
  onSave: (plan: Plan) => void;
}) {
  const [name, setName] = useState(plan.name);
  const [allowance, setAllowance] = useState(String(plan.allowance));
  const [price, setPrice] = useState(String(plan.price));
  return (
    <Modal title="Redigér demopakke" onClose={onClose}>
      <p className="notice">
        Priserne er illustrative. Ændringer gælder kun denne demosession.
      </p>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim())
            onSave({
              ...plan,
              name: name.trim(),
              allowance: Number(allowance),
              price: Number(price),
            });
        }}
      >
        <label>
          Pakkenavn
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={40}
          />
        </label>
        <label>
          Svar pr. periode
          <input
            type="number"
            min="1"
            max="100000"
            step="1"
            value={allowance}
            onChange={(e) => setAllowance(e.target.value)}
            required
          />
        </label>
        <label>
          Illustrativ pris (kr./måned)
          <input
            type="number"
            min="0"
            max="100000"
            step="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Annullér
          </button>
          <button className="button primary" type="submit">
            Gem pakke
          </button>
        </div>
      </form>
    </Modal>
  );
}
