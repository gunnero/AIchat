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
