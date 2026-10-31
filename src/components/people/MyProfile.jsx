import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase.js';
import { Icon, Avatar, Empty, useToast } from '../ui.jsx';
import { StatusPill } from '../finance/charts.jsx';
import { fmtDate, fmtINR } from '../../finance.js';
import { money } from '../../invoicePdf.js';
import { downloadPayeeInvoice } from '../../payeeInvoicePdf.js';
import { ProfileForm, RaiseInvoice, PayInvoiceViewer, PinvPill, usePayWindow, profileGaps, maskAcct, monthName, nameOf } from './shared.jsx';

const RUN = { pending: ['Pending', 'warning'], paid: ['Paid', 'good'], on_hold: ['On hold', 'neutral'] };

export async function openOfferLetter(path, toast, download = false) {
  const { data, error } = await supabase.storage.from('hr-docs').createSignedUrl(path, 300, download ? { download: true } : undefined);
  if (error) return toast(error.message, 'err');
  window.open(data.signedUrl, '_blank', 'noopener');
}

export default function MyProfile({ ctx, openId, onOpened }) {
  const toast = useToast();
  const me = ctx.me;
  const w = usePayWindow();
  const [pp, setPp] = useState(undefined);
  const [emp, setEmp] = useState(null);
  const [runs, setRuns] = useState([]);
  const [invs, setInvs] = useState([]);
  const [editing, setEditing] = useState(false);
  const [raise, setRaise] = useState(null); // {existing}
  const [open, setOpen] = useState(null);

  async function load() {
    const [p, e, i] = await Promise.all([
      supabase.from('people_profiles').select('*').eq('user_id', me.id).maybeSingle(),
      supabase.from('pay_employees').select('*').eq('profile_id', me.id).neq('status', 'exited').order('join_date', { ascending: false }).limit(1),
      supabase.from('pay_invoices').select('*').eq('user_id', me.id).order('month', { ascending: false }),
    ]);
    setPp(p.data || null);
    const em = e.data?.[0] || null;
    setEmp(em);
    setInvs(i.data || []);
    if (em) {
      const r = await supabase.from('pay_runs').select('*').eq('employee_id', em.id).order('month', { ascending: false }).limit(12);
      setRuns(r.data || []);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => {
    if (openId && invs.length) { const x = invs.find((i) => i.id === openId); if (x) setOpen(x); onOpened?.(); }
  }, [openId, invs]); // eslint-disable-line

  if (pp === undefined) return <div className="page"><div className="pad"><div className="spinner" /></div></div>;

  const gaps = profileGaps(pp);
  const cur = w && invs.find((i) => i.month === w.month);
  const canRaise = w && (cur ? !['approved', 'paid'].includes(cur.status) && cur.status !== 'submitted' && (w.open || cur.status === 'rejected') : w.open);
  const displayName = pp?.full_name || me.full_name || me.email;

  return (
    <div className="page">
      <header className="page-head">
        <div className="profile-head">
          <Avatar name={displayName} size={48} />
          <div><h1>{displayName}</h1><p className="muted">{[pp?.designation, me.email].filter(Boolean).join(' · ')}</p></div>
        </div>
        <div className="head-actions"><button className="btn ghost" onClick={() => setEditing(true)}><Icon name="edit" /> Edit details</button></div>
      </header>

      {gaps.length > 0 && (
        <div className="action-banner warn" role="status" style={{ margin: '0 0 16px' }}>
          <Icon name="user" /><span><b>Complete your profile.</b> Add your {gaps.join(', ')} so you can raise your monthly invoice.</span>
          <button className="btn small primary" onClick={() => setEditing(true)}>Add details</button>
        </div>
      )}

      {/* ---- this month's invoice ---- */}
      <section className="card month-card">
        <div className="month-card-main">
          <div>
            <span className="eyebrow">Monthly invoice · {w ? monthName(w.month) : '…'}</span>
            {cur ? (
              <h3>{cur.invoice_number} · {money(cur.total, cur.currency)} <PinvPill status={cur.status} /></h3>
            ) : <h3>{w?.open ? 'Ready to raise' : 'Not open yet'}</h3>}
            <p className="muted small">
              {cur?.status === 'rejected' ? <span className="danger">Sent back: {cur.decision_comment}</span>
                : cur?.status === 'submitted' ? 'Waiting for finance@chiplabs.tech or prashant@chiplabs.tech to approve it.'
                : cur?.status === 'approved' ? `Approved by ${nameOf(ctx.profiles, cur.decided_by)} · you can download it.`
                : cur?.status === 'paid' ? `Paid on ${fmtDate(cur.paid_on)}.`
                : w?.open ? `You can raise it until ${fmtDate(w.closes)}.`
                : w ? `You can raise invoices from the 25th to the end of each month. This month: ${fmtDate(w.opens)} – ${fmtDate(w.closes)}.` : ''}
            </p>
          </div>
          <div className="row-gap">
            {cur && <button className="btn ghost" onClick={() => setOpen(cur)}>View</button>}
            {cur && ['approved', 'paid'].includes(cur.status) && <button className="btn" onClick={() => downloadPayeeInvoice(cur, { email: me.email, approvedBy: nameOf(ctx.profiles, cur.decided_by) })}><Icon name="download" /> Download</button>}
            {cur?.status === 'submitted' && <button className="btn ghost" onClick={() => setRaise({ existing: cur })}><Icon name="edit" /> Edit</button>}
            {canRaise && <button className="btn primary" disabled={gaps.length > 0} onClick={() => setRaise({ existing: cur || null })}>
              <Icon name="plus" /> {cur ? 'Edit & resubmit' : `Raise ${w ? monthName(w.month).split(' ')[0] : ''} invoice`}</button>}
          </div>
        </div>
        <MonthStrip w={w} />
      </section>

      <div className="profile-grid">
        {/* ---- details ---- */}
        <section className="card">
          <div className="card-head"><h3>Details</h3><button className="link-btn" onClick={() => setEditing(true)}>Edit</button></div>
          <dl className="kv">
            <dt>Full name</dt><dd>{pp?.full_name || <Missing />}</dd>
            <dt>Designation</dt><dd>{pp?.designation || <Missing soft />}</dd>
            <dt>Starting date</dt><dd>{pp?.start_date ? fmtDate(pp.start_date) : <Missing soft />}</dd>
            <dt>Phone</dt><dd>{pp?.phone || <Missing soft />}</dd>
            <dt>Address</dt><dd className="pre">{pp?.address || <Missing soft />}</dd>
            <dt>PAN</dt><dd>{pp?.pan || <Missing soft />}</dd>
          </dl>
        </section>

        <section className="card">
          <div className="card-head"><h3>Bank account</h3><button className="link-btn" onClick={() => setEditing(true)}>Edit</button></div>
          <dl className="kv">
            <dt>Account holder</dt><dd>{pp?.bank_account_name || pp?.full_name || <Missing />}</dd>
            <dt>Bank</dt><dd>{pp?.bank_name || <Missing soft />}{pp?.bank_branch ? `, ${pp.bank_branch}` : ''}</dd>
            <dt>Account no.</dt><dd className="mono">{pp?.bank_account_no ? maskAcct(pp.bank_account_no) : <Missing />}</dd>
            <dt>IFSC</dt><dd className="mono">{pp?.bank_ifsc || <Missing />}</dd>
          </dl>
          <p className="muted xsmall" style={{ marginTop: 10 }}>Visible to you, Finance and admins only.</p>
        </section>

        <section className="card">
          <div className="card-head"><h3>Offer letter</h3></div>
          {pp?.offer_letter_path ? (
            <div className="doc-row">
              <span className="doc-ico"><Icon name="file" size={20} /></span>
              <div className="grow"><b>{pp.offer_letter_name || 'Offer letter'}</b><div className="muted xsmall">Uploaded {fmtDate(String(pp.offer_letter_uploaded_at).slice(0, 10))}{pp.offer_letter_uploaded_by ? ` by ${nameOf(ctx.profiles, pp.offer_letter_uploaded_by)}` : ''}</div></div>
              <button className="btn small ghost" onClick={() => openOfferLetter(pp.offer_letter_path, toast)}>View</button>
              <button className="btn small" onClick={() => openOfferLetter(pp.offer_letter_path, toast, true)}><Icon name="download" /></button>
            </div>
          ) : <p className="muted small">Not uploaded yet. An admin will add your offer letter here.</p>}
        </section>

        <section className="card">
          <div className="card-head"><h3>Salary</h3>{emp && <span className="muted small">Set by Finance</span>}</div>
          {emp ? (
            <>
              <div className="mini-stats">
                <div><span>Monthly</span><b>{fmtINR(emp.monthly_gross)}</b></div>
                <div><span>Annual CTC</span><b>{fmtINR(emp.annual_ctc || emp.monthly_gross * 12)}</b></div>
                <div><span>Pay day</span><b>{emp.pay_day ? `${emp.pay_day}${['th', 'st', 'nd', 'rd'][(emp.pay_day % 10 > 3 || [11, 12, 13].includes(emp.pay_day)) ? 0 : emp.pay_day % 10]}` : '—'}</b></div>
              </div>
              {runs.length > 0 && (
                <table className="table compact" style={{ marginTop: 10 }}>
                  <thead><tr><th scope="col">Month</th><th scope="col" className="num">Net</th><th scope="col">Status</th></tr></thead>
                  <tbody>{runs.map((r) => <tr key={r.id}><td>{monthName(r.month)}</td><td className="num">{fmtINR(r.net)}</td><td><StatusPill tone={RUN[r.status]?.[1]}>{RUN[r.status]?.[0]}</StatusPill>{r.paid_on && <div className="muted xsmall">{fmtDate(r.paid_on)}</div>}</td></tr>)}</tbody>
                </table>
              )}
            </>
          ) : <p className="muted small">No salary record yet. Finance links it to your login under Salaries.</p>}
        </section>
      </div>

      {/* ---- all invoices ---- */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>My invoices</h3><span className="muted small">{invs.length} total</span></div>
        {invs.length === 0 ? <Empty icon="receipt" title="No invoices yet">Your monthly invoices will appear here once you raise them.</Empty> : (
          <div className="table-wrap flat">
            <table className="table">
              <thead><tr><th scope="col">Invoice</th><th scope="col">Period</th><th scope="col" className="num">Amount</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {invs.map((i) => (
                  <tr key={i.id} className="clickable" onClick={() => setOpen(i)}>
                    <td><b>{i.invoice_number}</b><div className="muted xsmall">Submitted {fmtDate(String(i.submitted_at).slice(0, 10))}</div></td>
                    <td>{monthName(i.month)}</td>
                    <td className="num"><b>{money(i.total, i.currency)}</b></td>
                    <td><PinvPill status={i.status} short /></td>
                    <td className="row-actions">
                      <button className="icon-btn" title="Download PDF" aria-label={`Download ${i.invoice_number}`} onClick={(e) => { e.stopPropagation(); downloadPayeeInvoice(i, { email: me.email, approvedBy: i.decided_by ? nameOf(ctx.profiles, i.decided_by) : '' }); }}><Icon name="download" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && <ProfileForm userId={me.id} initial={pp} fallbackName={me.full_name} onClose={() => setEditing(false)} onSaved={load} title="Edit my details" />}
      {raise && <RaiseInvoice existing={raise.existing} salary={emp} window={w} profile={pp} onClose={() => setRaise(null)} onDone={() => { load(); setOpen(null); }} />}
      {open && <PayInvoiceViewer ctx={ctx} inv={open} onClose={() => setOpen(null)} onChanged={load} onEdit={(x) => { setOpen(null); setRaise({ existing: x }); }} />}
    </div>
  );
}

const Missing = ({ soft }) => <span className={soft ? 'muted' : 'danger'}>{soft ? '—' : 'Missing'}</span>;

// little calendar strip: days 1..end, 25..end highlighted
function MonthStrip({ w }) {
  if (!w) return null;
  const end = Number(w.closes.slice(8, 10));
  const today = Number(w.today.slice(8, 10));
  return (
    <div className="month-strip" aria-hidden="true">
      {Array.from({ length: end }, (_, i) => i + 1).map((d) => (
        <i key={d} className={(d >= 25 ? 'win' : '') + (d === today ? ' today' : '')} title={String(d)} />
      ))}
      <span className="muted xsmall">Window: 25th – {end}th</span>
    </div>
  );
}
