import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { ToastContext, type ToastTone } from './toastContext';
import styles from './Toast.module.css';

interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((message: string, tone: ToastTone = 'success') => {
    window.clearTimeout(timer.current);
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, message, tone }));
    setVisible(true);
    timer.current = window.setTimeout(() => setVisible(false), tone === 'error' ? 4000 : 2200);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const Icon = toast?.tone === 'error' ? TriangleAlert : CircleCheck;

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {toast && (
          <div
            key={toast.id}
            className={`${styles.toast} ${toast.tone === 'error' ? styles.error : ''}`}
            data-visible={visible}
          >
            <Icon size={22} strokeWidth={2.25} aria-hidden />
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
