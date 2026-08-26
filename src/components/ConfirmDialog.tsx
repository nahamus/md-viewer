import { useState } from "react";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** If set, the confirm button stays disabled until the user types this exact text. */
  requireText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  requireText,
  onConfirm,
  onCancel,
}: Props) {
  useEscapeKey(onCancel);
  const [typed, setTyped] = useState("");
  const canConfirm = !requireText || typed === requireText;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal--small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
        </div>
        <div className="modal-body">
          <p>{message}</p>
          {requireText && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canConfirm) onConfirm();
              }}
            >
              <label className="confirm-type-label">
                Type <code>{requireText}</code> to confirm
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </form>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={danger ? "danger-btn" : "primary-btn"}
              onClick={onConfirm}
              disabled={!canConfirm}
              autoFocus={!requireText}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
