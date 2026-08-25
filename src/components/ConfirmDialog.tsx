import { useEscapeKey } from "../hooks/useEscapeKey";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger, onConfirm, onCancel }: Props) {
  useEscapeKey(onCancel);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal--small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
        </div>
        <div className="modal-body">
          <p>{message}</p>
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className={danger ? "danger-btn" : "primary-btn"} onClick={onConfirm} autoFocus>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
