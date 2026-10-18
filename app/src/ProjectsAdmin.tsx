import { useState, type Dispatch, type SetStateAction } from "react";
import { PlusIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { Modal } from "./Modal";
import {
  promptKey,
  type AssistantProject,
  type ProjectAssignment,
  type PromptVersion,
} from "./projects";

export function ProjectsAdmin({
  projects,
  setProjects,
  prompts,
  setPrompts,
  assignments,
  notify,
}: {
  projects: AssistantProject[];
  setProjects: Dispatch<SetStateAction<AssistantProject[]>>;
  prompts: PromptVersion[];
  setPrompts: Dispatch<SetStateAction<PromptVersion[]>>;
  assignments: ProjectAssignment[];
  notify: (text: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(projects[0]?.id ?? "");
  const [editingProject, setEditingProject] = useState<
    AssistantProject | "new" | null
  >(null);
  const [editingPrompt, setEditingPrompt] = useState<
    PromptVersion | "new" | null
  >(null);
  const project = projects.find((p) => p.id === selectedId) ?? projects[0];
  const versions = prompts.filter((p) => p.projectId === project?.id);

  return (
    <>
      <div className="table-toolbar project-toolbar">
        <label className="catalog-select">
          Projekt
          <select
            aria-label="Administrér projekt"
            value={project?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.enabled ? "" : " · på pause"}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button primary"
          onClick={() => setEditingProject("new")}
        >
          <PlusIcon size={20} />
          Tilføj projekt
        </button>
      </div>
      {project && (
        <>
          <section className="project-summary" aria-label="Projektoversigt">
            <div>
              <span className="eyebrow">PROJEKT</span>
              <h3>{project.name}</h3>
              <p>{project.description}</p>
              <span
                className={"pill " + (project.enabled ? "active" : "suspended")}
              >
                {project.enabled ? "Aktivt" : "På pause"}
              </span>
              <p className="muted project-reference">
                OpenAI-reference: {project.platformProjectRef || "Ikke angivet"}
              </p>
            </div>
            <button
              className="button secondary"
              onClick={() => setEditingProject(project)}
            >
              <PencilSimpleIcon size={19} />
              Redigér projekt
            </button>
          </section>
          <div className="table-toolbar">
            <div>
              <h3 className="section-title">Prompter i {project.name}</h3>
              <p className="muted">
                Hver kunde får én bestemt promptversion i dette projekt.
              </p>
            </div>
            <button
              className="button secondary"
              onClick={() => setEditingPrompt("new")}
            >
              <PlusIcon size={19} />
              Tilføj prompt
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Prompt</th>
                  <th>Version</th>
                  <th>Tildelt til</th>
                  <th>
                    <span className="sr-only">Handlinger</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {versions.map((p) => {
                  const count = assignments.filter(
                    (a) =>
                      a.projectId === p.projectId &&
                      a.promptId === p.id &&
                      a.promptVersion === p.version,
                  ).length;
                  return (
                    <tr key={promptKey(p)}>
                      <td>
                        <strong>{p.name}</strong>
                        <span className="table-email">{p.summary}</span>
                      </td>
                      <td>v{p.version}</td>
                      <td>
                        {count} {count === 1 ? "kunde" : "kunder"}
                      </td>
                      <td>
                        <button
                          className="text-button"
                          aria-label={`Ny version af ${p.name} v${p.version}`}
                          onClick={() => setEditingPrompt(p)}
                        >
                          Opret ny version
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!versions.length && (
              <p className="empty-note">
                Tilføj en prompt, før projektet kan tildeles en kunde.
              </p>
            )}
          </div>
        </>
      )}
      <p className="fine-print">
        Projekt- og promptreferencer er fiktive. Demoen synkroniserer ikke med
        OpenAI. Nye versioner ændrer ikke eksisterende tildelinger; vælg en ny
        version under kunden.
      </p>
      {editingProject && (
        <ProjectEditor
          project={editingProject}
          projects={projects}
          onClose={() => setEditingProject(null)}
          onSave={(saved) => {
            setProjects((previous) =>
              editingProject === "new"
                ? [...previous, saved]
                : previous.map((p) => (p.id === saved.id ? saved : p)),
            );
            setSelectedId(saved.id);
            setEditingProject(null);
            notify("Demoprojektet er gemt.");
          }}
        />
      )}
      {editingPrompt && project && (
        <PromptEditor
          prompt={editingPrompt}
          project={project}
          prompts={prompts}
          onClose={() => setEditingPrompt(null)}
          onSave={(saved) => {
            setPrompts((previous) => [...previous, saved]);
            setEditingPrompt(null);
            notify(
              "Promptversionen er gemt. Tildel den til en kunde for at bruge den.",
            );
          }}
        />
      )}
    </>
  );
}

function ProjectEditor({
  project,
  projects,
  onClose,
  onSave,
}: {
  project: AssistantProject | "new";
  projects: AssistantProject[];
  onClose: () => void;
  onSave: (project: AssistantProject) => void;
}) {
  const [name, setName] = useState(project === "new" ? "" : project.name);
  const [description, setDescription] = useState(
    project === "new" ? "" : project.description,
  );
  const [reference, setReference] = useState(
    project === "new" ? "" : project.platformProjectRef,
  );
  const [enabled, setEnabled] = useState(
    project === "new" ? true : project.enabled,
  );
  const [error, setError] = useState("");
  return (
    <Modal
      title={
        project === "new" ? "Tilføj demoprojekt" : "Redigér " + project.name
      }
      onClose={onClose}
    >
      <p className="muted">
        Opret en projektpost i demoen. Brug kun fiktive oplysninger.
      </p>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return setError("Skriv projektets navn.");
          if (
            projects.some(
              (p) =>
                p.name.toLocaleLowerCase() ===
                  name.trim().toLocaleLowerCase() &&
                (project === "new" || p.id !== project.id),
            )
          )
            return setError("Et projekt med dette navn findes allerede.");
          onSave({
            id: project === "new" ? crypto.randomUUID() : project.id,
            name: name.trim(),
            description: description.trim(),
            platformProjectRef: reference.trim(),
            enabled,
          });
        }}
      >
        <label>
          Projektnavn
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Beskrivelse
          <textarea
            rows={3}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          OpenAI-projekt-ID (valgfrit)
          <input
            maxLength={100}
            placeholder="proj_demo_eksempel"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Projektet er aktivt
        </label>
        <p className="fine-print">
          Et projekt på pause skjules for kunderne. Samtaler slettes ikke.
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Annullér
          </button>
          <button className="button primary">Gem projekt</button>
        </div>
      </form>
    </Modal>
  );
}

function PromptEditor({
  prompt,
  project,
  prompts,
  onClose,
  onSave,
}: {
  prompt: PromptVersion | "new";
  project: AssistantProject;
  prompts: PromptVersion[];
  onClose: () => void;
  onSave: (prompt: PromptVersion) => void;
}) {
  const [name, setName] = useState(prompt === "new" ? "" : prompt.name);
  const [summary, setSummary] = useState(
    prompt === "new" ? "" : prompt.summary,
  );
  const [sourceRef, setSourceRef] = useState(
    prompt === "new" ? "" : prompt.sourceRef,
  );
  const [demoReply, setDemoReply] = useState(
    prompt === "new" ? "" : prompt.demoReply,
  );
  const [error, setError] = useState("");
  const version =
    prompt === "new"
      ? 1
      : Math.max(
          ...prompts
            .filter((p) => p.id === prompt.id && p.projectId === project.id)
            .map((p) => p.version),
        ) + 1;
  return (
    <Modal
      title={
        prompt === "new"
          ? "Tilføj prompt til " + project.name
          : "Ny version af " + prompt.name
      }
      onClose={onClose}
      wide
    >
      <p className="notice">
        Ny version: v{version}. Eksisterende versioner og kundetildelinger
        bevares.
      </p>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return setError("Skriv promptens navn.");
          if (
            prompts.some(
              (p) =>
                p.projectId === project.id &&
                p.name.toLocaleLowerCase() ===
                  name.trim().toLocaleLowerCase() &&
                (prompt === "new" || p.id !== prompt.id),
            )
          )
            return setError(
              "En prompt med dette navn findes allerede i projektet.",
            );
          onSave({
            id: prompt === "new" ? crypto.randomUUID() : prompt.id,
            projectId: project.id,
            name: name.trim(),
            version,
            sourceRef: sourceRef.trim(),
            summary: summary.trim(),
            demoReply: demoReply.trim(),
          });
        }}
      >
        <label>
          Promptnavn
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Formål og tone
          <textarea
            rows={2}
            maxLength={500}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        <label>
          Oprindelig promptreference (valgfri)
          <input
            maxLength={100}
            value={sourceRef}
            placeholder="pmpt_demo_eksempel"
            onChange={(e) => setSourceRef(e.target.value)}
          />
        </label>
        <label>
          Forberedt demosvar (valgfrit)
          <textarea
            rows={5}
            maxLength={4000}
            value={demoReply}
            onChange={(e) => setDemoReply(e.target.value)}
          />
        </label>
        <p className="fine-print">
          Demoen bruger forberedte svar. Dette opretter ikke en prompt i OpenAI
          og henter ikke promptindhold fra platformen. Brug kun fiktiv tekst.
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Annullér
          </button>
          <button className="button primary">Gem promptversion</button>
        </div>
      </form>
    </Modal>
  );
}
