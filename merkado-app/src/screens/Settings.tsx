import { useEffect, useState } from 'react';
import { Check, LogOut, RefreshCw, TriangleAlert } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useOutbox } from '../hooks/useOutbox';
import { useProducts } from '../hooks/useProducts';
import { getDeviceId, setDeviceId } from '../lib/events';
import { configError } from '../lib/supabase';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatTimestamp } from '../components/format';
import { useToast } from '../components/toastContext';
import ui from '../styles/ui.module.css';
import styles from './Settings.module.css';

const APP_VERSION: string = import.meta.env.PACKAGE_VERSION ?? 'dev';

export function Settings() {
  const { session, signOut } = useAuth();
  const { products, refresh, lastRefreshed } = useProducts();
  const { unsentCount } = useOutbox();
  const toast = useToast();

  const [device, setDevice] = useState('');
  const [savedDevice, setSavedDevice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    let alive = true;
    getDeviceId().then((id) => {
      if (!alive) return;
      setDevice(id);
      setSavedDevice(id);
    });
    return () => {
      alive = false;
    };
  }, []);

  const deviceValid = /^[A-Za-z0-9_-]{1,32}$/.test(device);

  async function saveDevice() {
    try {
      await setDeviceId(device);
      setSavedDevice(device);
      toast('Naitala na ang pangalan ng phone.');
    } catch (err) {
      toast(`Hindi na-save: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }

  async function doRefresh() {
    setRefreshing(true);
    const res = await refresh();
    setRefreshing(false);
    if (res.ok) toast('Na-refresh na ang produkto.');
    else toast(`Hindi na-refresh: ${res.error ?? 'walang signal'}`, 'error');
  }

  return (
    <div className={ui.screen}>
      <header className={ui.header}>
        <h1 className={ui.title}>Settings</h1>
      </header>

      {configError && (
        <p className={`${ui.notice} ${ui.noticeDanger}`} role="alert">
          <TriangleAlert size={20} aria-hidden />
          <span>{configError}</span>
        </p>
      )}

      <section className={`${ui.section} ${styles.group}`}>
        <label className={ui.field}>
          <span className={ui.label}>Pangalan ng phone</span>
          <span className={ui.muted} id="device-help">
            Letters, numbers, - at _ lang. Halimbawa: phone-1.
          </span>
          <div className={styles.inline}>
            <input
              className={ui.input}
              value={device}
              onChange={(e) => setDevice(e.target.value.trim())}
              aria-describedby="device-help"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <button
              type="button"
              className={`${ui.btn} ${ui.primary}`}
              onClick={saveDevice}
              disabled={!deviceValid || device === savedDevice}
            >
              <Check size={20} aria-hidden />
              I-save
            </button>
          </div>
        </label>
      </section>

      <section className={`${ui.section} ${styles.group}`}>
        <h2 className={ui.sectionTitle}>Produkto</h2>
        <p className={ui.muted}>
          {products.length} produkto sa phone.
          {lastRefreshed !== null && ` Huling refresh: ${formatTimestamp(lastRefreshed)}.`}
        </p>
        <button
          type="button"
          className={`${ui.btn} ${ui.secondary} ${ui.block}`}
          onClick={doRefresh}
          disabled={refreshing || !session}
        >
          <RefreshCw size={20} aria-hidden className={refreshing ? styles.spin : undefined} />
          I-refresh ang produkto
        </button>
      </section>

      <section className={`${ui.section} ${styles.group}`}>
        <h2 className={ui.sectionTitle}>Account</h2>
        {session?.user.email && <p className={styles.email}>{session.user.email}</p>}
        <button
          type="button"
          className={`${ui.btn} ${ui.dangerGhost} ${ui.block}`}
          onClick={() => setConfirmLogout(true)}
        >
          <LogOut size={20} aria-hidden />
          Mag-logout
        </button>
      </section>

      <p className={`${ui.muted} ${styles.version}`}>
        MerkaDo Tindahan · bersyon <span className="tabular">{APP_VERSION}</span>
      </p>

      <ConfirmDialog
        open={confirmLogout}
        title="Mag-logout?"
        message={
          unsentCount > 0
            ? `May ${unsentCount} pang hindi naipadala. Mananatili ito sa phone at ipapadala pagka-login ulit.`
            : 'Kailangang mag-login ulit para makapagtala.'
        }
        confirmLabel="Mag-logout"
        danger
        onCancel={() => setConfirmLogout(false)}
        onConfirm={async () => {
          setConfirmLogout(false);
          await signOut();
        }}
      />
    </div>
  );
}
