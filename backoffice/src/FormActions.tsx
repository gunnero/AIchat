import { type FormEvent } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { t } from "./i18n";
export function Save({
  busy,
  label = t("Gem ændringer"),
}: {
  busy: boolean;
  label?: string;
}) {
  return (
    <div className="form-actions">
      <button className="button primary" disabled={busy}>
        {busy ? (
          <>
            <ArrowClockwiseIcon size={19} />
            {t("Arbejder…")}{" "}
          </>
        ) : (
          label
        )}
      </button>
    </div>
  );
}
export function values(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget)) as Record<
    string,
    string
  >;
}
