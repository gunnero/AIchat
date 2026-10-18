import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { App } from "../src/App";
import { MessageText } from "../src/MessageText";

function openProfile(label: string) {
  fireEvent.click(screen.getByRole("button", { name: "Åbn profilmenu" }));
  fireEvent.click(screen.getByRole("button", { name: label }));
}
describe("customer journeys", () => {
  it("switches between assigned projects, preserves drafts and uses the selected project's reply", async () => {
    render(<App />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "green",
      "yellow",
    ]);
    fireEvent.change(screen.getByRole("textbox", { name: "Skriv en besked" }), {
      target: { value: "PRIVATE GREEN DRAFT" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Vælg projekt" }), {
      target: { value: "yellow" },
    });
    expect(
      screen.queryByRole("button", { name: "Velkomstmail til nye kunder" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Et tydeligt næste skridt" }),
    ).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Skriv en besked" }),
    ).toHaveValue("");
    fireEvent.change(screen.getByRole("combobox", { name: "Vælg projekt" }), {
      target: { value: "green" },
    });
    expect(
      screen.getByRole("textbox", { name: "Skriv en besked" }),
    ).toHaveValue("PRIVATE GREEN DRAFT");
    fireEvent.change(screen.getByRole("combobox", { name: "Vælg projekt" }), {
      target: { value: "yellow" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ny samtale" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Skriv en besked" }), {
      target: { value: "Hjælp mig med en mail" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send besked" }));
    expect(
      await screen.findByText(
        /Aleksandar-prompten i yellow/,
        {},
        { timeout: 4000 },
      ),
    ).toBeVisible();
    expect(screen.queryByText("PRIVATE GREEN DRAFT")).not.toBeInTheDocument();
  });
  it("applies a customer's assigned prompt without changing existing conversations", async () => {
    render(<App />);
    openProfile("Administration (demo)");
    fireEvent.click(
      screen.getByRole("button", { name: "Administrér Sofie Jensen" }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Prompt til green" }),
      { target: { value: "green-aleksandar:1" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Gem ændringer" }));
    fireEvent.click(screen.getByRole("button", { name: "Til samtaler" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "prompttildeling er ændret",
    );
    expect(
      screen.getByRole("textbox", { name: "Skriv en besked" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Start ny samtale" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Skriv en besked" }), {
      target: { value: "En velkomstmail" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send besked" }));
    expect(
      await screen.findByText(
        /Aleksandar-prompten i green/,
        {},
        { timeout: 4000 },
      ),
    ).toBeVisible();
  });
  it("removes project access immediately, handles zero assignments and retains history for regrant", () => {
    render(<App />);
    openProfile("Administration (demo)");
    fireEvent.click(
      screen.getByRole("button", { name: "Administrér Sofie Jensen" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Adgang til green" }));
    fireEvent.click(screen.getByRole("button", { name: "Gem ændringer" }));
    fireEvent.click(screen.getByRole("button", { name: "Til samtaler" }));
    expect(screen.getByRole("combobox", { name: "Vælg projekt" })).toHaveValue(
      "yellow",
    );
    expect(
      screen.queryByText("Velkomstmail til nye kunder"),
    ).not.toBeInTheDocument();
    openProfile("Administration (demo)");
    fireEvent.click(
      screen.getByRole("button", { name: "Administrér Sofie Jensen" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Adgang til yellow" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Gem ændringer" }));
    fireEvent.click(screen.getByRole("button", { name: "Til samtaler" }));
    expect(
      screen.getByRole("heading", { name: "Ingen projekter tildelt endnu" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: "Skriv en besked" }),
    ).not.toBeInTheDocument();
    openProfile("Administration (demo)");
    fireEvent.click(
      screen.getByRole("button", { name: "Administrér Sofie Jensen" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Adgang til green" }));
    fireEvent.click(screen.getByRole("button", { name: "Gem ændringer" }));
    fireEvent.click(screen.getByRole("button", { name: "Til samtaler" }));
    expect(
      screen.getByRole("button", { name: "Velkomstmail til nye kunder" }),
    ).toBeVisible();
  });
  it("adds a project and a prompt, then grants only that customer's project access", () => {
    render(<App />);
    openProfile("Administration (demo)");
    fireEvent.click(
      screen.getByRole("button", { name: "Projekter og prompter" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Tilføj projekt" }));
    fireEvent.change(screen.getByLabelText("Projektnavn"), {
      target: { value: "Pilot" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gem projekt" }));
    fireEvent.click(screen.getByRole("button", { name: "Tilføj prompt" }));
    fireEvent.change(screen.getByLabelText("Promptnavn"), {
      target: { value: "Helles pilotprompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gem promptversion" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Kunder" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Administrér Sofie Jensen" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Adgang til Pilot" }));
    fireEvent.click(screen.getByRole("button", { name: "Gem ændringer" }));
    fireEvent.click(screen.getByRole("button", { name: "Til samtaler" }));
    const selector = screen.getByRole("combobox", { name: "Vælg projekt" });
    const option = within(selector).getByRole("option", {
      name: "Pilot",
    }) as HTMLOptionElement;
    fireEvent.change(selector, { target: { value: option.value } });
    expect(
      screen.getByText("Din prompt: Helles pilotprompt · v1"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Start en samtale" }));
    expect(
      screen.getByRole("textbox", { name: "Skriv en besked" }),
    ).toBeEnabled();
    expect(
      screen.queryByText("Velkomstmail til nye kunder"),
    ).not.toBeInTheDocument();
  });
  it("publishes an immutable new prompt version without silently changing customer assignments", () => {
    render(<App />);
    openProfile("Administration (demo)");
    fireEvent.click(
      screen.getByRole("button", { name: "Projekter og prompter" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Ny version af Helle v1" }),
    );
    fireEvent.change(screen.getByLabelText("Forberedt demosvar (valgfrit)"), {
      target: { value: "NEW PREPARED VERSION" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gem promptversion" }));
    expect(
      screen.getByRole("button", { name: "Ny version af Helle v1" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Ny version af Helle v2" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Til samtaler" }));
    expect(screen.getByText("Tildelt prompt: Helle · v1")).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Skriv en besked" }),
    ).toBeEnabled();
    expect(screen.queryByText("NEW PREPARED VERSION")).not.toBeInTheDocument();
  });
  it("keeps drafts attached to their conversation", () => {
    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Skriv en besked" }), {
      target: { value: "My unfinished draft" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Et roligt opslag til LinkedIn" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Skriv en besked" }),
    ).toHaveValue("");
    fireEvent.click(
      screen.getByRole("button", { name: "Velkomstmail til nye kunder" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Skriv en besked" }),
    ).toHaveValue("My unfinished draft");
  });
  it("shows a share only after explicit confirmation and hides it after revocation", () => {
    render(<App />);
    openProfile("Administration (demo)");
    expect(
      screen.queryByText("Velkomstmail til nye kunder"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delt med Helle" }));
    expect(screen.getByText("Ingen delte samtaler endnu")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Til samtaler" }));
    fireEvent.click(screen.getByRole("button", { name: "Del med Helle" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Del 2 beskeder med Helle" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Luk dialog" }));
    openProfile("Administration (demo)");
    expect(
      screen.getByRole("button", {
        name: /Velkomstmail til nye kunder.*fast kopi/,
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Til samtaler" }));
    fireEvent.click(screen.getByRole("button", { name: "Del med Helle" }));
    fireEvent.click(screen.getByRole("button", { name: "Tilbagekald deling" }));
    fireEvent.click(screen.getByRole("button", { name: "Luk dialog" }));
    openProfile("Administration (demo)");
    expect(screen.getByText("Ingen delte samtaler endnu")).toBeVisible();
  });
  it("preserves the draft on failure, allows retry and deducts one allowance on success", async () => {
    render(<App />);
    openProfile("Demoindstillinger");
    fireEvent.click(screen.getByRole("radio", { name: /Fejl ved svar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Brug indstilling" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Skriv en besked" }), {
      target: { value: "En velkomstmail" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send besked" }));
    await screen.findByRole("alert");
    expect(
      screen.getByRole("textbox", { name: "Skriv en besked" }),
    ).toHaveValue("En velkomstmail");
    expect(screen.getByText("180 af 300 svar tilbage")).toBeVisible();
    openProfile("Demoindstillinger");
    fireEvent.click(screen.getByRole("radio", { name: /^Normal/ }));
    fireEvent.click(screen.getByRole("button", { name: "Brug indstilling" }));
    fireEvent.click(screen.getByRole("button", { name: "Send besked" }));
    await waitFor(
      () => expect(screen.getByText("179 af 300 svar tilbage")).toBeVisible(),
      { timeout: 4000 },
    );
    expect(screen.getAllByText("En velkomstmail")).toHaveLength(1);
  }, 7000);
  it("blocks send when the demo allowance is exhausted", () => {
    render(<App />);
    openProfile("Demoindstillinger");
    fireEvent.click(screen.getByRole("radio", { name: /Ingen svar tilbage/ }));
    fireEvent.click(screen.getByRole("button", { name: "Brug indstilling" }));
    expect(screen.getByRole("button", { name: "Send besked" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Du har brugt dine svar",
    );
  });
  it("invites a fictional customer and prevents duplicate invitations", () => {
    render(<App />);
    openProfile("Administration (demo)");
    fireEvent.click(screen.getByRole("button", { name: "Invitér kunde" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Navn"), {
      target: { value: "Demo Kunde" },
    });
    fireEvent.change(dialog.getByLabelText("E-mail"), {
      target: { value: "sofie@example.test" },
    });
    fireEvent.click(
      dialog.getByRole("button", { name: "Opret demoinvitation" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("findes allerede");
    fireEvent.change(dialog.getByLabelText("E-mail"), {
      target: { value: "new@example.test" },
    });
    fireEvent.click(
      dialog.getByRole("button", { name: "Opret demoinvitation" }),
    );
    expect(screen.getByText("Demo Kunde")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ingen e-mail er sendt",
    );
  });
  it("renders untrusted model HTML as literal text", () => {
    const payload = "<img src=x onerror=alert(1)><script>alert(1)</script>";
    const { container } = render(<MessageText content={payload} />);
    expect(container.querySelector("img,script")).toBeNull();
    expect(screen.getByText(payload)).toBeVisible();
  });
});
