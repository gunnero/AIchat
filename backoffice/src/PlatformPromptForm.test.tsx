import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { PlatformPromptForm } from "./PlatformPromptForm";
import { setLanguage, t } from "./i18n";
const project = {
  name: "Synthetic assistant",
  connection_id: "synthetic-connection",
};
afterEach(cleanup);
test.each(["en", "da"] as const)(
  "links an ID without copying instructions and preserves it on failure (%s)",
  async (language) => {
    setLanguage(language);
    const user = userEvent.setup(),
      save = vi.fn().mockResolvedValue(false);
    render(<PlatformPromptForm project={project} busy={false} save={save} />);
    expect(
      screen.queryByRole("textbox", { name: t("Instruktioner") }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        t(
          "AI-svar er ikke aktiveret endnu. Tilknytningen gemmes nu; adgang til prompten er endnu ikke testet.",
        ),
      ),
    ).toBeInTheDocument();
    await user.type(
      screen.getByLabelText(t("OpenAI-prompt-ID")),
      "  pmpt_synthetic  ",
    );
    await user.click(screen.getByRole("button", { name: t("Tilknyt prompt") }));
    expect(save).toHaveBeenCalledExactlyOnceWith({
      name: project.name,
      providerPromptId: "pmpt_synthetic",
    });
    expect(screen.getByLabelText(t("OpenAI-prompt-ID"))).toHaveValue(
      "pmpt_synthetic",
    );
  },
);
test("invalid references are rejected locally and an unconnected project cannot be linked", async () => {
  setLanguage("en");
  const save = vi.fn(),
    user = userEvent.setup();
  const view = render(
    <PlatformPromptForm project={project} busy={false} save={save} />,
  );
  const field = screen.getByLabelText(t("OpenAI-prompt-ID"));
  for (const value of [
    "proj_wrong",
    "key_wrong",
    "https://example.test/pmpt_x",
    "sk-proj-synthetic-not-a-prompt",
  ]) {
    fireEvent.change(field, { target: { value } });
    fireEvent.submit(field.closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent(
      t("Indsæt promptens ID fra OpenAI. Det starter med pmpt_."),
    );
    expect(save).not.toHaveBeenCalled();
  }
  view.unmount();
  render(
    <PlatformPromptForm
      project={{ ...project, connection_id: null }}
      busy={false}
      save={save}
    />,
  );
  expect(
    screen.getByRole("button", { name: t("Tilknyt prompt") }),
  ).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    t("Tilføj en API-forbindelse til projektet først."),
  );
});
