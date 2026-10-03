import React, { useMemo, useState } from 'react';
import { Icon, Empty } from '../ui.jsx';
import { MonthBars, RankBars, topN, StatusPill } from './charts.jsx';
import {
  CYCLES, INV_STATUS, fmtINR, fmtCompact, fmtDate, relDays, daysUntil, monthlyEq, isRunning, invStatus,
  countsAsSpend, periodMonths, currentPeriodYear, periodLabel, monthKey, today,
} from '../../finance.js';

export default function Overview({ ctx, go }) {
  const { subs, invoices } = ctx.fin;
  const [fy, setFy] = useState(true);
  const [year, setYear] = useState(currentPeriodYear(true));

  const years = useMemo(() => {
    const ys = new Set([currentPeriodYear(fy)]);
    invoices.forEach((i) => { const d = new Date(i.invoice_date); ys.add(fy && d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear()); });
    return [...ys].sort((a, b) => b - a);
  }, [invoices, fy]);

  const months = periodMonths(year, fy);
  const inPeriod = (i) => { const d = new Date(i.invoice_date + 'T00:00:00'); return d >= months[0] && d < new Date(months[11].getFullYear(), months[11].getMonth() + 1, 1); };
  const paid = invoices.filter(countsAsSpend);
  const paidPeriod = paid.filter(inPeriod);

  const byMonth = {};
  paidPeriod.forEach((i) => { const k = i.invoice_date.slice(0, 7); (byMonth[k] ||= { v: 0, n: 0 }); byMonth[k].v += Number(i.total_inr); byMonth[k].n++; });
  const nowKey = monthKey(today());
  const monthData = months.map((m) => ({
    key: monthKey(m), label: m.toLocaleDateString('en-IN', { month: 'short' }),
    full: m.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    value: byMonth[monthKey(m)]?.v || 0, count: byMonth[monthKey(m)]?.n || 0, current: monthKey(m) === nowKey,
  }));
  const periodTotal = paidPeriod.reduce((s, i) => s + Number(i.total_inr), 0);
  const monthsElapsed = Math.max(1, monthData.filter((m) => m.key <= nowKey).length);
  const thisMonth = byMonth[nowKey]?.v || 0;

  const running = subs.filter(isRunning);
  const runMonthly = running.reduce((s, x) => s + monthlyEq(x), 0);
  const outstanding = invoices.filter((i) => ['pending', 'overdue'].includes(invStatus(i)));
  const overdue = outstanding.filter((i) => invStatus(i) === 'overdue');

  const byPlatform = {}; const byCategory = {};
  paidPeriod.forEach((i) => {
    byPlatform[i.platform] = (byPlatform[i.platform] || 0) + Number(i.total_inr);
    byCategory[i.category] = (byCategory[i.category] || 0) + Number(i.total_inr);
  });

  const cycleRows = Object.entries(CYCLES).map(([k, c]) => {
    const list = running.filter((s) => s.billing_cycle === k);
    return { k, label: c.label, n: list.length, monthly: list.reduce((s, x) => s + monthlyEq(x), 0), billed: list.reduce((s, x) => s + Number(x.amount_inr), 0) };
  }).filter((r) => r.n);

  const upcoming = running.filter((s) => s.next_billing_date && daysUntil(s.next_billing_date) >= 0 && daysUntil(s.next_billing_date) <= 30)
    .sort((a, b) => a.next_billing_date.localeCompare(b.next_billing_date));
  const expiring = subs.filter((s) => s.expiry_date && s.status !== 'cancelled' && daysUntil(s.expiry_date) <= 45)
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
  const upcomingTotal = upcoming.reduce((s, x) => s + Number(x.amount_inr), 0);

  if (!subs.length && !invoices.length) {
    return (
      <div className="page">
        <header className="page-head"><div><h1>Spend overview</h1><p className="muted">Tools, platforms and subscriptions — what we pay and when.</p></div></header>
        <Empty icon="chart" title="No subscriptions or invoices yet">
          {ctx.fin.isFinance ? 'Start by adding the tools you pay for under Subscriptions, then record invoices against them.' : 'Finance (finance@chiparama.com) will add subscriptions and invoices here.'}
        </Empty>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Spend overview</h1><p className="muted">Paid invoices and subscription run-rate, in INR.</p></div>
        <div className="head-actions">
          <div className="seg">
            <button className={fy ? 'on' : ''} onClick={() => { setFy(true); setYear(currentPeriodYear(true)); }}>Financial year</button>
            <button className={!fy ? 'on' : ''} onClick={() => { setFy(false); setYear(currentPeriodYear(false)); }}>Calendar year</button>
          </div>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="narrow">
            {years.map((y) => <option key={y} value={y}>{periodLabel(y, fy)}</option>)}
          </select>
        </div>
      </header>

      <div className="stats">
        <Stat label="Monthly run-rate" value={fmtINR(runMonthly)} sub={`${running.length} active subscription${running.length === 1 ? '' : 's'}`} />
        <Stat label="Annual run-rate" value={fmtCompact(runMonthly * 12)} sub="Monthly run-rate × 12" />
        <Stat label="Spent this month" value={fmtINR(thisMonth)} sub={today().toLocaleDateString('en-IN', { month: 'long' })} />
        <Stat label={`Spent in ${periodLabel(year, fy)}`} value={fmtCompact(periodTotal)} sub={`Avg ${fmtCompact(periodTotal / monthsElapsed)} / month`} />
        <Stat label="Outstanding" value={fmtCompact(outstanding.reduce((s, i) => s + Number(i.total_inr), 0))}
          sub={overdue.length ? <span className="danger">{overdue.length} overdue</span> : `${outstanding.length} unpaid`} onClick={() => go('invoices')} />
      </div>

      <div className="fin-grid">
        <section className="card span-2">
          <div className="card-head"><h3>Monthly spend · {periodLabel(year, fy)}</h3><span className="muted small">Paid invoices by invoice month</span></div>
          <MonthBars data={monthData} />
        </section>

        <section className="card">
          <div className="card-head"><h3>By platform</h3><span className="muted small">{periodLabel(year, fy)}</span></div>
          <RankBars data={topN(byPlatform)} total={periodTotal} empty="No paid invoices in this period" />
        </section>
        <section className="card">
          <div className="card-head"><h3>By category</h3><span className="muted small">{periodLabel(year, fy)}</span></div>
          <RankBars data={topN(byCategory)} total={periodTotal} empty="No paid invoices in this period" />
        </section>

        <section className="card">
          <div className="card-head"><h3>Monthly vs annual billing</h3><span className="muted small">Active subscriptions</span></div>
          {cycleRows.length === 0 ? <div className="muted small pad">No active subscriptions</div> : (
            <table className="mini">
              <thead><tr><th>Billed</th><th>Subs</th><th>Per bill</th><th>Monthly eq.</th><th>Yearly eq.</th></tr></thead>
              <tbody>
                {cycleRows.map((r) => <tr key={r.k}><td>{r.label}</td><td>{r.n}</td><td>{fmtCompact(r.billed)}</td><td>{fmtCompact(r.monthly)}</td><td>{fmtCompact(r.monthly * 12)}</td></tr>)}
                <tr className="total"><td>Total</td><td>{running.length}</td><td /><td>{fmtCompact(runMonthly)}</td><td>{fmtCompact(runMonthly * 12)}</td></tr>
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <div className="card-head"><h3>Renewing in 30 days</h3><span className="muted small">{fmtCompact(upcomingTotal)} due</span></div>
          {upcoming.length === 0 ? <div className="muted small pad">Nothing renews in the next 30 days</div> : upcoming.slice(0, 8).map((s) => (
            <div key={s.id} className="due-row">
              <div className="grow"><b>{s.platform}</b><div className="muted xsmall">{CYCLES[s.billing_cycle].label}{s.plan_name ? ' · ' + s.plan_name : ''}</div></div>
              <div className="right"><div className="small"><b>{fmtINR(s.amount_inr)}</b></div><div className={'xsmall ' + (daysUntil(s.next_billing_date) <= 3 ? 'danger' : 'muted')}>{fmtDate(s.next_billing_date)} · {relDays(s.next_billing_date)}</div></div>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="card-head"><h3>Expiring / expired</h3><span className="muted small">Next 45 days</span></div>
          {expiring.length === 0 ? <div className="muted small pad">No subscriptions expiring soon</div> : expiring.slice(0, 8).map((s) => {
            const d = daysUntil(s.expiry_date);
            return (
              <div key={s.id} className="due-row">
                <div className="grow"><b>{s.platform}</b><div className="muted xsmall">{s.auto_renew ? 'Auto-renews' : 'Manual renewal'}</div></div>
                <div className="right"><StatusPill tone={d < 0 ? 'critical' : d <= 7 ? 'warning' : 'info'}>{d < 0 ? 'Expired' : 'Expires'} {relDays(s.expiry_date)}</StatusPill><div className="muted xsmall">{fmtDate(s.expiry_date)}</div></div>
              </div>
            );
          })}
        </section>

        <section className="card">
          <div className="card-head"><h3>Unpaid invoices</h3><button className="link-btn" onClick={() => go('invoices')}>View all</button></div>
          {outstanding.length === 0 ? <div className="muted small pad">All invoices are settled</div> : outstanding
            .sort((a, b) => (a.due_date || a.invoice_date).localeCompare(b.due_date || b.invoice_date)).slice(0, 8).map((i) => {
              const st = invStatus(i);
              return (
                <div key={i.id} className="due-row">
                  <div className="grow"><b>{i.platform}</b><div className="muted xsmall">{i.invoice_number ? '#' + i.invoice_number + ' · ' : ''}due {fmtDate(i.due_date)}</div></div>
                  <div className="right"><div className="small"><b>{fmtINR(i.total_inr)}</b></div><StatusPill tone={INV_STATUS[st].tone}>{INV_STATUS[st].label}</StatusPill></div>
                </div>
              );
            })}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, onClick }) {
  return (
    <div className={'stat card' + (onClick ? ' clickable' : '')} onClick={onClick}>
      <span className="stat-label">{label}</span>
      <b className="stat-value">{value}</b>
      <span className="stat-sub">{sub}</span>
    </div>
  );
}
