import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { UsagePage, type UsageOverview, type OpenAIReport } from "./UsagePage";
import { api } from "./client";
import { setLanguage, t } from "./i18n";
vi.mock("./client", () => ({ api: vi.fn() }));
const mocked = vi.mocked(api);
const current = new Date().toISOString().slice(0, 7);
const previous = new Date();
previous.setUTCMonth(previous.getUTCMonth() - 1, 1);
const previousMonth = previous.toISOString().slice(0, 7);
export const overview: UsageOverview = {
  asOf: new Date().toISOString(),
  appTrackingEnabled: false,
  allowanceUnit: "responses",
  connection: null,
  connectionRevision: 0,
  totalAllowance: 300,
  accounts: [
    {
      id: "person",
      accountId: "account",
      name: "Synthetic Customer",
      email: "customer@example.test",
      role: "Customer",
      status: "active",
      expires: null,
      allowance: 300,
      projects: [
        { id: "p1", name: "Yellow", enabled: true },
        { id: "p2", name: "Green", enabled: true },
      ],
    },
  ],
};
const connection = {
  label: "Synthetic organisation",
  suffix: "test",
  revision: 1,
  updatedAt: overview.asOf,
};
const report = (month = current, revision = 1): OpenAIReport => ({
  month,
  start: 0,
  end: 1,
  connectionRevision: revision,
  fetchedAt: overview.asOf,
  currency: "usd",
  totals: {
    costUsd: "12.34",
    inputTokens: 1000,
    outputTokens: 500,
    requests: 6,
  },
  projects: [
    {
      projectRef: "proj_synthetic",
      appProjects: [{ id: "p1", name: "Yellow" }],
      costUsd: "12.34",
      inputTokens: 1000,
      outputTokens: 500,
      requests: 6,
    },
  ],
  days: [
    {
      day: month + "-01",
      costUsd: "12.34",
      inputTokens: 1000,
      outputTokens: 500,
      requests: 6,
    },
  ],
});
beforeEach(() => {
  setLanguage("en");
  mocked.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const props = () => ({
  refreshKey: 0,
  connect: vi.fn(),
  disconnect: vi.fn(),
  manage: vi.fn(),
});
test.each(["en", "da"] as const)(
  "unconnected usage shows actual allowances once and keeps unknown tokens/costs unavailable (%s)",
  async (language) => {
    setLanguage(language);
    mocked.mockResolvedValue(overview);
    const actions = props();
    render(<UsagePage {...actions} />);
    const table = await screen.findByRole("table", {
      name: t("Brugere og tildelte rammer"),
    });
    expect(within(table).getByText("Synthetic Customer")).toBeVisible();
    expect(within(table).getByText("300")).toBeVisible();
    expect(within(table).getAllByText(t("Ikke målt"))).toHaveLength(2);
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(
      mocked.mock.calls.some(([path]) => path.startsWith("/usage/openai")),
    ).toBe(false);
    await userEvent.click(
      screen.getByRole("button", { name: t("Tilslut rapportering") }),
    );
    expect(actions.connect).toHaveBeenCalledWith(null, 0);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: t("Projekt") }),
      "p2",
    );
    expect(within(table).getByText("300")).toBeVisible();
    await userEvent.type(screen.getByRole("searchbox"), "no-match");
    expect(within(table).queryByText("Synthetic Customer")).toBeNull();
    expect(
      within(table).getByText(t("Ingen brugere matcher filtrene.")),
    ).toBeVisible();
  },
);
test.each(["en", "da"] as const)(
  "connected reporting displays provider totals separately from unmeasured customer activity (%s)",
  async (language) => {
    setLanguage(language);
    mocked.mockImplementation(async (path) =>
      path === "/usage"
        ? { ...overview, connection, connectionRevision: 1 }
        : report(),
    );
    render(<UsagePage {...props()} />);
    const table = await screen.findByRole("table", {
      name: t("OpenAI-forbrug pr. projekt"),
    });
    expect(within(table).getByText("Yellow")).toBeVisible();
    expect(within(table).getByText("proj_synthetic")).toBeVisible();
    expect(
      within(
        screen.getByRole("table", { name: t("Brugere og tildelte rammer") }),
      ).getAllByText(t("Ikke målt")),
    ).toHaveLength(2);
    expect(
      screen.getByText((content) =>
        content.startsWith(t("Senest hentet") + ":"),
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByText(t("Vis dagligt forbrug")));
    expect(
      screen.getByRole("table", { name: t("Dagligt OpenAI-forbrug") }),
    ).toBeVisible();
  },
);
test("disconnecting while a report is pending clears stale organisation figures", async () => {
  let finish!: (value: OpenAIReport) => void,
    connected = true;
  const pending = new Promise<OpenAIReport>((r) => {
    finish = r;
  });
  mocked.mockImplementation(async (path) =>
    path === "/usage"
      ? {
          ...overview,
          connection: connected ? connection : null,
          connectionRevision: connected ? 1 : 2,
        }
      : pending,
  );
  const actions = props(),
    view = render(<UsagePage {...actions} />);
  await waitFor(() =>
    expect(mocked).toHaveBeenCalledWith("/usage/openai?month=" + current),
  );
  connected = false;
  view.rerender(<UsagePage {...actions} refreshKey={1} />);
  await screen.findByRole("button", { name: t("Tilslut rapportering") });
  await act(async () => {
    finish(report());
    await pending;
  });
  expect(
    screen.queryByRole("table", { name: t("OpenAI-forbrug pr. projekt") }),
  ).toBeNull();
  expect(screen.queryByText("proj_synthetic")).toBeNull();
});
test("changing month ignores an older pending response", async () => {
  let finish!: (value: OpenAIReport) => void;
  const pending = new Promise<OpenAIReport>((r) => {
    finish = r;
  });
  mocked.mockImplementation(async (path) =>
    path === "/usage"
      ? { ...overview, connection, connectionRevision: 1 }
      : path.endsWith(current)
        ? pending
        : { ...report(previousMonth), projects: [] },
  );
  render(<UsagePage {...props()} />);
  const picker = await screen.findByLabelText(t("Måned · UTC"));
  fireEvent.change(picker, { target: { value: previousMonth } });
  await screen.findByText(
    t("OpenAI har endnu ikke rapporteret forbrug i denne periode."),
  );
  await act(async () => {
    finish(report());
    await pending;
  });
  expect(screen.queryByText("proj_synthetic")).toBeNull();
  expect(picker).toHaveValue(previousMonth);
});
test("a failed provider report shows a clear error and refresh can recover without inventing zero costs", async () => {
  let failed = true;
  mocked.mockImplementation(async (path) => {
    if (path === "/usage")
      return {
        ...overview,
        connection,
        connectionRevision: 1,
        asOf: new Date().toISOString(),
      };
    if (failed) throw new Error("Report unavailable");
    return report();
  });
  render(<UsagePage {...props()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Report unavailable",
  );
  expect(screen.getAllByText("—")).toHaveLength(3);
  failed = false;
  await userEvent.click(
    screen.getByRole("button", { name: t("Opdatér overblik") }),
  );
  expect(
    await screen.findByRole("table", {
      name: t("OpenAI-forbrug pr. projekt"),
    }),
  ).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
});
