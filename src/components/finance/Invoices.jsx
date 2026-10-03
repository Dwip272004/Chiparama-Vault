import React, { useMemo, useState } from 'react';
import { supabase } from '../../supabase.js';
import { Icon, Empty, Modal, useToast } from '../ui.jsx';
import { StatusPill } from './charts.jsx';
import InvoiceForm from './InvoiceForm.jsx';
import { INV_STATUS, fmtINR, fmtMoney, fmtDate, relDays, invStatus, toCSV, download } from '../../finance.js';

export default function Invoices({ ctx }) {
  const toast = useToast();
  const { invoices, isFinance } = ctx.fin;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [month, setMonth] = useState('');
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);

  const months = useMemo(() => [...new Set(invoices.map((i) => i.invoice_date.slice(0, 7)))].sort().reverse(), [invoices]);
  const rows = invoices.filter((i) => {
    if (status && invStatus(i) !== status) return false;
    if (month && !i.invoice_date.startsWith(month)) return false;
    const t = q.trim().toLowerCase();
    return !t || [i.platform, i.invoice_number, i.category, i.reference].some((v) => v && v.toLowerCase().includes(t));
  });
  const sum = (st) => rows.filter((i) => (st ? st.includes(invStatus(i)) : true)).reduce((s, i) => s + Number(i.total_inr), 0);
  const counts = Object.fromEntries(Object.keys(INV_STATUS).map((k) => [k, invoices.filter((i) => invStatus(i) === k).length]));

  async function openFile(i) {
    const { data, error } = await supabase.storage.from('invoices').createSignedUrl(i.file_path, 120);
    if (error) return toast(error.message, 'err');
    window.open(data.signedUrl, '_blank');
  }
  async function markPaid(i) {
    const { error } = await supabase.from('inv_invoices').update({ status: 'paid', paid_on: new Date().toISOString().slice(0, 10) }).eq('id', i.id);
    if (error) return toast(error.message, 'err');
    toast('Marked as paid'); ctx.fin.reload();
  }
  async function doDelete() {
    const { error } = await supabase.from('inv_invoices').delete().eq('id', del.id);
    if (error) return toast(error.message, 'err');
    toast('Invoice deleted'); setDel(null); ctx.fin.reload();
  }
  function exportCSV() {
    download('invoices.csv', toCSV(rows, [
      { label: 'Invoice #', get: (i) => i.invoice_number }, { label: 'Platform', get: (i) => i.platform }, { label: 'Category', get: (i) => i.category },
      { label: 'Invoice date', get: (i) => i.invoice_date }, { label: 'Period from', get: (i) => i.period_start }, { label: 'Period to', get: (i) => i.period_end },
      { label: 'Due date', get: (i) => i.due_date }, { label: 'Amount', get: (i) => i.amount }, { label: 'Tax', get: (i) => i.tax_amount },
      { label: 'Total', get: (i) => i.total }, { label: 'Currency', get: (i) => i.currency }, { label: 'Total INR', get: (i) => i.total_inr },
      { label: 'Status', get: (i) => invStatus(i) }, { label: 'Paid on', get: (i) => i.paid_on }, { label: 'Payment method', get: (i) => i.payment_method }, { label: 'Reference', get: (i) => i.reference },
    ]));
  }

  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>Invoices</h1><p className="muted">{isFinance ? 'Record and update invoices. Leadership sees these instantly.' : 'Read-only. Invoices are managed by Finance.'}</p></div>
        <div className="head-actions">
          <button className="btn ghost" onClick={exportCSV}><Icon name="download" /> CSV</button>
          {isFinance && <button className="btn primary" onClick={() => setForm('new')}><Icon name="plus" /> Record invoice</button>}
        </div>
      </header>

      <div className="chips status-chips">
        <button className={'chip' + (!status ? ' on' : '')} onClick={() => setStatus('')}>All <em>{invoices.length}</em></button>
        {Object.entries(INV_STATUS).map(([k, v]) => counts[k] ? <button key={k} className={'chip' + (status === k ? ' on' : '')} onClick={() => setStatus(k)}>{v.label} <em>{counts[k]}</em></button> : null)}
      </div>
      <div className="toolbar">
        <div className="filters">
          <div className="search"><Icon name="search" /><input placeholder="Search vendor, invoice #, ref…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="narrow">
            <option value="">All months</option>
            {months.map((m) => <option key={m} value={m}>{new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</option>)}
          </select>
        </div>
        <span className="muted small">Paid <b className="ink">{fmtINR(sum(['paid']))}</b> · Unpaid <b className="ink">{fmtINR(sum(['pending', 'overdue']))}</b></span>
      </div>

      {rows.length === 0 ? <Empty icon="receipt" title={invoices.length ? 'Nothing matches these filters' : 'No invoices yet'} /> : (
        <div className="table-wrap">
          <table className="table fin">
            <thead><tr><th>Invoice</th><th>Date</th><th>Service period</th><th>Due</th><th className="num">Amount</th><th className="num">Tax</th><th className="num">Total (INR)</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((i) => {
                const st = invStatus(i);
                return (
                  <tr key={i.id}>
                    <td><b>{i.platform}</b><div className="muted xsmall">{i.invoice_number ? '#' + i.invoice_number : 'No number'} · {i.category}</div></td>
                    <td className="small nowrap">{fmtDate(i.invoice_date)}</td>
                    <td className="small">{i.period_start ? (i.period_end ? `${fmtDate(i.period_start)} – ${fmtDate(i.period_end)}` : `from ${fmtDate(i.period_start)}`) : '—'}</td>
                    <td className="small nowrap">{i.due_date ? <>{fmtDate(i.due_date)}{['pending', 'overdue'].includes(st) && <div className={'xsmall ' + (st === 'overdue' ? 'danger' : 'muted')}>{relDays(i.due_date)}</div>}</> : '—'}</td>
                    <td className="num">{fmtMoney(i.amount, i.currency)}</td>
                    <td className="num muted">{Number(i.tax_amount) ? fmtMoney(i.tax_amount, i.currency) : '—'}</td>
                    <td className="num"><b>{fmtINR(i.total_inr)}</b></td>
                    <td><StatusPill tone={INV_STATUS[st].tone}>{INV_STATUS[st].label}</StatusPill>{i.paid_on && <div className="muted xsmall">{fmtDate(i.paid_on)}</div>}</td>
                    <td className="row-actions">
                      {i.file_path && <button className="icon-btn" title="Open invoice file" onClick={() => openFile(i)}><Icon name="file" /></button>}
                      {isFinance && <>
                        {['pending', 'overdue', 'draft'].includes(st) && <button className="btn small ghost" onClick={() => markPaid(i)}>Mark paid</button>}
                        <button className="icon-btn" title="Edit" onClick={() => setForm(i)}><Icon name="edit" /></button>
                        <button className="icon-btn danger" title="Delete" onClick={() => setDel(i)}><Icon name="trash" /></button>
                      </>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={6}>{rows.length} invoice{rows.length === 1 ? '' : 's'}</td><td className="num"><b>{fmtINR(sum())}</b></td><td colSpan={2} /></tr></tfoot>
          </table>
        </div>
      )}

      {form && <InvoiceForm ctx={ctx} invoice={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {del && (
        <Modal title="Delete invoice?" onClose={() => setDel(null)}
          footer={<><button className="btn ghost" onClick={() => setDel(null)}>Cancel</button><button className="btn danger" onClick={doDelete}>Delete</button></>}>
          <p>Delete the <b>{del.platform}</b> invoice {del.invoice_number ? '#' + del.invoice_number : ''}? Consider setting it to <i>Cancelled</i> to keep a record.</p>
        </Modal>
      )}
    </div>
  );
}
