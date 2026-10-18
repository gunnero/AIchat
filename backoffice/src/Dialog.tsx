import { useEffect, useId, useRef, type ReactNode } from "react";
import { XIcon } from "@phosphor-icons/react";
import { t } from "./i18n";

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const fields = ref.current?.querySelectorAll<HTMLElement>(
      'input:not([disabled]):not([readonly]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]):not([readonly])',
    );
    Array.from(fields || [])
      .find((field) => !field.closest("[hidden]"))
      ?.focus({ preventScroll: true });
    if (ref.current) ref.current.scrollTop = 0;
  }, [title]);
  useEffect(() => {
    const el = ref.current!;
    const fields =
      'input:not([disabled]):not([readonly]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]):not([readonly])';
    el.showModal();
    el.querySelector<HTMLElement>(fields)?.focus();
    return () => {
      el.close();
      if (
        previousFocus.current?.isConnected &&
        previousFocus.current !== document.body
      )
        previousFocus.current.focus();
      else
        Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]"))
          .at(-1)
          ?.querySelector<HTMLElement>(fields)
          ?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button aria-label={t("Luk")} className="icon-button" onClick={onClose}>
          <XIcon size={24} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
