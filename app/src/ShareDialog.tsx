import { useState } from "react";
import {
  LockSimpleIcon,
  ArrowSquareOutIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import { Modal } from "./Modal";
import { MessageText } from "./MessageText";
import { type Chat, type Share } from "./domain";

export function ShareDialog({
  chat,
  shares,
  onShare,
  onRevoke,
  onClose,
}: {
  chat: Chat;
  shares: Share[];
  onShare: (selected: string[]) => void;
  onRevoke: (id: string) => void;
  onClose: () => void;
}) {
  const complete = chat.messages.filter((m) => m.status === "complete");
  const [selected, setSelected] = useState(complete.map((m) => m.id));
  const [created, setCreated] = useState(false);
  const current = shares.filter((s) => s.chatId === chat.id && !s.revoked);
  return (
    <Modal title="Del med Helle" onClose={onClose} wide>
      <p className="muted">
        Du bestemmer, hvad Helle må se. Vælg beskederne og gennemse kopien, før
        du deler.
      </p>
      <div className="notice">
        <LockSimpleIcon size={21} />
        <span>
          Kun de valgte beskeder deles. Nye beskeder i samtalen forbliver
          private.
        </span>
      </div>
      {current.length > 0 && (
        <section className="existing-shares">
          <h3>Aktive delinger</h3>
          {current.map((s) => (
            <div key={s.id}>
              <span>
                {s.messages.length}{" "}
                {s.messages.length === 1 ? "besked" : "beskeder"} · Helle
                Bodeholt
              </span>
              <button
                className="text-button danger-text"
                onClick={() => onRevoke(s.id)}
              >
                Tilbagekald deling
              </button>
            </div>
          ))}
        </section>
      )}
      {created ? (
        <div className="empty-panel" role="status">
          <CheckIcon size={32} />
          <h3>Din demokopi er delt</h3>
          <p>Du kan se den under “Delt med Helle” i administrationen.</p>
        </div>
      ) : (
        <>
          <div className="share-selection">
            {complete.map((m) => (
              <label
                key={m.id}
                className={
                  selected.includes(m.id) ? "share-item selected" : "share-item"
                }
              >
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  onChange={(e) =>
                    setSelected((previous) =>
                      e.target.checked
                        ? [...previous, m.id]
                        : previous.filter((id) => id !== m.id),
                    )
                  }
                  aria-label={
                    "Del " +
                    (m.role === "user" ? "din besked" : "assistentens svar") +
                    " " +
                    (complete.indexOf(m) + 1)
                  }
                />
                <div>
                  <span className="eyebrow">
                    {m.role === "user" ? "DIG" : "ASSISTENT"}
                  </span>
                  <MessageText content={m.content} />
                </div>
              </label>
            ))}
          </div>
          {!complete.length && (
            <p className="empty-note">
              Skriv en besked, før du deler samtalen.
            </p>
          )}
        </>
      )}
      <p className="fine-print">
        Du kan stoppe fremtidig adgang. Kopier, Helle allerede har gemt, kan
        ikke trækkes tilbage. Deling er simuleret i demoen.
      </p>
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          {created ? "Luk" : "Annullér"}
        </button>
        {!created && (
          <button
            className="button primary"
            disabled={selected.length === 0}
            onClick={() => {
              onShare(selected);
              setCreated(true);
            }}
          >
            <ArrowSquareOutIcon size={20} />
            Del {selected.length}{" "}
            {selected.length === 1 ? "besked" : "beskeder"} med Helle
          </button>
        )}
      </div>
    </Modal>
  );
}
