const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
});

export function formatPeso(value: number): string {
  return peso.format(value);
}

/** 'HH:MM:SS' -> '6:08 AM' */
export function formatClock(time: string): string {
  const [h = '0', m = '00'] = time.split(':');
  const hour = Number(h);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${suffix}`;
}

export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
