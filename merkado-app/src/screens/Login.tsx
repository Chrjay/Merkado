import { useState } from 'react';
import { LogIn, Store, TriangleAlert } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { configError } from '../lib/supabase';
import ui from '../styles/ui.module.css';
import styles from './Login.module.css';

function toTaglish(error: string): string {
  const e = error.toLowerCase();
  if (e.includes('invalid login') || e.includes('invalid credentials')) return 'Mali ang email o password.';
  if (e.includes('email not confirmed')) return 'Hindi pa kumpirmado ang email. Tingnan ang inbox.';
  if (e.includes('fetch') || e.includes('network') || !navigator.onLine)
    return 'Walang signal. Subukan ulit kapag may internet.';
  if (e.includes('rate') || e.includes('too many')) return 'Masyadong maraming subok. Maghintay ng ilang minuto.';
  return `Hindi maka-login: ${error}`;
}

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const disabled = busy || configError !== null;

  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden>
          <Store size={32} strokeWidth={2} />
        </span>
        <h1 className={ui.title}>MerkaDo Tindahan</h1>
        <p className={ui.muted}>Mag-login para makapagtala ng benta.</p>
      </div>

      {configError && (
        <p className={`${ui.notice} ${ui.noticeDanger}`} role="alert">
          <TriangleAlert size={20} aria-hidden />
          <span>{configError}</span>
        </p>
      )}

      <form
        className={styles.form}
        onSubmit={async (e) => {
          e.preventDefault();
          if (disabled) return;
          setBusy(true);
          setError(null);
          const res = await signIn(email.trim(), password);
          setBusy(false);
          if (res.error) setError(toTaglish(res.error));
        }}
      >
        <label className={ui.field}>
          <span className={ui.label}>Email</span>
          <input
            className={ui.input}
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>Password</span>
          <input
            className={ui.input}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={`${ui.btn} ${ui.primary} ${ui.large} ${ui.block}`} disabled={disabled}>
          <LogIn size={22} aria-hidden />
          {busy ? 'Naglo-login…' : 'Mag-login'}
        </button>
      </form>
    </main>
  );
}
