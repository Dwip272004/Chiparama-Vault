export const CYCLES = {
  monthly: { label: 'Monthly', months: 1 },
  quarterly: { label: 'Quarterly', months: 3 },
  half_yearly: { label: 'Half-yearly', months: 6 },
  annual: { label: 'Annual', months: 12 },
  one_time: { label: 'One-time', months: null },
};
export const SUB_STATUS = {
  active: { label: 'Active', tone: 'good' }, trial: { label: 'Trial', tone: 'info' },
  paused: { label: 'Paused', tone: 'neutral' }, cancelled: { label: 'Cancelled', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'critical' },
};
export const INV_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' }, pending: { label: 'Pending', tone: 'warning' },
  paid: { label: 'Paid', tone: 'good' }, overdue: { label: 'Overdue', tone: 'critical' },
  cancelled: { label: 'Cancelled', tone: 'neutral' }, refunded: { label: 'Refunded', tone: 'info' },
};
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED'];
export const FIN_ROLES = ['founder', 'cofounder', 'cmo', 'cfo', 'cto'];

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const fmtINR = (n) => inr.format(Math.round(Number(n) || 0));
export function fmtCompact(n) {
  n = Number(n) || 0;
  if (Math.abs(n) >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
  if (Math.abs(n) >= 1e5) return '₹' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' L';
  if (Math.abs(n) >= 1e3) return '₹' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return fmtINR(n);
}
export function fmtMoney(n, cur = 'INR') {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(Number(n) || 0); }
  catch { return cur + ' ' + n; }
}

export const today = () => new Date(new Date().toDateString());
export const toDate = (s) => (s ? new Date(s + 'T00:00:00') : null);
export function daysUntil(s) { const d = toDate(s); return d ? Math.round((d - today()) / 86400000) : null; }
export function fmtDate(s) { return s ? toDate(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
export function relDays(s) {
  const n = daysUntil(s);
  if (n == null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function monthlyEq(sub) {
  const m = CYCLES[sub.billing_cycle]?.months;
  return m ? Number(sub.amount_inr || 0) / m : 0;
}
export const isRunning = (s) => s.status === 'active' || s.status === 'trial';

// pending invoices past due date count as overdue
export function invStatus(inv) {
  if (inv.status === 'pending' && inv.due_date && daysUntil(inv.due_date) < 0) return 'overdue';
  return inv.status;
}
export const countsAsSpend = (inv) => invStatus(inv) === 'paid';

// Period helpers: Indian FY (Apr–Mar) or calendar year
export function periodMonths(year, fy) {
  const start = fy ? new Date(year, 3, 1) : new Date(year, 0, 1);
  return Array.from({ length: 12 }, (_, i) => new Date(start.getFullYear(), start.getMonth() + i, 1));
}
export function currentPeriodYear(fy) {
  const t = today();
  return fy && t.getMonth() < 3 ? t.getFullYear() - 1 : t.getFullYear();
}
export const periodLabel = (year, fy) => (fy ? `FY ${year}-${String(year + 1).slice(2)}` : String(year));
export const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function toCSV(rows, cols) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(c.get(r))).join(','))].join('\n');
}
export function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
