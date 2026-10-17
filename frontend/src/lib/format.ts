import { format, formatDistanceToNow, parseISO } from 'date-fns';

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM, HH:mm');
  } catch {
    return iso;
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM');
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

export function formatNum(val: number | null | undefined, dp = 1): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return val.toFixed(dp);
}

export function formatSignedPct(val: number | null | undefined, dp = 1): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(dp)}%`;
}

export function formatSignedNum(val: number | null | undefined, dp = 2): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(dp)}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const last2 = digits.slice(-2).padStart(2, '0');
  return `+91 90xxxx00${last2}`;
}

export function haToAcres(ha: number): number {
  return Math.round(ha * 2.4711 * 100) / 100;
}
