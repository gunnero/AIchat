import type { Chat } from "./domain";

export type AssistantProject = {
  id: string;
  name: string;
  description: string;
  platformProjectRef: string;
  enabled: boolean;
};

export type PromptVersion = {
  id: string;
  projectId: string;
  name: string;
  version: number;
  sourceRef: string;
  summary: string;
  demoReply: string;
};

export type ProjectAssignment = {
  customerId: string;
  projectId: string;
  promptId: string;
  promptVersion: number;
};

export type AssignedProject = {
  project: AssistantProject;
  prompt: PromptVersion;
};

export const promptKey = (prompt: Pick<PromptVersion, "id" | "version">) =>
  `${prompt.id}:${prompt.version}`;

export function createDemoProjects(): AssistantProject[] {
  return [
    {
      id: "green",
      name: "green",
      description: "Varm og nærværende kommunikation til dine kunder.",
      platformProjectRef: "proj_demo_green",
      enabled: true,
    },
    {
      id: "yellow",
      name: "yellow",
      description: "Klare budskaber og konkrete næste skridt.",
      platformProjectRef: "proj_demo_yellow",
      enabled: true,
    },
    {
      id: "testai",
      name: "TESTAI",
      description: "Et separat demoprojekt til intern afprøvning.",
      platformProjectRef: "proj_demo_testai",
      enabled: true,
    },
  ];
}

export function createDemoPrompts(): PromptVersion[] {
  return [
    {
      id: "green-helle",
      projectId: "green",
      name: "Helle",
      version: 1,
      sourceRef: "pmpt_demo_green_helle",
      summary: "Rolig, personlig og tryg kommunikation med plads til kunden.",
      demoReply: "",
    },
    {
      id: "green-aleksandar",
      projectId: "green",
      name: "Aleksandar",
      version: 1,
      sourceRef: "pmpt_demo_green_aleksandar",
      summary: "En kortere vinkel med tydelig struktur og et konkret forslag.",
      demoReply:
        "Her er et kort og overskueligt forslag:\n\n## Et enkelt sted at begynde\n\nFortæl kunden, hvad du hjælper med, og beskriv ét konkret næste skridt. Hold sproget varmt og let at forstå.\n\nDette er et forberedt demosvar til Aleksandar-prompten i green.",
    },
    {
      id: "yellow-aleksandar",
      projectId: "yellow",
      name: "Aleksandar",
      version: 1,
      sourceRef: "pmpt_demo_yellow_aleksandar",
      summary: "Direkte og konkret kommunikation med fokus på handling.",
      demoReply:
        "Lad os gøre næste skridt tydeligt:\n\n## Fra idé til handling\n\nBeskriv dit mål i én sætning. Vælg derefter én handling, kunden kan tage i dag, og forklar præcist, hvad der sker bagefter.\n\nDette er et forberedt demosvar til Aleksandar-prompten i yellow.",
    },
    {
      id: "testai-helle",
      projectId: "testai",
      name: "Helle",
      version: 1,
      sourceRef: "pmpt_demo_testai_helle",
      summary: "Et afgrænset eksempel til afprøvning af projektadgang.",
      demoReply:
        "## Et separat eksempel\n\nDu arbejder nu i TESTAI. Samtaler fra dine andre projekter indgår ikke i denne demosamtale.",
    },
  ];
}

export function createDemoAssignments(): ProjectAssignment[] {
  return [
    {
      customerId: "sofie",
      projectId: "green",
      promptId: "green-helle",
      promptVersion: 1,
    },
    {
      customerId: "sofie",
      projectId: "yellow",
      promptId: "yellow-aleksandar",
      promptVersion: 1,
    },
    {
      customerId: "maria",
      projectId: "green",
      promptId: "green-aleksandar",
      promptVersion: 1,
    },
    {
      customerId: "anders",
      projectId: "green",
      promptId: "green-helle",
      promptVersion: 1,
    },
  ];
}

// Demo routing only. Production must enforce this in the authenticated API/database.
export function assignedProjects(
  customerId: string,
  projects: AssistantProject[],
  prompts: PromptVersion[],
  assignments: ProjectAssignment[],
): AssignedProject[] {
  return projects.flatMap((project) => {
    if (!project.enabled) return [];
    const matches = assignments.filter(
      (a) => a.customerId === customerId && a.projectId === project.id,
    );
    if (matches.length !== 1) return [];
    const assignment = matches[0];
    const prompt = prompts.find(
      (p) =>
        p.projectId === project.id &&
        p.id === assignment.promptId &&
        p.version === assignment.promptVersion,
    );
    return prompt ? [{ project, prompt }] : [];
  });
}

export function projectChats(
  chats: Chat[],
  customerId: string,
  projectId: string,
): Chat[] {
  return chats.filter(
    (chat) => chat.customerId === customerId && chat.projectId === projectId,
  );
}

export function createProjectChat(
  customerId: string,
  assignment: AssignedProject,
  id: string,
): Chat {
  return {
    id,
    customerId,
    projectId: assignment.project.id,
    promptId: assignment.prompt.id,
    promptVersion: assignment.prompt.version,
    title: "Ny samtale",
    messages: [],
  };
}

export function canContinueChat(
  chat: Chat,
  customerId: string,
  assignment: AssignedProject,
): boolean {
  return (
    chat.customerId === customerId &&
    chat.projectId === assignment.project.id &&
    chat.promptId === assignment.prompt.id &&
    chat.promptVersion === assignment.prompt.version
  );
}

export function validateAssignments(
  customerId: string,
  assignments: ProjectAssignment[],
  projects: AssistantProject[],
  prompts: PromptVersion[],
): string | null {
  const seen = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.customerId !== customerId || seen.has(assignment.projectId))
      return "Vælg præcis én promptversion pr. projekt og kunde.";
    seen.add(assignment.projectId);
    if (
      !projects.some((p) => p.id === assignment.projectId) ||
      !prompts.some(
        (p) =>
          p.projectId === assignment.projectId &&
          p.id === assignment.promptId &&
          p.version === assignment.promptVersion,
      )
    )
      return "Vælg en gyldig prompt fra det valgte projekt.";
  }
  return null;
}
