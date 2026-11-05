import { CloudCheck, CloudOff, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react';
import styles from './SyncBadge.module.css';

type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

interface SyncBadgeProps {
  status: SyncStatus;
  unsentCount: number;
}

export function SyncBadge({ status, unsentCount }: SyncBadgeProps) {
  let Icon: LucideIcon;
  let label: string;
  let tone: 'ok' | 'pending' | 'bad';

  if (status === 'syncing') {
    Icon = RefreshCw;
    label = 'Ipinapadala…';
    tone = 'pending';
  } else if (unsentCount === 0) {
    Icon = CloudCheck;
    label = 'Naipadala lahat';
    tone = 'ok';
  } else if (status === 'offline') {
    Icon = CloudOff;
    label = `${unsentCount} hindi pa naipadala`;
    tone = 'pending';
  } else if (status === 'error') {
    Icon = TriangleAlert;
    label = `${unsentCount} hindi pa naipadala`;
    tone = 'bad';
  } else {
    Icon = CloudOff;
    label = `${unsentCount} hindi pa naipadala`;
    tone = 'pending';
  }

  return (
    <span className={styles.badge} data-tone={tone} data-status={status} data-testid="sync-badge">
      <Icon size={18} strokeWidth={2.25} className={status === 'syncing' ? styles.spin : undefined} aria-hidden />
      <span className="tabular">{label}</span>
    </span>
  );
}
