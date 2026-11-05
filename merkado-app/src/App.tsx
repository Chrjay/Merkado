import { useEffect, useState, type ComponentType } from 'react';
import { Store } from 'lucide-react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useOutbox } from './hooks/useOutbox';
import { useProducts } from './hooks/useProducts';
import { SyncProvider } from './hooks/useSync';
import { CartProvider } from './components/CartProvider';
import { TabBar, type TabId } from './components/TabBar';
import { ToastProvider } from './components/Toast';
import { UpdatePrompt } from './components/UpdatePrompt';
import { Araw } from './screens/Araw';
import { Benta } from './screens/Benta';
import { Login } from './screens/Login';
import { Ngayon } from './screens/Ngayon';
import { Settings } from './screens/Settings';
import { Stock } from './screens/Stock';
import styles from './styles/App.module.css';

const SCREENS: Record<TabId, ComponentType> = {
  benta: Benta,
  araw: Araw,
  stock: Stock,
  ngayon: Ngayon,
  settings: Settings,
};

function Shell() {
  const [tab, setTab] = useState<TabId>('benta');
  const { unsentCount } = useOutbox();
  const { refresh } = useProducts();
  const Screen = SCREENS[tab];

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      <main className={styles.main}>
        <Screen />
      </main>
      <TabBar
        current={tab}
        unsentCount={unsentCount}
        onSelect={(next) => {
          setTab(next);
          window.scrollTo({ top: 0 });
        }}
      />
    </>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className={styles.splash} aria-busy="true">
        <Store size={40} aria-hidden />
        <span className="visually-hidden">Naglo-load…</span>
      </div>
    );
  }
  return session ? <Shell /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <SyncProvider>
        <ToastProvider>
          <CartProvider>
            <Gate />
            <UpdatePrompt />
          </CartProvider>
        </ToastProvider>
      </SyncProvider>
    </AuthProvider>
  );
}
