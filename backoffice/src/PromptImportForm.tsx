import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  MAX_IMPORT_BYTES,
  PROMPT_BUNDLE_FORMAT,
  promptImport,
} from "../server/prompt-bundle.mjs";
import { t } from "./i18n";

type Item = { name: string; instructions: string; sourceRef: string };
export type PromptImport = { projectRef?: string; prompts: Item[] };

export function PromptImportForm({
  project,
  projectRef,
  busy,
  save,
}: {
  project: { id: string; name: string };
  projectRef?: string;
  busy: boolean;
  save: (value: PromptImport) => Promise<boolean>;
}) {
  const [name, setName] = useState(project.name);
  const [instructions, setInstructions] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [bundle, setBundle] = useState<PromptImport | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const readEpoch = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      readEpoch.current++;
    },
    [],
  );

  async function readFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0],
      epoch = ++readEpoch.current;
    setError("");
    setBundle(null);
    setReading(false);
    if (!file) return;
    setInstructions("");
    setSourceRef("");
    if (file.size > MAX_IMPORT_BYTES || !/\.(txt|json)$/i.test(file.name)) {
      setError(t("Vælg en tekstfil eller importfil på højst 256 KB."));
      return;
    }
    setReading(true);
    try {
      const text = await file.text();
      if (epoch !== readEpoch.current) return;
      if (/\.txt$/i.test(file.name)) {
        if (!text.trim() || text.length > 48000) throw new Error();
        setName(file.name.replace(/\.txt$/i, "").slice(0, 80));
        setInstructions(text);
        setSourceRef("");
      } else {
        const parsed = JSON.parse(text);
        if (!parsed || parsed.format !== PROMPT_BUNDLE_FORMAT)
          throw new Error();
        const { format: _, ...content } = parsed;
        const value = promptImport.parse(content) as PromptImport;
        if (value.projectRef && value.projectRef !== projectRef) {
          setError(
            t(
              "Filen tilhører et andet OpenAI-projekt. Vælg det rigtige projekt.",
            ),
          );
          return;
        }
        setBundle(value);
      }
    } catch {
      if (epoch === readEpoch.current)
        setError(
          t(
            "Filen kunne ikke importeres. Brug en tekstfil med instruktioner eller appens JSON-importformat.",
          ),
        );
    } finally {
      if (epoch === readEpoch.current) setReading(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || reading) return;
        const result = promptImport.safeParse(
          bundle || { prompts: [{ name, instructions, sourceRef }] },
        );
        if (!result.success) {
          setError(t("Tilføj et navn og instruktionerne, før du importerer."));
          return;
        }
        setError("");
        void save(result.data as PromptImport);
      }}
    >
      <p>
        {t("Tilføj instruktionerne én gang. Derefter kan du redigere dem her.")}
      </p>
      <p>
        <strong>{project.name}</strong>
      </p>
      {reading && <p role="status">{t("Indlæser…")}</p>}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {bundle ? (
        <section className="import-preview" aria-label={t("Gennemse importen")}>
          <p>{t("Gennemse instruktionerne, før du importerer.")}</p>
          {bundle.prompts.map((item, index) => (
            <details key={index}>
              <summary>{item.name}</summary>
              {item.sourceRef && <p className="footnote">{item.sourceRef}</p>}
              <pre>{item.instructions}</pre>
            </details>
          ))}
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              readEpoch.current++;
              setBundle(null);
              setError("");
              if (input.current) input.current.value = "";
            }}
          >
            {t("Indsæt tekst i stedet")}
          </button>
        </section>
      ) : (
        <>
          <label>
            {t("Navn på prompt")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              disabled={busy || reading}
            />
          </label>
          <label>
            {t("Instruktioner")}
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              required
              maxLength={48000}
              rows={5}
              disabled={busy || reading}
            />
          </label>
          <details>
            <summary>{t("Kildereference · valgfrit")}</summary>
            <label>
              {t("Oprindeligt prompt-ID og version")}
              <input
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                maxLength={150}
                disabled={busy || reading}
                placeholder="pmpt_… v2"
              />
            </label>
          </details>
        </>
      )}
      <details className="file-import">
        <summary>{t("Importér fra en fil · valgfrit")}</summary>
        <label>
          {t("Vælg en fil · valgfrit")}
          <input
            ref={input}
            type="file"
            accept=".txt,.json,text/plain,application/json"
            disabled={busy || reading}
            onChange={readFile}
          />
        </label>
        <p className="footnote">
          {t(
            "Brug en tekstfil eller appens JSON-importformat. En API-nøgle kan ikke hente instruktionerne her.",
          )}
        </p>
      </details>
      <p className="footnote">
        {t(
          "Importen opretter version 1. Kundernes nuværende tildelinger ændres ikke.",
        )}
      </p>
      <div className="form-actions">
        <button className="button primary" disabled={busy || reading}>
          {busy ? t("Arbejder…") : t("Importér prompter")}
        </button>
      </div>
    </form>
  );
}
