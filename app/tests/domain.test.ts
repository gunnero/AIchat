import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createDemoChats,
  createDemoCustomers,
  createShare,
  visibleShares,
  adminCustomerRows,
  validateInvitation,
  streamDemo,
  welcomeAnswer,
} from "../src/domain";

afterEach(() => vi.useRealTimers());
describe("fixed sharing snapshots", () => {
  it("shares only selected complete messages and stays fixed after edits or future messages", () => {
    const chat = createDemoChats()[0];
    const share = createShare(
      chat,
      ["welcome-answer"],
      "share-1",
      "2026-10-16",
    );
    chat.messages[1].content = "Changed after sharing";
    chat.messages.push({
      id: "future",
      role: "user",
      content: "PRIVATE LATER MESSAGE",
      status: "complete",
    });
    expect(share.messages).toHaveLength(1);
    expect(share.messages[0].content).toBe(welcomeAnswer);
    expect(JSON.stringify(share)).not.toContain("PRIVATE LATER MESSAGE");
  });
  it("does not publish cancelled or incomplete text and rejects empty selections", () => {
    const chat = createDemoChats()[0];
    chat.messages[1].status = "cancelled";
    expect(() => createShare(chat, ["welcome-answer"], "1", "")).toThrow();
    expect(() => createShare(chat, [], "1", "")).toThrow();
  });
  it("removes revoked copies from the administrator inbox", () => {
    const share = createShare(createDemoChats()[0], ["welcome-user"], "1", "");
    expect(visibleShares([share])).toHaveLength(1);
    expect(visibleShares([{ ...share, revoked: true }])).toEqual([]);
  });
});
describe("demo account administration", () => {
  it("projects only account metadata even if the source contains private fields", () => {
    const customer = {
      ...createDemoCustomers()[0],
      chats: [{ title: "PRIVATE TITLE", content: "PRIVATE CONTENT" }],
    };
    const result = JSON.stringify(adminCustomerRows([customer]));
    expect(result).not.toContain("PRIVATE");
    expect(result).not.toContain("chats");
  });
  it("rejects invalid and duplicate invitations regardless of case/whitespace", () => {
    const customers = createDemoCustomers();
    expect(validateInvitation("not an email", customers)).toBeTruthy();
    expect(validateInvitation(" SOFIE@EXAMPLE.TEST ", customers)).toBeTruthy();
    expect(validateInvitation("new@example.test", customers)).toBeNull();
  });
});
describe("mock streaming lifecycle", () => {
  it("delivers the complete deterministic answer without losing whitespace", async () => {
    vi.useFakeTimers();
    const collect = async () => {
      let text = "";
      for await (const chunk of streamDemo(
        "velkomstmail",
        "normal",
        new AbortController().signal,
      ))
        text += chunk;
      return text;
    };
    const pending = collect();
    await vi.runAllTimersAsync();
    expect(await pending).toBe(welcomeAnswer);
  });
  it("stops an in-flight slow response without delivering later chunks", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const stream = streamDemo("hello", "slow", controller.signal);
    const next = stream.next();
    const assertion = expect(next).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await assertion;
    await vi.runAllTimersAsync();
    expect(await stream.next()).toEqual({ done: true, value: undefined });
  });
  it("surfaces a simulated provider failure", async () => {
    vi.useFakeTimers();
    const next = streamDemo(
      "hello",
      "error",
      new AbortController().signal,
    ).next();
    const assertion = expect(next).rejects.toThrow("Din tekst er bevaret");
    await vi.runAllTimersAsync();
    await assertion;
  });
});
