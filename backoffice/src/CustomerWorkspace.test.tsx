import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { CustomerWorkspace } from "./CustomerWorkspace";
import { api, type Session } from "./client";
import { setLanguage, t } from "./i18n";
vi.mock("./client", () => ({ api: vi.fn() }));
const mocked = vi.mocked(api);
const session: Session = {
  id: "customer-a",
  name: "Synthetic A",
  email: "a@example.test",
  username: "synthetic-a",
  locale: "en",
  role: "Customer",
  csrf: "synthetic-csrf",
};
const projects = [
  { id: "p1", name: "Project one", description: "First workspace" },
  { id: "p2", name: "Project two", description: "Second workspace" },
];
const meta = (projectId = "p1", id = "c1") => ({
  id,
  projectId,
  title: "Private title " + id,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  writable: true,
});
const msg = (text: string, id = "m1") => ({
  id,
  requestId: id,
  sequence: 1,
  role: "user",
  text,
  createdAt: Date.now(),
});
beforeEach(() => {
  setLanguage("en");
  mocked.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
test.each(["en", "da"] as const)(
  "project switching uses the assigned sidebar colour and safely defaults unknown colours (%s)",
  async (language) => {
    setLanguage(language);
    const colored = [
      { ...projects[0], color: "yellow" },
      { ...projects[1], color: "purple" },
      { id: "p3", name: "Green platform", description: "", color: "green" },
      {
        id: "p4",
        name: "Unknown platform",
        description: "",
        color: "url(untrusted)",
      },
    ];
    mocked.mockImplementation(async (path) =>
      path === "/customer/projects"
        ? { projects: colored }
        : { items: [], nextCursor: null },
    );
    const user = userEvent.setup();
    const { container } = render(
      <CustomerWorkspace session={session} logout={vi.fn()} />,
    );
    const selector = await screen.findByRole("combobox", {
      name: t("Dine projekter"),
    });
    const shell = container.querySelector(".cw-shell");
    await waitFor(() =>
      expect(shell).toHaveAttribute("data-project-color", "yellow"),
    );
    for (const [id, color] of [
      ["p2", "purple"],
      ["p3", "green"],
      ["p4", "black"],
      ["p1", "yellow"],
    ]) {
      await user.selectOptions(selector, id);
      expect(shell).toHaveAttribute("data-project-color", color);
    }
    expect(
      mocked.mock.calls.every(([, method = "GET"]) => method === "GET"),
    ).toBe(true);
  },
);

test("saving retries reuse a request ID and render untrusted saved text literally, with no simulated AI reply", async () => {
  const user = userEvent.setup();
  let created = false,
    saves = 0;
  const requests: unknown[] = [];
  let saved: ReturnType<typeof msg>[] = [];
  mocked.mockImplementation(async (path, method = "GET", body) => {
    if (path === "/customer/projects") return { projects };
    if (method === "POST" && path.endsWith("/conversations")) {
      created = true;
      return meta();
    }
    if (method === "POST" && path.endsWith("/messages")) {
      requests.push(body);
      if (++saves === 1) throw new Error("Connection lost");
      saved = [msg((body as { text: string }).text)];
      return saved[0];
    }
    if (path.endsWith("/messages")) return { items: saved, before: null };
    if (path.endsWith("/c1")) return meta();
    return { items: created ? [meta()] : [], nextCursor: null };
  });
  render(<CustomerWorkspace session={session} logout={vi.fn()} />);
  await user.click(
    await screen.findByRole("button", { name: "Start a conversation" }),
  );
  const input = await screen.findByRole("textbox", { name: "Your message" });
  await user.type(input, "<img src=x onerror=alert(1)>");
  await user.click(screen.getByRole("button", { name: "Save message" }));
  expect(await screen.findByText("Connection lost")).toBeInTheDocument();
  expect(input).toHaveValue("<img src=x onerror=alert(1)>");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save message" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Save message" }));
  await waitFor(() => expect(input).toHaveValue(""));
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  expect(document.querySelector('img[src="x"]')).toBeNull();
  expect(
    screen.getByText(
      "Your messages are saved privately. AI replies are not enabled yet.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("Assistant")).not.toBeInTheDocument();
});
test("project switches keep drafts separate and confirmed deletion clears the conversation from the screen", async () => {
  const user = userEvent.setup();
  const created = new Set<string>();
  let deleted = false;
  mocked.mockImplementation(async (path, method = "GET") => {
    if (path === "/customer/projects") return { projects };
    const project = path.includes("/p2/") ? "p2" : "p1",
      id = project === "p1" ? "c1" : "c2";
    if (method === "POST") {
      created.add(project);
      return meta(project, id);
    }
    if (method === "DELETE") {
      deleted = true;
      return { ok: true };
    }
    if (path.endsWith("/messages")) return { items: [], before: null };
    if (path.endsWith("/" + id)) return meta(project, id);
    return {
      items:
        created.has(project) && !(deleted && project === "p1")
          ? [meta(project, id)]
          : [],
      nextCursor: null,
    };
  });
  render(<CustomerWorkspace session={session} logout={vi.fn()} />);
  await user.click(
    await screen.findByRole("button", { name: "Start a conversation" }),
  );
  await user.type(
    await screen.findByRole("textbox", { name: "Your message" }),
    "First private draft",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Your projects" }),
    "p2",
  );
  await user.click(
    await screen.findByRole("button", { name: "Start a conversation" }),
  );
  const second = await screen.findByRole("textbox", { name: "Your message" });
  expect(second).toHaveValue("");
  await user.type(second, "Second draft");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Your projects" }),
    "p1",
  );
  await user.click(
    await screen.findByRole("button", { name: /Private title c1/ }),
  );
  expect(
    await screen.findByRole("textbox", { name: "Your message" }),
  ).toHaveValue("First private draft");
  await user.click(screen.getByRole("button", { name: "Delete conversation" }));
  const dialog = screen.getByRole("dialog", { name: "Delete conversation" });
  await user.click(
    within(dialog).getByRole("button", { name: "Delete conversation" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("textbox", { name: "Your message" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("button", { name: /Private title c1/ }),
  ).not.toBeInTheDocument();
});
test("an old account response cannot enter a newly mounted account and title search sends only the title query", async () => {
  const user = userEvent.setup();
  let owner = "a",
    release: (v: unknown) => void = () => {};
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  mocked.mockImplementation(async (path) => {
    if (path === "/customer/projects") return { projects };
    if (path.endsWith("/messages"))
      return owner === "a"
        ? delayed
        : { items: [msg("Customer B private message")], before: null };
    if (path.endsWith("/c1")) return meta();
    return { items: [meta()], nextCursor: null };
  });
  const view = render(<CustomerWorkspace session={session} logout={vi.fn()} />);
  await user.click(
    await screen.findByRole("button", { name: /Private title c1/ }),
  );
  await waitFor(() =>
    expect(mocked).toHaveBeenCalledWith(
      "/customer/projects/p1/conversations/c1/messages",
    ),
  );
  view.unmount();
  owner = "b";
  render(
    <CustomerWorkspace
      session={{ ...session, id: "customer-b", name: "Synthetic B" }}
      logout={vi.fn()}
    />,
  );
  await user.click(
    await screen.findByRole("button", { name: /Private title c1/ }),
  );
  expect(
    await screen.findByText("Customer B private message"),
  ).toBeInTheDocument();
  release({ items: [msg("Customer A stale private message")], before: null });
  await new Promise((r) => setTimeout(r, 10));
  expect(
    screen.queryByText("Customer A stale private message"),
  ).not.toBeInTheDocument();
  await user.type(
    screen.getByRole("searchbox", { name: "Search conversation titles" }),
    "Invoice",
  );
  await waitFor(() =>
    expect(mocked).toHaveBeenCalledWith(
      "/customer/projects/p1/conversations?q=Invoice",
    ),
  );
  setLanguage("da");
  expect(
    await screen.findByText(
      "Dine beskeder gemmes privat. AI-svar er endnu ikke aktiveret.",
    ),
  ).toBeInTheDocument();
});
