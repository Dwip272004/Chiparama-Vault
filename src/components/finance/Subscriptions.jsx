import React, { useMemo, useState } from 'react';
import { supabase } from '../../supabase.js';
import { Icon, SearchBox, Empty, Modal, Avatar, useToast } from '../ui.jsx';
import { StatusPill } from './charts.jsx';
import InvoiceForm from './InvoiceForm.jsx';
import {
  CYCLES, SUB_STATUS, CURRENCIES, fmtINR, fmtMoney, fmtDate, relDays, daysUntil, monthlyEq, isRunning,
  countsAsSpend, toCSV, download,
} from '../../finance.js';

export default function Subscriptions({ ctx }) {
  const toast = useToast();
  const { subs, invoices, isFinance } = ctx.fin;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('running');
  const [cycle, setCycle] = useState('');
  const [form, setForm] = useState(null);
  const [invFor, setInvFor] = useState(null);
  const [del, setDel] = useState(null);

  const spentBySub = useMemo(() => {
    const y = new Date().getFullYear(); const m = {};
    invoices.filter((i) => countsAsSpend(i) && i.subscription_id && i.invoice_date.startsWith(String(y)))
      .forEach((i) => { m[i.subscription_id] = (m[i.subscription_id] || 0) + Number(i.total_inr); });
    return m;
  }, [invoices]);

  const rows = subs.filter((s) => {
    if (status === 'running' && !isRunning(s)) return false;
    if (status && status !== 'running' && s.status !== status) return false;
    if (cycle && s.billing_cycle !== cycle) return false;
    const t = q.trim().toLowerCase();
    return !t || [s.platform, s.plan_name, s.category, s.payment_method].some((v) => v && v.toLowerCase().includes(t));
  }).sort((a, b) => (a.next_billing_date || '9999').localeCompare(b.next_billing_date || '9999'));

  const totMonthly = rows.filter(isRunning).reduce((s, x) => s + monthlyEq(x), 0);
  const person = (id) => ctx.profiles.find((p) => p.id === id);
  const team = (id) => ctx.teams.find((t) => t.id === id);

  function exportCSV() {
    download('subscriptions.csv', toCSV(rows, [
      { label: 'Platform', get: (s) => s.platform }, { label: 'Plan', get: (s) => s.plan_name }, { label: 'Category', get: (s) => s.category },
      { label: 'Billing', get: (s) => CYCLES[s.billing_cycle].label }, { label: 'Amount', get: (s) => s.amount }, { label: 'Currency', get: (s) => s.currency },
      { label: 'Amount INR', get: (s) => s.amount_inr }, { label: 'Monthly eq INR', get: (s) => monthlyEq(s).toFixed(2) },
      { label: 'Start date', get: (s) => s.start_date }, { label: 'Next billing', get: (s) => s.next_billing_date }, { label: 'Expiry', get: (s) => s.expiry_date },
      { label: 'Auto renew', get: (s) => (s.auto_renew ? 'Yes' : 'No') }, { label: 'Status', get: (s) => s.status },
      { label: 'Owner', get: (s) => person(s.owner_id)?.full_name }, { label: 'Team', get: (s) => team(s.team_id)?.name }, { label: 'Payment method', get: (s) => s.payment_method },
    ]));
  }
  async function doDelete() {
    const { error } = await supabase.from('inv_subscriptions').delete().eq('id', del.id);
    if (error) return toast(error.message, 'err');
    toast('Subscription deleted'); setDel(null); ctx.fin.reload();
  }

  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>Subscriptions</h1><p className="muted">Every paid tool and platform, its billing cycle and key dates.</p></div>
        <div className="head-actions">
          <button className="btn ghost" onClick={exportCSV}><Icon name="download" /> CSV</button>
          {isFinance && <button className="btn primary" onClick={() => setForm('new')}><Icon name="plus" /> Add subscription</button>}
        </div>
      </header>

      <div className="toolbar">
        <div className="filters">
          <SearchBox value={q} onChange={setQ} placeholder="Search platform, plan…" label="Search platform, plan…" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="narrow">
            <option value="running">Active & trial</option><option value="">All statuses</option>
            {Object.entries(SUB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={cycle} onChange={(e) => setCycle(e.target.value)} className="narrow">
            <option value="">All billing cycles</option>
            {Object.entries(CYCLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <span className="muted small">{rows.length} shown · run-rate <b className="ink">{fmtINR(totMonthly)}</b>/mo · <b className="ink">{fmtINR(totMonthly * 12)}</b>/yr</span>
      </div>

      {rows.length === 0 ? <Empty icon="card" title={subs.length ? 'Nothing matches these filters' : 'No subscriptions yet'}>{!subs.length && isFinance ? 'Add the tools the company pays for.' : null}</Empty> : (
        <div className="table-wrap">
          <table className="table fin">
            <thead><tr>
              <th>Platform</th><th>Billing</th><th className="num">Amount</th><th className="num">Monthly / yearly eq.</th>
              <th>Subscribed</th><th>Next billing</th><th>Expiry</th><th>Status</th><th className="num">Paid this yr</th><th />
            </tr></thead>
            <tbody>
              {rows.map((s) => {
                const nb = daysUntil(s.next_billing_date); const ex = daysUntil(s.expiry_date);
                const owner = person(s.owner_id);
                return (
                  <tr key={s.id}>
                    <td><b>{s.platform}</b><div className="muted xsmall">{[s.plan_name, s.category, s.seats ? s.seats + ' seats' : null].filter(Boolean).join(' · ')}</div>
                      {(owner || s.team_id) && <div className="muted xsmall">Owner: {owner?.full_name || owner?.email || '—'}{s.team_id ? ' · ' + (team(s.team_id)?.name || '') : ''}</div>}</td>
                    <td><span className={'cycle c-' + s.billing_cycle}>{CYCLES[s.billing_cycle].label}</span>{s.auto_renew && s.billing_cycle !== 'one_time' && <div className="muted xsmall">auto-renew</div>}</td>
                    <td className="num"><b>{fmtMoney(s.amount, s.currency)}</b>{s.currency !== 'INR' && <div className="muted xsmall">{fmtINR(s.amount_inr)}</div>}</td>
                    <td className="num">{fmtINR(monthlyEq(s))}<div className="muted xsmall">{fmtINR(monthlyEq(s) * 12)} / yr</div></td>
                    <td className="small nowrap">{fmtDate(s.start_date)}</td>
                    <td className="small nowrap">{s.next_billing_date ? <>{fmtDate(s.next_billing_date)}<div className={'xsmall ' + (nb != null && nb <= 7 && nb >= 0 ? 'warn-text' : nb < 0 ? 'danger' : 'muted')}>{relDays(s.next_billing_date)}</div></> : '—'}</td>
                    <td className="small nowrap">{s.expiry_date ? <>{fmtDate(s.expiry_date)}<div className={'xsmall ' + (ex < 0 ? 'danger' : ex <= 30 ? 'warn-text' : 'muted')}>{relDays(s.expiry_date)}</div></> : '—'}</td>
                    <td><StatusPill tone={SUB_STATUS[s.status].tone}>{SUB_STATUS[s.status].label}</StatusPill></td>
                    <td className="num">{fmtINR(spentBySub[s.id] || 0)}</td>
                    <td className="row-actions">
                      {isFinance && <>
                        <button className="icon-btn" title="Record invoice" aria-label="Record invoice" onClick={() => setInvFor(s)}><Icon name="receipt" /></button>
                        <button className="icon-btn" title="Edit" aria-label="Edit" onClick={() => setForm(s)}><Icon name="edit" /></button>
                        <button className="icon-btn danger" title="Delete" aria-label="Delete" onClick={() => setDel(s)}><Icon name="trash" /></button>
                      </>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && <SubForm ctx={ctx} sub={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {invFor && <InvoiceForm ctx={ctx} fromSub={invFor} onClose={() => setInvFor(null)} />}
      {del && (
        <Modal title="Delete subscription?" onClose={() => setDel(null)}
          footer={<><button className="btn ghost" onClick={() => setDel(null)}>Cancel</button><button className="btn danger" onClick={doDelete}>Delete</button></>}>
          <p><b>{del.platform}</b> will be removed. Its invoices stay, but are unlinked. Tip: set the status to <i>Cancelled</i> instead to keep history.</p>
        </Modal>
      )}
    </div>
  );
}

export function SubForm({ ctx, sub, onClose }) {
  const toast = useToast();
  const isNew = !sub;
  const [f, setF] = useState({
    platform: sub?.platform || '', vendor_url: sub?.vendor_url || '', category: sub?.category || 'Software', plan_name: sub?.plan_name || '',
    billing_cycle: sub?.billing_cycle || 'monthly', amount: sub?.amount ?? '', currency: sub?.currency || 'INR', fx_rate: sub?.fx_rate ?? 1,
    seats: sub?.seats ?? '', start_date: sub?.start_date || '', expiry_date: sub?.expiry_date || '', next_billing_date: sub?.next_billing_date || '',
    auto_renew: sub?.auto_renew ?? true, status: sub?.status || 'active', owner_id: sub?.owner_id || '', team_id: sub?.team_id || '',
    payment_method: sub?.payment_method || '', pm_item_id: sub?.pm_item_id || '', notes: sub?.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const cats = [...new Set(['Software', 'Job boards', 'Sales tools', 'Cloud & hosting', 'Marketing', 'Communication', 'Design', 'Finance & HR', ...ctx.fin.subs.map((s) => s.category)])];
  const inrPreview = Number(f.amount || 0) * Number(f.fx_rate || 1);

  async function save() {
    if (!f.platform.trim()) return toast('Platform name is required', 'err');
    setBusy(true);
    const row = {
      ...f, amount: Number(f.amount || 0), fx_rate: f.currency === 'INR' ? 1 : Number(f.fx_rate || 1), seats: f.seats === '' ? null : Number(f.seats),
      start_date: f.start_date || null, expiry_date: f.expiry_date || null,
      next_billing_date: f.billing_cycle === 'one_time' ? null : f.next_billing_date || null,
      owner_id: f.owner_id || null, team_id: f.team_id || null, pm_item_id: f.pm_item_id || null,
    };
    const { error } = isNew ? await supabase.from('inv_subscriptions').insert(row) : await supabase.from('inv_subscriptions').update(row).eq('id', sub.id);
    setBusy(false);
    if (error) return toast(error.message, 'err');
    toast(isNew ? 'Subscription added' : 'Subscription updated');
    ctx.fin.reload(); onClose();
  }

  return (
    <Modal title={isNew ? 'Add subscription' : `Edit · ${sub.platform}`} onClose={onClose} wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="form-grid three">
        <label className="span2">Platform / tool<input value={f.platform} onChange={set('platform')} placeholder="e.g. LinkedIn Recruiter" autoFocus /></label>
        <label>Category<input list="subcats" value={f.category} onChange={set('category')} /><datalist id="subcats">{cats.map((c) => <option key={c} value={c} />)}</datalist></label>
        <label>Plan<input value={f.plan_name} onChange={set('plan_name')} placeholder="Pro / Business…" /></label>
        <label>Seats<input type="number" min="0" value={f.seats} onChange={set('seats')} /></label>
        <label>Website<input value={f.vendor_url} onChange={set('vendor_url')} placeholder="https://…" /></label>
      </div>
      <div className="section-box">
        <div className="section-title"><Icon name="card" /> Billing</div>
        <div className="form-grid three">
          <label>Paid<select value={f.billing_cycle} onChange={set('billing_cycle')}>{Object.entries(CYCLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <label>Amount per bill<input type="number" min="0" step="0.01" value={f.amount} onChange={set('amount')} /></label>
          <label>Currency<select value={f.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          {f.currency !== 'INR' && <label>1 {f.currency} = ₹<input type="number" min="0" step="0.0001" value={f.fx_rate} onChange={set('fx_rate')} /></label>}
          {f.currency !== 'INR' && <div className="hint">≈ {fmtINR(inrPreview)} per bill</div>}
          <label>Payment method<input value={f.payment_method} onChange={set('payment_method')} placeholder="HDFC card ••21 / UPI / Bank" /></label>
        </div>
      </div>
      <div className="section-box">
        <div className="section-title"><Icon name="calendar" /> Dates & status</div>
        <div className="form-grid three">
          <label>Subscribed on<input type="date" value={f.start_date} onChange={set('start_date')} /></label>
          <label>Next billing date<input type="date" value={f.next_billing_date} onChange={set('next_billing_date')} disabled={f.billing_cycle === 'one_time'} /><span className="muted xsmall">Leave empty to calculate from the subscription date</span></label>
          <label>Expiry / contract end<input type="date" value={f.expiry_date} onChange={set('expiry_date')} /></label>
          <label>Status<select value={f.status} onChange={set('status')}>{Object.entries(SUB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <label className="check"><input type="checkbox" checked={f.auto_renew} onChange={set('auto_renew')} /> Auto-renews</label>
        </div>
      </div>
      <div className="form-grid three" style={{ marginTop: 16 }}>
        <label>Owner<select value={f.owner_id} onChange={set('owner_id')}><option value="">—</option>{ctx.profiles.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</select></label>
        <label>Team / cost centre<select value={f.team_id} onChange={set('team_id')}><option value="">—</option>{ctx.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Linked vault login<select value={f.pm_item_id} onChange={set('pm_item_id')}><option value="">—</option>{ctx.items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</select></label>
        <label className="span3">Notes<textarea rows={2} value={f.notes} onChange={set('notes')} /></label>
      </div>
    </Modal>
  );
}
