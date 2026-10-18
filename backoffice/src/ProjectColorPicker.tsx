import { useState } from "react";
import { t } from "./i18n";
import {
  isCustomColor,
  projectColor,
  projectColors,
  projectColorStyle,
  type ProjectColor,
  type PresetColor,
} from "./project-colors";

export function ProjectColorPicker({ initial }: { initial?: ProjectColor }) {
  const value = projectColor(initial);
  const [choice, setChoice] = useState<PresetColor | "custom">(
    isCustomColor(value) ? "custom" : (value as PresetColor),
  );
  const [custom, setCustom] = useState<string>(
    isCustomColor(value) ? value : "#3b82f6",
  );
  const preview = isCustomColor(custom) ? custom : "#3b82f6";
  return (
    <fieldset>
      <legend>{t("Farve på arbejdsrum")}</legend>
      <input
        type="hidden"
        name="color"
        value={choice === "custom" ? custom : choice}
      />
      <div className="project-color-options">
        {projectColors.map((color) => (
          <label
            className="project-color-option"
            data-project-color={color.id}
            key={color.id}
          >
            <input
              type="radio"
              name="color-choice"
              value={color.id}
              checked={choice === color.id}
              onChange={() => setChoice(color.id)}
            />
            {t(color.label)}
          </label>
        ))}
      </div>
      <div className="project-custom-color">
        <label className="check">
          <input
            type="radio"
            name="color-choice"
            value="custom"
            checked={choice === "custom"}
            onChange={() => setChoice("custom")}
          />
          {t("Brugerdefineret farve")}
        </label>
        {choice === "custom" && (
          <>
            <div className="project-custom-fields">
              <label>
                {t("Vælg farve")}
                <input
                  type="color"
                  value={preview}
                  onChange={(e) => setCustom(e.target.value)}
                />
              </label>
              <label>
                {t("Hex-farvekode")}
                <input
                  type="text"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value.trim())}
                  pattern="#[0-9a-fA-F]{6}"
                  minLength={7}
                  maxLength={7}
                  required
                  placeholder="#3B82F6"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="custom-color-help"
                />
              </label>
            </div>
            <div
              className="project-custom-preview"
              data-project-color={preview}
              style={projectColorStyle(preview)}
            >
              <strong>{t("Dit arbejdsrum")}</strong>
              <span>{t("Eksempel på sidemenuens farve")}</span>
            </div>
            <p id="custom-color-help" className="footnote">
              {t(
                "Brug # og seks tegn, fx #3B82F6. Tekst og knapper tilpasses automatisk, så de er lette at læse.",
              )}
            </p>
          </>
        )}
      </div>
      <p className="footnote">
        {t("Sidemenuen bruger denne farve, når projektet er valgt.")}
      </p>
    </fieldset>
  );
}
