import { useId } from "react";
import QRCode from "react-qr-code";
import { t, useLanguage } from "./i18n";

const issuer = "AI Kundetypeassistent";

export function AuthenticatorSetup({
  uri,
  secret,
}: {
  uri: string;
  secret: string;
}) {
  useLanguage();
  const heading = useId();
  let account = "";
  try {
    const parsed = new URL(uri);
    const label = decodeURIComponent(parsed.pathname.slice(1));
    if (
      uri.length <= 2048 &&
      parsed.protocol === "otpauth:" &&
      parsed.hostname === "totp" &&
      parsed.searchParams.get("issuer") === issuer &&
      parsed.searchParams.get("secret") === secret &&
      label.startsWith(issuer + ":")
    )
      account = label.slice(issuer.length + 1);
  } catch {
    // Keep the manual option available without exposing URI/error details.
  }
  return (
    <section className="authenticator-setup" aria-labelledby={heading}>
      <h2 id={heading}>{t("Opsæt totrinslogin")}</h2>
      <p>
        {t(
          "Åbn din authenticator-app på telefonen, vælg Tilføj konto, og scan koden.",
        )}
      </p>
      {account ? (
        <figure className="authenticator-figure">
          <div className="authenticator-qr">
            <QRCode
              value={uri}
              size={236}
              level="M"
              role="img"
              title={`${t("QR-kode til totrinslogin")} · ${issuer} · ${account}`}
            />
          </div>
          <figcaption>
            <span>{t("Navn i din authenticator")}</span>
            <strong>{issuer}</strong>
            <span className="authenticator-account">{account}</span>
          </figcaption>
        </figure>
      ) : (
        <p className="notice">
          {t("QR-koden kunne ikke vises. Brug opsætningsnøglen nedenfor.")}
        </p>
      )}
      <p>
        {t("Indtast derefter appens 6-cifrede kode i formularen nedenfor.")}
      </p>
      <details className="authenticator-manual">
        <summary>{t("Kan du ikke scanne? Brug en opsætningsnøgle")}</summary>
        <p>
          {t(
            "Vælg manuel indtastning i din authenticator, og brug denne nøgle. Vælg Tidsbaseret som kontotype.",
          )}
        </p>
        <code className="setup-secret">{secret}</code>
      </details>
      <p className="footnote">
        {t("Hold QR-koden og opsætningsnøglen private.")}
      </p>
    </section>
  );
}
