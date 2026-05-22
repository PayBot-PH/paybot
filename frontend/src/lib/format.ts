export function fmt(n?: number | null): string {
  if (typeof n === 'number' && !Number.isNaN(n)) {
    return n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
  }
  return '0.00';
}

export function fmtShort(n?: number | null): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '0.00';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : fmt(n);
}

export function fmtUsd(n?: number | null): string {
  if (typeof n === 'number' && !Number.isNaN(n)) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return '0.00';
}

export function fmtCurrencyPhp(n?: number | null): string {
  if (typeof n === 'number' && !Number.isNaN(n)) {
    return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  }
  return '₱0.00';
}
