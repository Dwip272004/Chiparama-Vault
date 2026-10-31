import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase.js';
import { Icon, Modal, useToast } from '../ui.jsx';
import { StatusPill } from '../finance/charts.jsx';
import PdfPages from '../finance/PdfPages.jsx';
import { buildPayeeInvoicePdf, downloadPayeeInvoice, monthName } from '../../payeeInvoicePdf.js';
import { num, money } from '../../invoicePdf.js';
import { fmtDate } from '../../finance.js';
import { timeAgo } from '../../lib.js';

export const PINV_STATUS = {
  submitted: { label: 'Waiting for approval', short: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', short: 'Approved', tone: 'good' },
  paid: { label: 'Paid', short: 'Paid', tone: 'good' },
  rejected: { label: 'Sent back', short: 'Sent back', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', short: 'Withdrawn', tone: 'neutral' },
};
export const PinvPill = ({ status, short }) => <StatusPill tone={PINV_STATUS[status]?.tone || 'neutral'}>{short ? PINV_STATUS[status]?.short : PINV_STATUS[status]?.label}</StatusPill>;
export { monthName };

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const maskAcct = (n) => (n ? `•••• ${String(n).slice(-4)}` : '');
export const profileGaps = (pp) => [
  !pp?.full_name && 'full name', !pp?.bank_account_no && 'bank account number', !pp?.bank_ifsc && 'IFSC code',
].filter(Boolean);

export const nameOf = (profiles, id) => { const p = profiles.find((x) => x.id === id); return p ? p.full_name || p.email : '—'; };
export const emailOf = (profiles, id) => profiles.find((x) => x.id === id)?.email || '';

export function usePayWindow() {
  const [w, setW] = useState(null);
  useEffect(() => { supabase.rpc('pay_inv_window').then(({ data }) => setW(data || null)); }, []);
  return w;
}

// ------------------------------------------------------------------ profile form
export function ProfileForm({ userId, initial, fallbackName, onClose, onSaved, title = 'Edit details' }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({
    full_name: initial?.full_name || fallbackName || '', designation: initial?.designation || '', start_date: initial?.start_date || '',
    phone: initial?.phone || '', address: initial?.address || '', pan: initial?.pan || '',
    bank_account_name: initial?.bank_account_name || '', bank_name: initial?.bank_name || '', bank_branch: initial?.bank_branch || '',
    bank_account_no: initial?.bank_account_no || '', bank_account_no2: initial?.bank_account_no || '', bank_ifsc: initial?.bank_ifsc || '',
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const ifsc = f.bank_ifsc.replace(/\s/g, '').toUpperCase();
  const pan = f.pan.replace(/\s/g, '').toUpperCase();
  const acct = f.bank_account_no.replace(/\s/g, '');
  const errors = {
    full_name: !f.full_name.trim() && 'Required',
    bank_ifsc: ifsc && !IFSC_RE.test(ifsc) && '11 characters, e.g. HDFC0001234',
    pan: pan && !PAN_RE.test(pan) && '10 characters, e.g. ABCDE1234F',
    bank_account_no: acct && !/^\d{9,18}$/.test(acct) && '9–18 digits',
    bank_account_no2: acct && acct !== f.bank_account_no2.replace(/\s/g, '') && 'Account numbers don’t match',
  };
  const bad = Object.values(errors).some(Boolean);

  async function save() {
    if (bad) return toast('Please fix the highlighted fields', 'err');
    setBusy(true);
    const row = {
      user_id: userId, full_name: f.full_name.trim(), designation: f.designation.trim() || null, start_date: f.start_date || null,
      phone: f.phone.trim() || null, address: f.address.trim() || null, pan: pan || null,
      bank_account_name: f.bank_account_name.trim() || null, bank_name: f.bank_name.trim() || null, bank_branch: f.bank_branch.trim() || null,
      bank_account_no: acct || null, bank_ifsc: ifsc || null,
    };
    const { error } = await supabase.from('people_profiles').upsert(row, { onConflict: 'user_id' });
    setBusy(false);
    if (error) return toast(error.message, 'err');
    toast('Details saved'); onSaved?.(); onClose();
  }
  const fld = (k, label, o = {}) => (
    <label className={o.span ? 'span2' : ''}>{label}
      {o.area ? <textarea rows={2} value={f[k]} onChange={set(k)} placeholder={o.ph} />
        : <input type={o.type || 'text'} value={f[k]} onChange={set(k)} placeholder={o.ph} inputMode={o.mode} autoComplete="off"
            aria-invalid={!!errors[k]} style={o.upper ? { textTransform: 'uppercase' } : undefined} autoFocus={o.focus} />}
      {errors[k] && <span className="field-err">{errors[k]}</span>}
    </label>
  );
  return (
    <Modal title={title} onClose={onClose} wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save details'}</button></>}>
      <div className="form-grid">
        {fld('full_name', 'Full name (as on bank account)', { focus: true })}{fld('designation', 'Designation', { ph: 'e.g. Talent Acquisition Lead' })}
        {fld('start_date', 'Starting date', { type: 'date' })}{fld('phone', 'Phone', { ph: '+91 …', mode: 'tel' })}
        {fld('address', 'Address (printed on your invoice)', { area: true, span: true })}
        {fld('pan', 'PAN (optional)', { upper: true, ph: 'ABCDE1234F' })}<span />
      </div>
      <div className="section-box">
        <div className="section-title"><Icon name="card" /> Bank account for payouts</div>
        <div className="form-grid">
          {fld('bank_account_name', 'Account holder name', { ph: 'Leave blank if same as full name' })}{fld('bank_name', 'Bank name', { ph: 'e.g. HDFC Bank' })}
          {fld('bank_account_no', 'Account number', { mode: 'numeric' })}{fld('bank_account_no2', 'Re-enter account number', { mode: 'numeric' })}
          {fld('bank_ifsc', 'IFSC code', { upper: true, ph: 'HDFC0001234' })}{fld('bank_branch', 'Branch (optional)')}
        </div>
        <p className="muted xsmall" style={{ marginTop: 8 }}>Only you, Finance and admins can see these details. They are copied onto each invoice when you submit it.</p>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ raise / edit an invoice
export function RaiseInvoice({ existing, salary, window: w, profile, onClose, onDone }) {
  const toast = useToast();
  const month = w?.month || existing?.month;
  const hasSalary = !!(salary && Number(salary.monthly_gross) > 0);
  const extrasInit = (existing?.items || []).filter((x) => x.kind === 'extra').map((x) => ({ description: x.description, amount: String(x.amount) }));
  const mainInit = (existing?.items || []).filter((x) => x.kind !== 'extra').map((x) => ({ description: x.description, amount: String(x.amount) }));
  const [main, setMain] = useState(mainInit.length ? mainInit : [{ description: `Professional fee for ${monthName(month)}`, amount: '' }]);
  const [extras, setExtras] = useState(extrasInit);
  const [notes, setNotes] = useState(existing?.notes || '');
  const [busy, setBusy] = useState(false);
  const n = (v) => Number(String(v).replace(/,/g, '')) || 0;
  const total = (hasSalary ? Number(salary.monthly_gross) : main.reduce((s, x) => s + n(x.amount), 0)) + extras.reduce((s, x) => s + n(x.amount), 0);
  const gaps = profileGaps(profile);

  async function submit() {
    setBusy(true);
    const { error } = await supabase.rpc('pay_inv_submit', {
      p_extras: extras.filter((x) => x.description.trim() || x.amount).map((x) => ({ description: x.description, amount: n(x.amount) })),
      p_notes: notes || null,
      p_items: hasSalary ? null : main.map((x) => ({ description: x.description, amount: n(x.amount) })),
    });
    setBusy(false);
    if (error) return toast(error.message, 'err');
    toast(existing?.status === 'submitted' ? 'Invoice updated' : 'Invoice submitted for approval');
    onDone?.(); onClose();
  }
  const lineRow = (arr, setArr, i, locked) => (
    <div key={i} className="pinv-line">
      <input value={arr[i].description} onChange={(e) => setArr(arr.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="Description, e.g. Cab to client office" aria-label="Description" disabled={locked} />
      <input value={arr[i].amount} onChange={(e) => setArr(arr.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} inputMode="decimal" placeholder="0.00" aria-label="Amount" className="num" disabled={locked} />
      <button className="icon-btn" onClick={() => setArr(arr.filter((_, j) => j !== i))} aria-label="Remove line" title="Remove line" disabled={locked || (arr === main && main.length === 1)}><Icon name="x" /></button>
    </div>
  );

  return (
    <Modal title={existing && existing.status !== 'withdrawn' ? `${existing.status === 'rejected' ? 'Fix and resubmit' : 'Edit'} · ${existing.invoice_number}` : `Raise invoice · ${monthName(month)}`} onClose={onClose} wide
      footer={<><span className="grow muted small">Goes to finance@chiplabs.tech and prashant@chiplabs.tech for approval</span>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || gaps.length > 0 || total <= 0} onClick={submit}>{busy ? 'Submitting…' : existing?.status === 'submitted' ? 'Save changes' : 'Submit for approval'}</button></>}>
      {gaps.length > 0 && <div className="note err" style={{ marginBottom: 12 }}>Add your {gaps.join(', ')} under My profile → Edit details before submitting.</div>}
      {existing?.status === 'rejected' && existing.decision_comment && (
        <div className="note warn" style={{ marginBottom: 12 }}><b>Sent back:</b> {existing.decision_comment}</div>
      )}
      <div className="pinv-lines">
        <div className="pinv-head"><span>Description</span><span className="num">Amount (INR)</span><span /></div>
        {hasSalary ? (
          <div className="pinv-line locked">
            <span>Professional fee / salary for {monthName(month)}<span className="muted xsmall"> · from your salary record</span></span>
            <b className="num">{num(salary.monthly_gross)}</b>
            <span title="Set by Finance"><Icon name="lock" size={14} /></span>
          </div>
        ) : main.map((_, i) => lineRow(main, setMain, i))}
        {!hasSalary && <button className="link-btn" onClick={() => setMain([...main, { description: '', amount: '' }])}>+ Add line</button>}
        {!hasSalary && <p className="muted xsmall">No salary is on file for you yet, so enter the amount yourself. Finance will check it.</p>}

        <div className="pinv-sub">Extra items <span className="muted xsmall">(optional – reimbursements, travel, equipment…)</span></div>
        {extras.map((_, i) => lineRow(extras, setExtras, i))}
        <button className="link-btn" onClick={() => setExtras([...extras, { description: '', amount: '' }])}>+ Add extra item</button>

        <div className="pinv-total"><span>Total</span><b>{money(total)}</b></div>
      </div>
      <label className="form-grid one" style={{ marginTop: 14 }}>Notes for Finance (optional)
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Bills for the travel are in the shared drive" />
      </label>
    </Modal>
  );
}

// ------------------------------------------------------------------ viewer (PDF + actions + timeline)
export function PayInvoiceViewer({ ctx, inv: initial, onClose, onChanged, onEdit }) {
  const toast = useToast();
  const [inv, setInv] = useState(initial);
  const [events, setEvents] = useState([]);
  const [dlg, setDlg] = useState(null); // 'reject' | 'approve' | 'paid' | 'withdraw'
  const [comment, setComment] = useState('');
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const me = ctx.me;
  const isOwner = inv.user_id === me.id;
  const canDecide = ctx.people?.isApprover && !isOwner && inv.status === 'submitted';
  const canPay = ctx.fin?.isFinance && inv.status === 'approved';

  async function reload() {
    const [r, ev] = await Promise.all([
      supabase.from('pay_invoices').select('*').eq('id', initial.id).maybeSingle(),
      supabase.from('pay_invoice_events').select('*').eq('invoice_id', initial.id).order('id'),
    ]);
    if (r.data) setInv(r.data);
    setEvents(ev.data || []);
  }
  useEffect(() => { reload(); }, [initial.id]); // eslint-disable-line

  const extra = { email: emailOf(ctx.profiles, inv.user_id), approvedBy: inv.decided_by ? nameOf(ctx.profiles, inv.decided_by) : '' };
  const blob = useMemo(() => buildPayeeInvoicePdf(inv, extra).output('blob'), [inv, extra.email, extra.approvedBy]); // eslint-disable-line

  async function act() {
    setBusy(true);
    let res;
    if (dlg === 'approve' || dlg === 'reject') res = await supabase.rpc('pay_inv_decide', { p_id: inv.id, p_decision: dlg, p_comment: comment || null });
    else if (dlg === 'paid') res = await supabase.rpc('pay_inv_mark_paid', { p_id: inv.id, p_paid_on: paidOn || null, p_ref: ref || null });
    else if (dlg === 'withdraw') res = await supabase.rpc('pay_inv_withdraw', { p_id: inv.id });
    setBusy(false);
    if (res.error) return toast(res.error.message, 'err');
    toast({ approve: 'Invoice approved', reject: 'Sent back with your comment', paid: 'Marked as paid', withdraw: 'Invoice withdrawn' }[dlg]);
    setDlg(null); setComment(''); reload(); onChanged?.();
  }
  const ACT = { submitted: 'Submitted', resubmitted: 'Resubmitted', edited: 'Edited', approved: 'Approved', rejected: 'Sent back', withdrawn: 'Withdrawn', paid: 'Marked paid' };

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`Invoice ${inv.invoice_number}`}>
      <div className="viewer-bar">
        <button className="btn small ghost" onClick={onClose} autoFocus><Icon name="x" /> Close</button>
        <div className="grow viewer-title"><b>{inv.invoice_number}</b><span>{inv.payee?.full_name} · {monthName(inv.month)} · {money(inv.total, inv.currency)}</span></div>
        <PinvPill status={inv.status} />
        <button className="btn small" onClick={() => downloadPayeeInvoice(inv, extra)}><Icon name="download" /> Download PDF</button>
      </div>
      <div className="viewer-body">
        <div className="viewer-doc"><PdfPages blob={blob} title={`Invoice ${inv.invoice_number}`} /></div>
        <aside className="viewer-side wide" aria-label="Invoice actions">
          {canDecide && (
            <div className="apr-box">
              <b>Your approval is needed</b>
              <p className="muted small">Check the amount and bank details, then approve. Approving adds it to Salaries → Monthly payouts for {monthName(inv.month)}.</p>
              <div className="row-gap">
                <button className="btn primary" onClick={() => setDlg('approve')}><Icon name="check" /> Approve</button>
                <button className="btn ghost danger-text" onClick={() => setDlg('reject')}>Send back</button>
              </div>
            </div>
          )}
          {canPay && (
            <div className="apr-box">
              <b>Approved – ready to pay</b>
              <p className="muted small">Pay {money(inv.total, inv.currency)} to {inv.payee?.bank_account_name || inv.payee?.full_name}, {inv.payee?.bank_name || 'bank'} a/c {inv.payee?.bank_account_no}, IFSC {inv.payee?.bank_ifsc}.</p>
              <button className="btn primary" onClick={() => setDlg('paid')}><Icon name="check" /> Mark as paid</button>
            </div>
          )}
          {isOwner && ['submitted', 'rejected', 'withdrawn'].includes(inv.status) && (
            <div className="apr-box">
              {inv.status === 'rejected' ? <><b>Sent back for changes</b><div className="apr-comment rej">{inv.decision_comment}</div></>
                : inv.status === 'withdrawn' ? <b>You withdrew this invoice</b> : <b>Waiting for approval</b>}
              <div className="row-gap" style={{ marginTop: 8 }}>
                {onEdit && <button className="btn primary small" onClick={() => onEdit(inv)}><Icon name="edit" /> {inv.status === 'submitted' ? 'Edit' : 'Edit & resubmit'}</button>}
                {inv.status === 'submitted' && <button className="btn ghost small" onClick={() => setDlg('withdraw')}>Withdraw</button>}
              </div>
            </div>
          )}
          {inv.payroll_note && (ctx.fin?.isFinance || ctx.people?.isApprover) && <div className="note warn small" style={{ marginBottom: 12 }}>{inv.payroll_note}</div>}

          <h4>Details</h4>
          <div className="dl"><div className="k">Person</div><div className="v stack">{inv.payee?.full_name}{inv.payee?.designation ? <div className="muted xsmall">{inv.payee.designation}</div> : null}</div></div>
          <div className="dl"><div className="k">Period</div><div className="v">{monthName(inv.month)}</div></div>
          <div className="dl"><div className="k">Amount</div><div className="v"><b>{money(inv.total, inv.currency)}</b></div></div>
          <div className="dl"><div className="k">Bank</div><div className="v stack">{inv.payee?.bank_name || '—'}<div className="muted xsmall">A/c {inv.payee?.bank_account_no} · {inv.payee?.bank_ifsc}</div></div></div>
          {inv.paid_on && <div className="dl"><div className="k">Paid on</div><div className="v">{fmtDate(inv.paid_on)}{inv.payment_ref ? ` · ${inv.payment_ref}` : ''}</div></div>}

          <h4>History</h4>
          <ol className="pinv-tl">
            {events.map((e) => (
              <li key={e.id} className={e.action}>
                <b>{ACT[e.action] || e.action}</b> · {nameOf(ctx.profiles, e.actor)}
                <span className="muted xsmall"> · {timeAgo(e.created_at)}</span>
                {e.comment && <div className={'apr-comment' + (e.action === 'rejected' ? ' rej' : '')}>{e.comment}</div>}
              </li>
            ))}
          </ol>
        </aside>
      </div>

      {dlg && (
        <Modal title={{ approve: `Approve ${inv.invoice_number}?`, reject: `Send back ${inv.invoice_number}`, paid: 'Mark as paid', withdraw: 'Withdraw this invoice?' }[dlg]} onClose={() => setDlg(null)}
          footer={<><button className="btn ghost" onClick={() => setDlg(null)}>Cancel</button>
            <button className={'btn ' + (dlg === 'reject' || dlg === 'withdraw' ? 'danger' : 'primary')} disabled={busy || (dlg === 'reject' && !comment.trim())} onClick={act}>
              {{ approve: 'Approve', reject: 'Send back', paid: 'Mark paid', withdraw: 'Withdraw' }[dlg]}</button></>}>
          {dlg === 'approve' && <><p>{inv.payee?.full_name} · {monthName(inv.month)} · <b>{money(inv.total, inv.currency)}</b></p>
            <label className="form-grid one">Comment (optional)<textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></label></>}
          {dlg === 'reject' && <label className="form-grid one">What needs to change? (required – {inv.payee?.full_name?.split(' ')[0]} will see this)
            <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} autoFocus placeholder="e.g. Please attach the travel bill and correct the amount" /></label>}
          {dlg === 'paid' && <div className="form-grid">
            <label>Paid on<input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></label>
            <label>Reference (UTR / NEFT no.)<input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" /></label>
            <p className="muted xsmall span2">Also marks the {monthName(inv.month)} payout as paid in Salaries.</p></div>}
          {dlg === 'withdraw' && <p>You can raise it again before the end of the month.</p>}
        </Modal>
      )}
    </div>
  );
}
