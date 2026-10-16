export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "streaming" | "cancelled";
};
export type Chat = { id: string; title: string; messages: Message[] };
export type Share = {
  id: string;
  chatId: string;
  title: string;
  messages: Message[];
  createdAt: string;
  revoked: boolean;
};
export type Plan = {
  id: string;
  name: string;
  allowance: number;
  price: number;
};
export type Customer = {
  id: string;
  name: string;
  email: string;
  planId: string;
  status: "active" | "invited" | "suspended";
  expires: string;
  used: number;
};
export type Scenario = "normal" | "slow" | "error" | "exhausted";

export const welcomeAnswer = [
  "Selvfølgelig. Her er et forslag, der skaber ro og tryghed:",
  "## Velkommen – vi glæder os til at hjælpe dig",
  "Hvor er det dejligt, at du er her. Tak fordi du har valgt at tage\ndet næste skridt sammen med os. Vi ved, at det kan føles som en\nstor beslutning, og vi vil gerne give dig en tryg og rolig start.",
  "Du bestemmer selv tempoet, og vi er her hele vejen til at støtte dig.\nDu er altid velkommen til at skrive, hvis du har spørgsmål – store som små.\nVi glæder os til at lære dig bedre at kende.",
  "De varmeste hilsner\n[Dit navn]",
].join("\n\n");

export function createDemoChats(): Chat[] {
  return [
    {
      id: "welcome",
      title: "Velkomstmail til nye kunder",
      messages: [
        {
          id: "welcome-user",
          role: "user",
          content: "Hjælp mig med en varm velkomstmail til mine nye kunder.",
          status: "complete",
        },
        {
          id: "welcome-answer",
          role: "assistant",
          content: welcomeAnswer,
          status: "complete",
        },
      ],
    },
    {
      id: "linkedin",
      title: "Et roligt opslag til LinkedIn",
      messages: [
        {
          id: "linkedin-user",
          role: "user",
          content:
            "Skriv et roligt opslag til LinkedIn om at tage det første skridt.",
          status: "complete",
        },
        {
          id: "linkedin-answer",
          role: "assistant",
          content:
            "Her er en rolig og nærværende vinkel:\n\n## Små skridt tæller også\n\nDu behøver ikke have alle svarene, før du begynder. Nogle gange er det nok at tage ét lille skridt og mærke efter.\n\nVi hjælper dig med at finde en retning, der føles rigtig for dig – i dit tempo.\n\nHvad kunne dit næste lille skridt være?",
          status: "complete",
        },
      ],
    },
    {
      id: "website",
      title: "Tekst til min forside",
      messages: [
        {
          id: "website-user",
          role: "user",
          content:
            "Kan du hjælpe med en tryg og personlig tekst til min forside?",
          status: "complete",
        },
        {
          id: "website-answer",
          role: "assistant",
          content:
            "Lad os gøre det enkelt og personligt:\n\n## Her er der plads til dig\n\nVi møder dig, hvor du er. Sammen finder vi den løsning, der passer til dine behov, og vi er med dig hele vejen.\n\nDu er velkommen til en uforpligtende samtale, når du er klar.",
          status: "complete",
        },
      ],
    },
  ];
}

export function createDemoCustomers(): Customer[] {
  return [
    {
      id: "sofie",
      name: "Sofie Jensen",
      email: "sofie@example.test",
      planId: "standard",
      status: "active",
      expires: "2026-11-16",
      used: 120,
    },
    {
      id: "maria",
      name: "Maria Larsen",
      email: "maria@example.test",
      planId: "start",
      status: "active",
      expires: "2026-11-12",
      used: 24,
    },
    {
      id: "anders",
      name: "Anders Holm",
      email: "anders@example.test",
      planId: "standard",
      status: "invited",
      expires: "2026-11-16",
      used: 0,
    },
  ];
}

export function createDemoPlans(): Plan[] {
  return [
    { id: "start", name: "Start", allowance: 100, price: 149 },
    { id: "standard", name: "Standard", allowance: 300, price: 299 },
    { id: "plus", name: "Plus", allowance: 1000, price: 699 },
  ];
}

export function createShare(
  chat: Chat,
  selected: string[],
  id: string,
  now: string,
): Share {
  const messages = chat.messages.filter(
    (m) => selected.includes(m.id) && m.status === "complete",
  );
  if (messages.length === 0) throw new Error("Vælg mindst én færdig besked.");
  return {
    id,
    chatId: chat.id,
    title: chat.title,
    messages: structuredClone(messages),
    createdAt: now,
    revoked: false,
  };
}

export function visibleShares(shares: Share[]): Share[] {
  return shares.filter((share) => !share.revoked);
}

// Account/usage fields only: private chats and titles do not belong in this view.
export function adminCustomerRows(customers: Customer[]) {
  return customers.map(
    ({ id, name, email, planId, status, expires, used }) => ({
      id,
      name,
      email,
      planId,
      status,
      expires,
      used,
    }),
  );
}

export function validateInvitation(
  email: string,
  customers: Customer[],
): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Skriv en gyldig e-mailadresse.";
  if (
    customers.some((c) => c.email.toLowerCase() === email.trim().toLowerCase())
  )
    return "Denne e-mail findes allerede i demoen.";
  return null;
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Stopped", "AbortError"));
      return;
    }
    const stop = () => {
      clearTimeout(timer);
      reject(new DOMException("Stopped", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", stop, { once: true });
  });
}

export function demoAnswer(prompt: string): string {
  const text = prompt.toLocaleLowerCase("da");
  if (text.includes("velkomst") || text.includes("mail")) return welcomeAnswer;
  if (text.includes("linkedin") || text.includes("opslag"))
    return createDemoChats()[1].messages[1].content;
  if (text.includes("forside") || text.includes("hjemmeside"))
    return createDemoChats()[2].messages[1].content;
  return "Her er en rolig vinkel, du kan arbejde videre med:\n\n## Gør det trygt at tage næste skridt\n\nBegynd med det, kunden har brug for at vide. Beskriv, hvordan du hjælper, og hvad kunden kan forvente.\n\nBrug et varmt og konkret sprog. Giv plads til spørgsmål, og lad kunden mærke, at der er tid til at vælge.\n\nDu kan for eksempel slutte med: “Du er altid velkommen til at skrive. Vi finder sammen ud af, hvad der passer til dig.”\n\nDette er et forberedt demosvar. Den færdige assistent tilpasses Helles materiale.";
}

export async function* streamDemo(
  prompt: string,
  scenario: Scenario,
  signal: AbortSignal,
): AsyncGenerator<string> {
  await wait(scenario === "slow" ? 2500 : 450, signal);
  if (scenario === "error")
    throw new Error(
      "Demosvaret kunne ikke hentes. Din tekst er bevaret – prøv igen.",
    );
  if (scenario === "exhausted")
    throw new Error("Du har brugt dine svar i denne demo.");
  const answer = demoAnswer(prompt);
  for (let position = 0; position < answer.length; position += 18) {
    await wait(scenario === "slow" ? 120 : 24, signal);
    yield answer.slice(position, position + 18);
  }
}
