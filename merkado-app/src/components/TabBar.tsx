import { CloudSun, PackageCheck, ReceiptText, Settings, ShoppingBasket, type LucideIcon } from 'lucide-react';
import styles from './TabBar.module.css';

export type TabId = 'benta' | 'araw' | 'stock' | 'ngayon' | 'settings';

const TABS: { id: TabId; label: string; Icon: LucideIcon }[] = [
  { id: 'benta', label: 'Benta', Icon: ShoppingBasket },
  { id: 'araw', label: 'Araw', Icon: CloudSun },
  { id: 'stock', label: 'Stock', Icon: PackageCheck },
  { id: 'ngayon', label: 'Ngayon', Icon: ReceiptText },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

interface TabBarProps {
  current: TabId;
  onSelect: (tab: TabId) => void;
  /** Shown as a dot count on Ngayon so unsent work is visible from every screen. */
  unsentCount: number;
}

export function TabBar({ current, onSelect, unsentCount }: TabBarProps) {
  return (
    <nav className={styles.bar} aria-label="Mga screen">
      <ul className={styles.list}>
        {TABS.map(({ id, label, Icon }) => {
          const active = id === current;
          return (
            <li key={id}>
              <button
                type="button"
                className={styles.tab}
                aria-current={active ? 'page' : undefined}
                onClick={() => onSelect(id)}
              >
                <span className={styles.iconWrap}>
                  <Icon size={24} strokeWidth={active ? 2.5 : 2} aria-hidden />
                  {id === 'ngayon' && unsentCount > 0 && (
                    <span className={`${styles.count} tabular`} aria-label={`${unsentCount} hindi pa naipadala`}>
                      {unsentCount > 99 ? '99+' : unsentCount}
                    </span>
                  )}
                </span>
                <span className={styles.label}>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
