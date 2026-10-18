import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { PromptImportForm } from "./PromptImportForm";
import { setLanguage, t } from "./i18n";
import { PROMPT_BUNDLE_FORMAT } from "../server/prompt-bundle.mjs";
const project = { id: "synthetic-project", name: "Synthetic project" };
afterEach(cleanup);
function file(name: string, contents: string) {
  const value = new File([contents], name);
  Object.defineProperty(value, "text", {
    configurable: true,
    value: async () => contents,
  });
  return value;
}
function choose(value: File) {
  fireEvent.change(screen.getByLabelText(t("Vælg en fil · valgfrit")), {
    target: { files: [value] },
  });
}
test.each(["en", "da"] as const)(
  "pasted instructions preserve exact text and explicit source reference (%s)",
  async (language) => {
    setLanguage(language);
    const user = userEvent.setup(),
      save = vi.fn().mockResolvedValue(false);
    render(<PromptImportForm project={project} busy={false} save={save} />);
    const text = "  Synthetic instructions\n<script>literal</script>\n";
    fireEvent.change(screen.getByLabelText(t("Instruktioner")), {
      target: { value: text },
    });
    await user.click(screen.getByText(t("Kildereference · valgfrit")));
    await user.type(
      screen.getByLabelText(t("Oprindeligt prompt-ID og version")),
      "pmpt_synthetic v7",
    );
    await user.click(
      screen.getByRole("button", { name: t("Importér prompter") }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      prompts: [
        {
          name: project.name,
          instructions: text,
          sourceRef: "pmpt_synthetic v7",
        },
      ],
    });
    expect(screen.getByLabelText(t("Instruktioner"))).toHaveValue(text);
  },
);
test("text files become editable instructions; JSON bundles require review and render as literal text", async () => {
  setLanguage("en");
  const user = userEvent.setup(),
    save = vi.fn().mockResolvedValue(true);
  render(
    <PromptImportForm
      project={project}
      projectRef="proj_synthetic"
      busy={false}
      save={save}
    />,
  );
  choose(file("Source prompt.txt", "  Synthetic file\n"));
  await waitFor(() =>
    expect(screen.getByLabelText(t("Instruktioner"))).toHaveValue(
      "  Synthetic file\n",
    ),
  );
  expect(screen.getByLabelText(t("Navn på prompt"))).toHaveValue(
    "Source prompt",
  );
  const prompts = [
    {
      name: "First",
      instructions: "<img src=x onerror=alert(1)>",
      sourceRef: "pmpt_source v2",
    },
    { name: "Second", instructions: "Synthetic two" },
  ];
  choose(
    file(
      "bundle.json",
      JSON.stringify({
        format: PROMPT_BUNDLE_FORMAT,
        projectRef: "proj_synthetic",
        prompts,
      }),
    ),
  );
  const review = await screen.findByRole("region", {
    name: t("Gennemse importen"),
  });
  expect(within(review).getByText("First")).toBeInTheDocument();
  expect(review.querySelector("img")).toBeNull();
  expect(save).not.toHaveBeenCalled();
  await user.click(within(review).getByText("First"));
  expect(within(review).getByText(prompts[0].instructions)).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: t("Importér prompter") }),
  );
  expect(save).toHaveBeenCalledExactlyOnceWith({
    projectRef: "proj_synthetic",
    prompts: [prompts[0], { ...prompts[1], sourceRef: "" }],
  });
});
test("wrong-project, reference-only, unknown-format and oversized files cannot be imported", async () => {
  setLanguage("en");
  const save = vi.fn(),
    user = userEvent.setup();
  render(
    <PromptImportForm
      project={project}
      projectRef="proj_synthetic"
      busy={false}
      save={save}
    />,
  );
  for (const contents of [
    {
      format: PROMPT_BUNDLE_FORMAT,
      projectRef: "proj_other",
      prompts: [{ name: "Other", instructions: "Synthetic" }],
    },
    {
      format: PROMPT_BUNDLE_FORMAT,
      prompts: [{ name: "Reference only", sourceRef: "pmpt_synthetic" }],
    },
    {
      format: "unknown",
      prompts: [{ name: "Other", instructions: "Synthetic" }],
    },
  ]) {
    choose(file("bundle.json", JSON.stringify(contents)));
    await screen.findByRole("alert");
    await user.click(
      screen.getByRole("button", { name: t("Importér prompter") }),
    );
    expect(save).not.toHaveBeenCalled();
  }
  choose(file("huge.txt", "x".repeat(256001)));
  expect(screen.getByRole("alert")).toHaveTextContent(
    t("Vælg en tekstfil eller importfil på højst 256 KB."),
  );
  expect(save).not.toHaveBeenCalled();
});
test("an unfinished file read is ignored after unmount and never reaches the next form", async () => {
  setLanguage("en");
  let resolve!: (value: string) => void;
  const value = file("late.txt", ""),
    save = vi.fn();
  Object.defineProperty(value, "text", {
    configurable: true,
    value: () =>
      new Promise<string>((r) => {
        resolve = r;
      }),
  });
  const first = render(
    <PromptImportForm project={project} busy={false} save={save} />,
  );
  choose(value);
  first.unmount();
  render(
    <PromptImportForm
      project={{ ...project, id: "next", name: "Next account project" }}
      busy={false}
      save={save}
    />,
  );
  await act(async () => resolve("Late private instructions"));
  expect(screen.getByLabelText(t("Instruktioner"))).toHaveValue("");
  expect(screen.getByLabelText(t("Navn på prompt"))).toHaveValue(
    "Next account project",
  );
  expect(save).not.toHaveBeenCalled();
});
