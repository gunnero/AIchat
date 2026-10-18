import { t } from "./i18n";
export function Brand({
  administration = false,
}: {
  administration?: boolean;
}) {
  return (
    <div className="brand">
      <div>
        <strong>
          {administration ? t("Administration") : "Kundetypeassistent"}
        </strong>
        <span>
          {administration ? "Kundetypeassistent" : t("Dit private arbejdsrum")}
        </span>
      </div>
    </div>
  );
}
