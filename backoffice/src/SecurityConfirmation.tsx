import { useEffect, useRef, type FormEvent } from "react";
import { t } from "./i18n";

export function SecurityConfirmation({
  busy,
  error,
  hasForm,
  confirm,
  cancel,
}: {
  busy: boolean;
  error: string;
  hasForm: boolean;
  confirm: (code: string) => Promise<void>;
  cancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!busy) input.current?.focus();
  }, [busy]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = input.current!.value;
    input.current!.value = "";
    await confirm(code);
    input.current?.focus();
  }
  return (
    <form onSubmit={submit} aria-busy={busy}>
      <p id="security-code-help">
        {t(
          "Åbn din authenticator-app, og indtast den 6-cifrede kode for at gennemføre ændringen.",
        )}
      </p>
      {hasForm && (
        <p className="muted">
          {t("Dine indtastninger er bevaret, mens du gør dette.")}
        </p>
      )}
      <label>
        {t("Sikkerhedskode")}
        <input
          ref={input}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          disabled={busy}
          placeholder="000000"
          aria-describedby={
            error
              ? "security-code-help security-code-error"
              : "security-code-help"
          }
          aria-invalid={!!error}
        />
      </label>
      {error && (
        <p className="alert" role="alert" id="security-code-error">
          {t(error)}
        </p>
      )}
      <div className="form-actions security-actions">
        <button type="button" className="button secondary" onClick={cancel}>
          {t("Tilbage")}
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? t("Arbejder…") : t("Bekræft og fortsæt")}
        </button>
      </div>
    </form>
  );
}
