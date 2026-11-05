import { Banknote, HandCoins, Smartphone, type LucideIcon } from 'lucide-react';
import type { Payment } from '../types/events';
import styles from './PaymentButtons.module.css';

const OPTIONS: { value: Payment; Icon: LucideIcon }[] = [
  { value: 'Cash', Icon: Banknote },
  { value: 'GCash', Icon: Smartphone },
  { value: 'Utang', Icon: HandCoins },
];

interface PaymentButtonsProps {
  value: Payment | null;
  onChange: (payment: Payment) => void;
}

export function PaymentButtons({ value, onChange }: PaymentButtonsProps) {
  return (
    <div className={styles.group} role="group" aria-label="Paraan ng bayad">
      {OPTIONS.map(({ value: option, Icon }) => (
        <button
          key={option}
          type="button"
          className={styles.option}
          data-payment={option}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          <Icon size={24} strokeWidth={2.25} aria-hidden />
          <span>{option}</span>
        </button>
      ))}
    </div>
  );
}
