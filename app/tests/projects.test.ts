import { describe, expect, it } from "vitest";
import { createDemoChats, createShare } from "../src/domain";
import {
  assignedProjects,
  canContinueChat,
  createDemoAssignments,
  createDemoProjects,
  createDemoPrompts,
  createProjectChat,
  projectChats,
  validateAssignments,
} from "../src/projects";

describe("customer project and prompt assignments", () => {
  it("resolves multiple projects with a different prompt for each customer", () => {
    const projects = createDemoProjects(),
      prompts = createDemoPrompts(),
      assignments = createDemoAssignments();
    const sofie = assignedProjects("sofie", projects, prompts, assignments);
    const maria = assignedProjects("maria", projects, prompts, assignments);
    expect(sofie.map((p) => [p.project.id, p.prompt.id])).toEqual([
      ["green", "green-helle"],
      ["yellow", "yellow-aleksandar"],
    ]);
    expect(maria.map((p) => [p.project.id, p.prompt.id])).toEqual([
      ["green", "green-aleksandar"],
    ]);
    expect(assignedProjects("unknown", projects, prompts, assignments)).toEqual(
      [],
    );
  });
  it("rejects cross-project prompt references and missing prompt versions", () => {
    const projects = createDemoProjects(),
      prompts = createDemoPrompts();
    for (const assignment of [
      {
        customerId: "sofie",
        projectId: "green",
        promptId: "yellow-aleksandar",
        promptVersion: 1,
      },
      {
        customerId: "sofie",
        projectId: "green",
        promptId: "green-helle",
        promptVersion: 999,
      },
    ]) {
      expect(
        assignedProjects("sofie", projects, prompts, [assignment]),
      ).toEqual([]);
      expect(
        validateAssignments("sofie", [assignment], projects, prompts),
      ).toBeTruthy();
    }
  });
  it("denies ambiguous grants, paused projects and another customer's assignments", () => {
    const projects = createDemoProjects(),
      prompts = createDemoPrompts();
    const assignment = createDemoAssignments()[0];
    expect(
      assignedProjects("sofie", projects, prompts, [assignment, assignment]),
    ).toEqual([]);
    expect(
      validateAssignments("sofie", [assignment, assignment], projects, prompts),
    ).toBeTruthy();
    expect(
      validateAssignments("maria", [assignment], projects, prompts),
    ).toBeTruthy();
    expect(
      assignedProjects(
        "sofie",
        projects.map((p) => ({ ...p, enabled: false })),
        prompts,
        [assignment],
      ),
    ).toEqual([]);
  });
  it("scopes history to both the customer and project", () => {
    const chats = createDemoChats();
    chats.push({
      ...chats[0],
      id: "maria-private",
      customerId: "maria",
      title: "PRIVATE MARIA",
    });
    const green = projectChats(chats, "sofie", "green");
    expect(green.map((c) => c.id)).toEqual(["welcome", "linkedin", "website"]);
    expect(projectChats(chats, "sofie", "yellow").map((c) => c.id)).toEqual([
      "yellow-plan",
    ]);
    expect(JSON.stringify(green)).not.toContain("PRIVATE MARIA");
  });
  it("keeps old chats pinned and blocks continuation after prompt reassignment", () => {
    const projects = createDemoProjects(),
      prompts = createDemoPrompts(),
      assignments = createDemoAssignments();
    const original = createDemoChats()[0];
    const oldRoute = assignedProjects(
      "sofie",
      projects,
      prompts,
      assignments,
    )[0];
    expect(canContinueChat(original, "sofie", oldRoute)).toBe(true);
    const revision = {
      ...oldRoute.prompt,
      version: 2,
      demoReply: "NEW VERSION",
    };
    prompts.push(revision);
    const updated = assignments.map((a) =>
      a.customerId === "sofie" && a.projectId === "green"
        ? { ...a, promptVersion: 2 }
        : a,
    );
    const newRoute = assignedProjects("sofie", projects, prompts, updated)[0];
    expect(original.promptVersion).toBe(1);
    expect(canContinueChat(original, "sofie", newRoute)).toBe(false);
    expect(canContinueChat(original, "maria", oldRoute)).toBe(false);
    const next = createProjectChat("sofie", newRoute, "new-chat");
    expect(next).toMatchObject({
      customerId: "sofie",
      projectId: "green",
      promptId: "green-helle",
      promptVersion: 2,
    });
    expect(canContinueChat(next, "sofie", newRoute)).toBe(true);
  });
  it("retains the origin of an explicitly shared copy without adding another project's content", () => {
    const chat = createDemoChats()[3];
    const share = createShare(
      chat,
      ["yellow-user"],
      "yellow-share",
      "2026-10-18",
    );
    expect(share).toMatchObject({
      customerId: "sofie",
      projectId: "yellow",
      chatId: "yellow-plan",
    });
    expect(share.messages).toHaveLength(1);
    expect(JSON.stringify(share)).not.toContain("Velkomstmail");
  });
});
