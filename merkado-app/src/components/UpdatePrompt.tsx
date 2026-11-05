/// <reference types="vite-plugin-pwa/react" />
import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useCart } from './cartContext';
import styles from './UpdatePrompt.module.css';

export function UpdatePrompt() {
  const { isEmpty } = useCart();
  const [dismissed, setDismissed] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh || !isEmpty || dismissed) return null;

  return (
    <div className={styles.banner} role="status">
      <button type="button" className={styles.update} onClick={() => updateServiceWorker(true)}>
        <Download size={20} strokeWidth={2.25} aria-hidden />
        May bagong bersyon, i-update
      </button>
      <button type="button" className={styles.close} aria-label="Mamaya na" onClick={() => setDismissed(true)}>
        <X size={20} aria-hidden />
      </button>
    </div>
  );
}
