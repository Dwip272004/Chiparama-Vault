import React, { useState } from 'react';
import { supabase } from '../../supabase.js';
import { Icon, Modal, useToast } from '../ui.jsx';
import { CYCLES, INV_STATUS, CURRENCIES, fmtINR, fmtMoney } from '../../finance.js';

function addCycle(d, cycle) {
  const m = CYCLES[cycle]?.months; if (!d || !m) return '';
  const x = new Date(d + 'T00:00:00'); x.setMonth(x.getMonth() + m); x.setDate(x.getDate() - 1);
  return x.toISOString().slice(0, 10);
}

export default function InvoiceForm({ ctx, invoice, fromSub, onClose }) {
  const toast = useToast();
  const isNew = !invoice;
  const base = invoice || {};
  const sub = fromSub || ctx.fin.subs.find((s) => s.id === base.subscription_id);
  const start = fromSub?.next_billing_date && fromSub.next_billing_date <= new Date().toISOString().slice(0, 10) ? fromSub.next_billing_date : new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    subscription_id: base.subscription_id || fromSub?.id || '', platform: base.platform || fromSub?.platform || '',
    category: base.category || fromSub?.category || 'Software', invoice_number: base.invoice_number || '',
    invoice_date: base.invoice_date || new Date().toISOString().slice(0, 10), due_date: base.due_date || '',
    period_start: base.period_start || (fromSub ? start : ''), period_end: base.period_end || (fromSub ? addCycle(start, fromSub.billing_cycle) : ''),
    amount: base.amount ?? fromSub?.amount ?? '', tax_amount: base.tax_amount ?? '', currency: base.currency || fromSub?.currency || 'INR',
    fx_rate: base.fx_rate ?? fromSub?.fx_rate ?? 1, status: base.status || 'pending', paid_on: base.paid_on || '',
    payment_method: base.payment_method || fromSub?.payment_method || '', reference: base.reference || '', notes: base.notes || '',
  });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function pickSub(id) {
    const s = ctx.fin.subs.find((x) => x.id === id);
    if (!s) return setF({ ...f, subscription_id: '' });
    setF({ ...f, subscription_id: id, platform: s.platform, category: s.category, amount: s.amount, currency: s.currency, fx_rate: s.fx_rate, payment_method: s.payment_method || f.payment_method,
      period_end: f.period_start ? addCycle(f.period_start, s.billing_cycle) : f.period_end });
  }
  const total = Number(f.amount || 0) + Number(f.tax_amount || 0);
  const gst18 = () => setF({ ...f, tax_amount: (Number(f.amount || 0) * 0.18).toFixed(2) });

  async function save() {
    if (!f.platform.trim()) return toast('Platform is required', 'err');
    setBusy(true);
    let file_path = base.file_path || null;
    if (file) {
      const path = `${f.invoice_date.slice(0, 4)}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
      const up = await supabase.storage.from('invoices').upload(path, file);
      if (up.error) { setBusy(false); return toast('Upload failed: ' + up.error.message, 'err'); }
      file_path = path;
    }
    const row = {
      ...f, subscription_id: f.subscription_id || null, amount: Number(f.amount || 0), tax_amount: Number(f.tax_amount || 0),
      fx_rate: f.currency === 'INR' ? 1 : Number(f.fx_rate || 1), due_date: f.due_date || null, period_start: f.period_start || null,
      period_end: f.period_end || null, paid_on: f.status === 'paid' ? f.paid_on || null : null, file_path,
    };
    const { error } = isNew ? await supabase.from('inv_invoices').insert(row) : await supabase.from('inv_invoices').update(row).eq('id', base.id);
    setBusy(false);
    if (error) return toast(error.message, 'err');
    toast(isNew ? 'Invoice recorded' : 'Invoice updated');
    ctx.fin.reload(); onClose();
  }

  return (
    <Modal title={isNew ? 'Record invoice' : `Edit invoice${base.invoice_number ? ' #' + base.invoice_number : ''}`} onClose={onClose} wide
      footer={<><span className="foot-total">Total {fmtMoney(total, f.currency)}{f.currency !== 'INR' ? ` ≈ ${fmtINR(total * Number(f.fx_rate || 1))}` : ''}</span>
        <button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save invoice'}</button></>}>
      <div className="form-grid three">
        <label className="span2">Subscription
          <select value={f.subscription_id} onChange={(e) => pickSub(e.target.value)}>
            <option value="">— Not linked (one-off purchase) —</option>
            {ctx.fin.subs.map((s) => <option key={s.id} value={s.id}>{s.platform}{s.plan_name ? ' · ' + s.plan_name : ''} ({CYCLES[s.billing_cycle].label})</option>)}
          </select>
        </label>
        <label>Invoice number<input value={f.invoice_number} onChange={set('invoice_number')} placeholder="INV-0042" /></label>
        <label>Platform / vendor<input value={f.platform} onChange={set('platform')} disabled={!!f.subscription_id} /></label>
        <label>Category<input value={f.category} onChange={set('category')} disabled={!!f.subscription_id} /></label>
        <label>Invoice date<input type="date" value={f.invoice_date} onChange={set('invoice_date')} /></label>
        <label>Service period from<input type="date" value={f.period_start} onChange={set('period_start')} /></label>
        <label>Service period to<input type="date" value={f.period_end} onChange={set('period_end')} /></label>
        <label>Due date<input type="date" value={f.due_date} onChange={set('due_date')} /></label>
      </div>
      <div className="section-box">
        <div className="section-title"><Icon name="receipt" /> Amount & payment</div>
        <div className="form-grid three">
          <label>Amount (before tax)<input type="number" min="0" step="0.01" value={f.amount} onChange={set('amount')} /></label>
          <label><span className="label-row">Tax / GST <a onClick={gst18}>Apply 18% GST</a></span><input type="number" min="0" step="0.01" value={f.tax_amount} onChange={set('tax_amount')} /></label>
          <label>Currency<select value={f.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          {f.currency !== 'INR' && <label>1 {f.currency} = ₹<input type="number" min="0" step="0.0001" value={f.fx_rate} onChange={set('fx_rate')} /></label>}
          <label>Status<select value={f.status} onChange={set('status')}>{Object.entries(INV_STATUS).filter(([k]) => k !== 'overdue').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            <span className="muted xsmall">Pending past the due date shows as Overdue</span></label>
          {f.status === 'paid' && <label>Paid on<input type="date" value={f.paid_on} onChange={set('paid_on')} /></label>}
          <label>Payment method<input value={f.payment_method} onChange={set('payment_method')} /></label>
          <label>Transaction ref.<input value={f.reference} onChange={set('reference')} placeholder="UTR / card txn id" /></label>
        </div>
      </div>
      <div className="form-grid" style={{ marginTop: 16 }}>
        <label>Invoice file (PDF/image)
          <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files[0] || null)} />
          {base.file_path && !file && <span className="muted xsmall">A file is attached; choosing a new one replaces it.</span>}
        </label>
        <label>Notes<textarea rows={2} value={f.notes} onChange={set('notes')} /></label>
      </div>
      {sub && f.status === 'paid' && <p className="muted small">Marking this paid moves <b>{sub.platform}</b>'s next billing date past the service period automatically.</p>}
    </Modal>
  );
}
