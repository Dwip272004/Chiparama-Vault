import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase.js';
import { Icon, Avatar, Empty } from '../ui.jsx';
import { fmtDate, toCSV, download } from '../../finance.js';
import { money } from '../../invoicePdf.js';
import { downloadPayeeInvoice } from '../../payeeInvoicePdf.js';
import { PayInvoiceViewer, PinvPill, monthName, nameOf, usePayWindow } from './shared.jsx';

export default function MonthlyInvoices({ ctx, openId, onOpened }) {
  const w = usePayWindow();
  const [rows, setRows] = useState(null);
  const [pps, setPps] = useState([]);
  const [tab, setTab] = useState('submitted');
  const [month, setMonth] = useState('');
  const [open, setOpen] = useState(null);

  async function load() {
    const [i, p] = await Promise.all([
      supabase.from('pay_invoices').select('*').order('submitted_at', { ascending: false }),
      supabase.from('people_profiles').select('user_id, full_name'),
    ]);
    setRows(i.data || []); setPps(p.data || []);
    ctx.people?.reload?.();
  }
  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => {
    if (openId && rows) { const x = rows.find((r) => r.id === openId); if (x) setOpen(x); onOpened?.(); }
  }, [openId, rows]); // eslint-disable-line

  const all = rows || [];
  const months = [...new Set(all.map((r) => r.month))].sort().reverse();
  const inMonth = all.filter((r) => !month || r.month === month);
  const lists = {
    submitted: inMonth.filter((r) => r.status === 'submitted'),
    approved: inMonth.filter((r) => r.status === 'approved'),
    paid: inMonth.filter((r) => r.status === 'paid'),
    all: inMonth,
  };
  const shown = lists[tab];
  const curMonth = w?.month;
  const thisMonth = all.filter((r) => r.month === curMonth && r.status !== 'withdrawn');
  const notRaised = curMonth ? ctx.profiles.filter((p) => p.active && pps.some((x) => x.user_id === p.id) && !thisMonth.some((r) => r.user_id === p.id)) : [];
  const sum = (arr) => arr.reduce((s, r) => s + Number(r.total), 0);
  const ext = (r) => ({ email: ctx.profiles.find((p) => p.id === r.user_id)?.email, approvedBy: r.decided_by ? nameOf(ctx.profiles, r.decided_by) : '' });

  function exportCSV() {
    download(`monthly-invoices${month ? '-' + month.slice(0, 7) : ''}.csv`, toCSV(shown, [
      { label: 'Invoice', get: (r) => r.invoice_number }, { label: 'Name', get: (r) => r.payee?.full_name }, { label: 'Month', get: (r) => r.month.slice(0, 7) },
      { label: 'Amount', get: (r) => r.total }, { label: 'Status', get: (r) => r.status }, { label: 'Account holder', get: (r) => r.payee?.bank_account_name || r.payee?.full_name },
      { label: 'Account no', get: (r) => r.payee?.bank_account_no }, { label: 'IFSC', get: (r) => r.payee?.bank_ifsc }, { label: 'Bank', get: (r) => r.payee?.bank_name },
      { label: 'Paid on', get: (r) => r.paid_on }, { label: 'Reference', get: (r) => r.payment_ref },
    ]));
  }

  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>Monthly invoices</h1><p className="muted">Raised by the team between the 25th and month-end. Approved by finance@ or prashant@; approval adds the payout to Salaries.</p></div>
        <div className="head-actions">
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" style={{ width: 'auto' }}>
            <option value="">All months</option>{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
          <button className="btn ghost" onClick={exportCSV}><Icon name="download" /> CSV</button>
        </div>
      </header>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat"><span className="stat-label">Waiting for approval</span><b className="stat-value">{lists.submitted.length}</b><span className="stat-sub">{money(sum(lists.submitted))}</span></div>
        <div className="stat"><span className="stat-label">Approved, to pay</span><b className="stat-value">{lists.approved.length}</b><span className="stat-sub">{money(sum(lists.approved))}</span></div>
        <div className="stat"><span className="stat-label">Paid</span><b className="stat-value">{lists.paid.length}</b><span className="stat-sub">{money(sum(lists.paid))}</span></div>
        <div className="stat"><span className="stat-label">Not raised for {curMonth ? monthName(curMonth).split(' ')[0] : '…'}</span><b className="stat-value">{notRaised.length}</b>
          <span className="stat-sub" title={notRaised.map((p) => p.full_name || p.email).join(', ')}>{notRaised.length ? notRaised.slice(0, 2).map((p) => (p.full_name || p.email).split(' ')[0]).join(', ') + (notRaised.length > 2 ? ` +${notRaised.length - 2}` : '') : w?.open ? 'Everyone has raised it' : 'Window opens on the 25th'}</span></div>
      </div>

      <div className="seg" role="tablist" aria-label="Status" style={{ marginBottom: 14 }}>
        {[['submitted', 'Waiting'], ['approved', 'Approved'], ['paid', 'Paid'], ['all', 'All']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} ({lists[k].length})</button>
        ))}
      </div>

      {rows === null ? <div className="pad"><div className="spinner" /></div> : shown.length === 0 ? (
        <Empty icon="receipt" title={tab === 'submitted' ? 'Nothing waiting for approval' : 'No invoices here'}>{tab === 'submitted' ? 'New invoices show up here from the 25th of each month.' : null}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col">Person</th><th scope="col">Invoice</th><th scope="col">Period</th><th scope="col" className="num">Amount</th><th scope="col">Submitted</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                  <td><div className="cell-user"><Avatar name={r.payee?.full_name || '?'} size={28} /><div><b>{r.payee?.full_name}</b><div className="muted xsmall">{r.payee?.designation || ''}</div></div></div></td>
                  <td className="small">{r.invoice_number}{(r.items || []).some((x) => x.kind === 'extra') && <div className="muted xsmall">incl. extra items</div>}</td>
                  <td className="small">{monthName(r.month)}</td>
                  <td className="num"><b>{money(r.total, r.currency)}</b></td>
                  <td className="small">{fmtDate(String(r.submitted_at).slice(0, 10))}</td>
                  <td><PinvPill status={r.status} short />{r.status === 'rejected' && <div className="muted xsmall">{r.decision_comment?.slice(0, 40)}</div>}</td>
                  <td className="row-actions">
                    <button className="icon-btn" title="Download PDF" aria-label={`Download ${r.invoice_number}`} onClick={(e) => { e.stopPropagation(); downloadPayeeInvoice(r, ext(r)); }}><Icon name="download" /></button>
                    <button className="btn small ghost" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>{r.status === 'submitted' && ctx.people?.isApprover && r.user_id !== ctx.me.id ? 'Review' : r.status === 'approved' && ctx.fin.isFinance ? 'Pay' : 'Open'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <PayInvoiceViewer ctx={ctx} inv={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
