import { useEffect, useRef, useState, type ReactNode } from 'react';
import ui from '../styles/ui.module.css';
import styles from './Dialog.module.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Huwag na',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      {open && (
        <div className={styles.body}>
          <h2 id="confirm-title" className={styles.title}>
            {title}
          </h2>
          {message && <div className={styles.message}>{message}</div>}
          <div className={styles.actions}>
            <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={onCancel} autoFocus>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={`${ui.btn} ${danger ? ui.danger : ui.primary}`}
              onClick={confirm}
              disabled={busy}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
