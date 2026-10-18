import { useRef, useState, type FormEvent } from "react";
import { t } from "./i18n";

export function PlatformPromptForm({
  project,
  busy,
  save,
}: {
  project: { name: string; connection_id: string | null };
  busy: boolean;
  save: (value: { name: string; providerPromptId: string }) => Promise<boolean>;
}) {
  const promptInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !project.connection_id) return;
    const f = new FormData(e.currentTarget),
      providerPromptId = String(f.get("providerPromptId")).trim();
    if (!/^pmpt_[A-Za-z0-9_-]{3,180}$/.test(providerPromptId)) {
      setError(t("Indsæt promptens ID fra OpenAI. Det starter med pmpt_."));
      promptInput.current?.focus();
      return;
    }
    setError("");
    void save({ name: String(f.get("name")).trim(), providerPromptId });
  }
  return (
    <form onSubmit={submit}>
      <p>
        {t(
          "Opret og redigér assistenten i OpenAI Platform. Tilknyt dens prompt-ID her én gang.",
        )}
      </p>
      {!project.connection_id && (
        <p className="alert" role="alert">
          {t("Tilføj en API-forbindelse til projektet først.")}
        </p>
      )}
      <label>
        {t("Navn")}
        <input
          name="name"
          defaultValue={project.name}
          maxLength={80}
          required
          disabled={busy}
        />
      </label>
      <label>
        {t("OpenAI-prompt-ID")}
        <input
          ref={promptInput}
          name="providerPromptId"
          placeholder="pmpt_…"
          maxLength={185}
          required
          pattern={"pmpt_[A-Za-z0-9_\\-]{3,180}"}
          disabled={busy}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          aria-describedby="platform-prompt-help"
          aria-invalid={!!error}
          onChange={() => setError("")}
          onBlur={(e) => {
            e.currentTarget.value = e.currentTarget.value.trim();
          }}
          onInvalid={(e) => {
            e.preventDefault();
            setError(
              t("Indsæt promptens ID fra OpenAI. Det starter med pmpt_."),
            );
            e.currentTarget.focus();
          }}
        />
      </label>
      <p className="footnote" id="platform-prompt-help">
        {t(
          "Kopiér ID'et fra din gemte prompt i OpenAI. Du skal ikke kopiere instruktionerne.",
        )}{" "}
        <a
          href="https://platform.openai.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("Åbn OpenAI Platform")}
        </a>
      </p>
      {error && (
        <p className="alert" role="alert">
          {t(error)}
        </p>
      )}
      <p className="notice">
        {t("Administreres i OpenAI · Udgivet standardversion")}
      </p>
      <p className="footnote">
        {t(
          "Fremtidige AI-svar skal bruge OpenAI-promptens udgivne standardversion. Foretag ændringer i OpenAI Platform.",
        )}
      </p>
      <p className="footnote">
        {t(
          "AI-svar er ikke aktiveret endnu. Tilknytningen gemmes nu; adgang til prompten er endnu ikke testet.",
        )}
      </p>
      <div className="form-actions">
        <button
          className="button primary"
          disabled={busy || !project.connection_id}
        >
          {busy ? t("Arbejder…") : t("Tilknyt prompt")}
        </button>
      </div>
    </form>
  );
}
