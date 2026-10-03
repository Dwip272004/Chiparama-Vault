import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabase.js';
import { Icon, Empty, Modal, SearchBox, useToast } from '../ui.jsx';
import { StatusPill } from './charts.jsx';
import PdfPages from './PdfPages.jsx';
import { ApprovalPill, ApprovalTimeline, ApprovalActions, useApproval } from '../approvals/shared.jsx';
import { fmtDate, relDays, daysUntil, toCSV, download } from '../../finance.js';
import { INVOICE_CURRENCIES, computeTotals, money, num, downloadInvoicePdf, previewInvoicePdf, buildInvoicePdf, invoiceFileName } from '../../invoicePdf.js';

const STATUS = {
  draft: { label: 'Draft', tone: 'neutral' }, sent: { label: 'Sent', tone: 'info' }, partially_paid: { label: 'Part paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'good' }, cancelled: { label: 'Cancelled', tone: 'neutral' }, overdue: { label: 'Overdue', tone: 'critical' },
};
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + Number(n || 0)); return x.toISOString().slice(0, 10); };
export const outStatus = (inv) => {
  const bal = Number(inv.total) - Number(inv.amount_paid || 0);
  if (['sent', 'partially_paid'].includes(inv.status) && bal > 0 && inv.due_date && daysUntil(inv.due_date) < 0) return 'overdue';
  return inv.status;
};

export default function ClientInvoices({ ctx }) {
  const toast = useToast();
  const { clientInvoices: invoices, company, isFinance } = ctx.fin;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [cur, setCur] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | invoice | { copyOf }
  const [companyOpen, setCompanyOpen] = useState(false);
  const [del, setDel] = useState(null);
  const [viewId, setViewId] = useState(null);
  const [openReqs, setOpenReqs] = useState({});
  useEffect(() => {
    supabase.from('apr_requests').select('*').eq('flow', 'client').in('state', ['in_review', 'returned'])
      .then(({ data }) => setOpenReqs(Object.fromEntries((data || []).map((r) => [r.invoice_id, r]))));
  }, [invoices, ctx.apr.queue]);

  const rows = invoices.filter((i) => {
    if (status && outStatus(i) !== status) return false;
    if (cur && i.currency !== cur) return false;
    const s = q.trim().toLowerCase();
    return !s || [i.invoice_number, i.client_name, i.po_number, i.service_period].some((v) => v && v.toLowerCase().includes(s));
  });

  // outstanding & invoiced per currency – never mixed or converted
  const byCur = useMemo(() => {
    const m = {};
    invoices.filter((i) => i.status !== 'cancelled' && i.status !== 'draft').forEach((i) => {
      const r = (m[i.currency] ||= { invoiced: 0, outstanding: 0, overdue: 0 });
      const bal = Number(i.total) - Number(i.amount_paid || 0);
      r.invoiced += Number(i.total); r.outstanding += Math.max(bal, 0);
      if (outStatus(i) === 'overdue') r.overdue += bal;
    });
    return Object.entries(m).sort((a, b) => b[1].outstanding - a[1].outstanding);
  }, [invoices]);
  const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, invoices.filter((i) => outStatus(i) === k).length]));

  async function markPaid(i) {
    const { error } = await supabase.from('inv_client_invoices').update({ status: 'paid', amount_paid: i.total, paid_on: today() }).eq('id', i.id);
    if (error) return toast(error.message, 'err');
    toast(`${i.invoice_number} marked paid`); ctx.fin.reload();
  }
  async function doDelete() {
    const { error } = await supabase.from('inv_client_invoices').delete().eq('id', del.id);
    if (error) return toast(error.message, 'err');
    toast('Invoice deleted'); setDel(null); ctx.fin.reload();
  }
  function exportCSV() {
    download('client-invoices.csv', toCSV(rows, [
      { label: 'Invoice no.', get: (i) => i.invoice_number }, { label: 'Client', get: (i) => i.client_name }, { label: 'Issue date', get: (i) => i.issue_date },
      { label: 'Due date', get: (i) => i.due_date }, { label: 'Currency', get: (i) => i.currency }, { label: 'Total', get: (i) => i.total },
      { label: 'Paid', get: (i) => i.amount_paid }, { label: 'Balance', get: (i) => (Number(i.total) - Number(i.amount_paid || 0)).toFixed(2) },
      { label: 'Status', get: (i) => STATUS[outStatus(i)].label }, { label: 'PO', get: (i) => i.po_number }, { label: 'Service period', get: (i) => i.service_period },
    ]));
  }

  if (editing) return <InvoiceEditor ctx={ctx} initial={editing} onClose={() => setEditing(null)} />;

  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>Client invoices</h1><p>Create, save and download invoices for clients in any currency.</p></div>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => setCompanyOpen(true)}><Icon name="file" /> Company details</button>
          <button className="btn ghost" onClick={exportCSV}><Icon name="download" /> CSV</button>
          {isFinance && <button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" /> New invoice</button>}
        </div>
      </header>

      {byCur.length > 0 && (
        <div className="stats" style={{ gridTemplateColumns: `repeat(${Math.min(byCur.length, 4)}, 1fr)` }}>
          {byCur.slice(0, 4).map(([c, r]) => (
            <div key={c} className="stat">
              <span className="stat-label">{c} outstanding</span>
              <b className="stat-value">{c} {num(r.outstanding, c)}</b>
              <span className="stat-sub">{r.overdue > 0 ? <span className="danger">{num(r.overdue, c)} overdue · </span> : null}{num(r.invoiced, c)} invoiced</span>
            </div>
          ))}
        </div>
      )}

      <div className="chips status-chips" role="group" aria-label="Filter by status">
        <button className={'chip' + (!status ? ' on' : '')} aria-pressed={!status} onClick={() => setStatus('')}>All <em>{invoices.length}</em></button>
        {Object.entries(STATUS).map(([k, v]) => counts[k] ? <button key={k} className={'chip' + (status === k ? ' on' : '')} aria-pressed={status === k} onClick={() => setStatus(k)}>{v.label} <em>{counts[k]}</em></button> : null)}
      </div>
      <div className="toolbar">
        <div className="filters">
          <SearchBox value={q} onChange={setQ} placeholder="Search invoice no., client, PO" label="Search client invoices" />
          <select value={cur} onChange={(e) => setCur(e.target.value)} aria-label="Filter by currency">
            <option value="">All currencies</option>
            {Object.keys(INVOICE_CURRENCIES).map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty icon="receipt" title={invoices.length ? 'No invoices match' : 'No client invoices yet'}>
          {invoices.length ? 'Try clearing the filters.' : isFinance ? 'Check Company details first, then create your first invoice.' : 'Finance creates invoices here.'}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="table fin">
            <thead><tr>
              <th scope="col">Invoice</th><th scope="col">Client</th><th scope="col">Issued</th><th scope="col">Due</th>
              <th scope="col" className="num">Total / balance</th><th scope="col">Status</th><th scope="col">Approval</th><th scope="col"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {rows.map((i) => {
                const st = outStatus(i); const bal = Number(i.total) - Number(i.amount_paid || 0);
                return (
                  <tr key={i.id} className="clickable" onClick={() => setViewId(i.id)}>
                    <td className="nowrap"><b className="mono" style={{ fontSize: 13 }}>{i.invoice_number}</b>{i.po_number && <div className="muted xsmall">PO {i.po_number}</div>}</td>
                    <td style={{ minWidth: 170 }}>{i.client_name}<div className="muted xsmall">{i.service_period || i.client_country || ''}</div></td>
                    <td className="small nowrap">{fmtDate(i.issue_date)}</td>
                    <td className="small nowrap">{fmtDate(i.due_date)}{['sent', 'partially_paid', 'overdue'].includes(st) && i.due_date && <div className={'xsmall ' + (st === 'overdue' ? 'danger' : 'muted')}>{relDays(i.due_date)}</div>}</td>
                    <td className="num"><b>{money(i.total, i.currency)}</b>{bal > 0 && st !== 'cancelled' && bal !== Number(i.total) ? <div className="xsmall muted">Balance {money(bal, i.currency)}</div> : bal <= 0 && st !== 'cancelled' ? <div className="xsmall muted">Fully paid</div> : null}</td>
                    <td><StatusPill tone={STATUS[st].tone}>{STATUS[st].label}</StatusPill></td>
                    <td><ApprovalPill status={i.approval_status} req={openReqs[i.id]} /></td>
                    <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn small ghost" onClick={() => setViewId(i.id)} aria-label={`View ${i.invoice_number}`}><Icon name="eye" /> View</button>
                      <button className="icon-btn" title="Download PDF" onClick={() => downloadInvoicePdf(i, company)} aria-label={`Download PDF of ${i.invoice_number}`}><Icon name="download" /></button>
                      {isFinance && <>
                        <button className="icon-btn" title="Edit" aria-label={`Edit ${i.invoice_number}`} onClick={() => setEditing(i)}><Icon name="edit" /></button>
                      </>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewId && invoices.find((x) => x.id === viewId) && (
        <InvoiceViewer ctx={ctx} invoice={invoices.find((x) => x.id === viewId)} onClose={() => setViewId(null)}
          onEdit={isFinance ? (inv) => { setViewId(null); setEditing(inv); } : null} onMarkPaid={isFinance ? markPaid : null}
          onDuplicate={isFinance ? (inv) => { setViewId(null); setEditing({ copyOf: inv }); } : null} onDelete={isFinance ? (inv) => { setViewId(null); setDel(inv); } : null} />
      )}
      {companyOpen && <CompanyDetails ctx={ctx} onClose={() => setCompanyOpen(false)} />}
      {del && (
        <Modal title={`Delete ${del.invoice_number}?`} onClose={() => setDel(null)}
          footer={<><button className="btn ghost" onClick={() => setDel(null)}>Cancel</button><button className="btn danger" onClick={doDelete}>Delete</button></>}>
          <p>This permanently removes the invoice. To keep a record for the client, set its status to <b>Cancelled</b> instead. Invoice numbers are not reused.</p>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- editor
const blankItem = (sac = '') => ({ sac, description: '', details: '', qty: 1, unit: '', rate: '' });

function InvoiceEditor({ ctx, initial, onClose }) {
  const toast = useToast();
  const { company, clients } = ctx.fin;
  const src = initial === 'new' ? null : initial.copyOf || initial;
  const isNew = initial === 'new' || !!initial.copyOf;
  const issue = isNew ? today() : src.issue_date;
  const dueDays = company?.default_due_days ?? 15;
  const [f, setF] = useState(() => ({
    client_id: src?.client_id || '', client_name: src?.client_name || '', client_contact: src?.client_contact || '', client_email: src?.client_email || '',
    client_address: src?.client_address || '', client_country: src?.client_country || '', client_tax_id: src?.client_tax_id || '',
    issue_date: issue, due_date: isNew ? addDays(issue, dueDays) : src.due_date || '',
    currency: src?.currency || 'INR', service_period: isNew ? '' : src.service_period || '', po_number: isNew ? '' : src.po_number || '',
    items: src?.items?.length ? src.items.map((x) => ({ ...blankItem(), ...x })) : [blankItem(company?.default_sac || '')],
    discount: Number(src?.discount) ? String(src.discount) : '', tax_label: src?.tax_label || '', tax_rate: Number(src?.tax_rate) ? String(Number(src.tax_rate)) : '',
    notes: src?.notes || '', terms: src?.terms ?? company?.default_terms ?? '',
    tnc: src?.tnc || 'none', export_lut: !!src?.export_lut,
    status: isNew ? 'draft' : src.status, amount_paid: isNew ? '' : (Number(src.amount_paid) ? String(src.amount_paid) : ''), paid_on: isNew ? '' : src.paid_on || '',
  }));
  const [saveClient, setSaveClient] = useState(true);
  const [showTax, setShowTax] = useState(!!Number(src?.tax_rate));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setItem = (i, k, v) => setF((p) => ({ ...p, items: p.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const calc = computeTotals({ ...f, tax_rate: showTax ? f.tax_rate : 0, amount_paid: f.status === 'paid' ? 0 : f.amount_paid });
  const invNo = isNew ? null : src.invoice_number;
  const needsApproval = ctx.apr.stages.some((x) => x.flow === 'client') && (isNew || src.approval_status !== 'approved') && !['sent', 'partially_paid', 'paid'].includes(src?.status && !isNew ? src.status : '');
  const [nextNo, setNextNo] = useState(null);
  useEffect(() => {
    if (!isNew || !f.issue_date) return;
    supabase.rpc('inv_next_invoice_number', { p_issue_date: f.issue_date }).then(({ data }) => setNextNo(data || null));
  }, [isNew, f.issue_date]);
  const foreign = f.currency !== 'INR' || (f.client_country && !/^india$/i.test(f.client_country.trim()));
  const tncText = (f.tnc === 'domestic' ? company?.terms_domestic : f.tnc === 'international' ? company?.terms_international : '') || '';
  const previewData = () => ({ ...f, tax_rate: showTax ? f.tax_rate : 0, tax_label: f.tax_label || 'Tax', invoice_number: invNo || nextNo || 'DRAFT', amount_paid: f.status === 'paid' ? calc.total : f.amount_paid,
    items: f.items.filter((it) => it.description.trim() || Number(it.rate)) });

  function pickClient(id) {
    const c = clients.find((x) => x.id === id);
    if (!c) return setF((p) => ({ ...p, client_id: '' }));
    setF((p) => ({ ...p, client_id: c.id, client_name: c.name, client_contact: c.contact_name || '', client_email: c.email || '', client_address: c.address || '',
      client_country: c.country || '', client_tax_id: c.tax_id || '', currency: isNew ? c.default_currency || p.currency : p.currency }));
  }

  async function save(after) {
    if (!f.client_name.trim()) return toast('Add the client name', 'err');
    const items = f.items.filter((it) => it.description.trim() || Number(it.rate)).map((it) => ({
      sac: (it.sac || '').trim(), description: it.description.trim(), details: (it.details || '').trim(), qty: Number(it.qty) || 0, unit: (it.unit || '').trim(), rate: Number(it.rate) || 0 }));
    if (!items.length) return toast('Add at least one line item', 'err');
    if (items.some((it) => !it.description)) return toast('Every line needs a description', 'err');
    setBusy(true);
    let client_id = f.client_id || null;
    if (saveClient) {
      const c = { name: f.client_name.trim(), contact_name: f.client_contact || null, email: f.client_email || null, address: f.client_address || null,
        country: f.client_country || null, tax_id: f.client_tax_id || null, default_currency: f.currency };
      if (client_id) await supabase.from('inv_clients').update(c).eq('id', client_id);
      else {
        const ins = await supabase.from('inv_clients').insert(c).select('id').maybeSingle();
        if (ins.data) client_id = ins.data.id;
        else {
          const ex = await supabase.from('inv_clients').select('id').ilike('name', c.name).maybeSingle();
          client_id = ex.data?.id || null;
          if (client_id) await supabase.from('inv_clients').update(c).eq('id', client_id);
        }
      }
    }
    const row = {
      client_id, client_name: f.client_name.trim(), client_contact: f.client_contact || null, client_email: f.client_email || null, client_address: f.client_address || null,
      client_country: f.client_country || null, client_tax_id: f.client_tax_id || null, issue_date: f.issue_date, due_date: f.due_date || null, currency: f.currency,
      service_period: f.service_period || null, po_number: f.po_number || null, items, discount: Number(f.discount) || 0,
      tax_label: showTax ? f.tax_label || 'Tax' : null, tax_rate: showTax ? Number(f.tax_rate) || 0 : 0,
      notes: f.notes || null, terms: f.terms || null, status: f.status,
      tnc: f.tnc, export_lut: f.export_lut,
      amount_paid: f.status === 'paid' ? calc.total : f.status === 'partially_paid' ? Number(f.amount_paid) || 0 : 0,
      paid_on: ['paid', 'partially_paid'].includes(f.status) ? f.paid_on || today() : null,
    };
    const res = isNew
      ? await supabase.from('inv_client_invoices').insert(row).select('*').single()
      : await supabase.from('inv_client_invoices').update(row).eq('id', src.id).select('*').single();
    setBusy(false);
    if (res.error) return toast(res.error.message, 'err');
    toast(isNew ? `Invoice ${res.data.invoice_number} saved` : 'Invoice updated');
    if (after === 'download') downloadInvoicePdf(res.data, company);
    await ctx.fin.reload();
    onClose();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <button className="link-btn" onClick={onClose} style={{ marginBottom: 6 }}>← Client invoices</button>
          <h1>{isNew ? (initial.copyOf ? `New invoice (copy of ${initial.copyOf.invoice_number})` : 'New invoice') : `Edit ${invNo}`}</h1>
          <p>{isNew ? <>Will be numbered <b className="mono">{nextNo || 'CL/<FY>/<serial>'}</b> when saved (CL / financial year / serial).</> : 'Changes are saved to the same invoice number.'}</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => previewInvoicePdf(previewData(), company)}><Icon name="eye" /> Preview PDF</button>
          <button className="btn ghost" disabled={busy} onClick={() => save()}>Save</button>
          <button className="btn primary" disabled={busy} onClick={() => save('download')}><Icon name="download" /> Save &amp; download PDF</button>
        </div>
      </header>

      <div className="editor-grid">
        <section className="card">
          <div className="card-head"><h3>Bill to</h3>
            {clients.length > 0 && (
              <select value={f.client_id} onChange={(e) => pickClient(e.target.value)} aria-label="Choose a saved client" style={{ width: 'auto' }}>
                <option value="">Saved clients…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
          <div className="form-grid">
            <label className="span2">Client name<input value={f.client_name} onChange={set('client_name')} placeholder="Registered company name" autoFocus /></label>
            <label>Contact person<input value={f.client_contact} onChange={set('client_contact')} /></label>
            <label>Billing email<input type="email" value={f.client_email} onChange={set('client_email')} /></label>
            <label className="span2">Address<textarea rows={2} value={f.client_address} onChange={set('client_address')} /></label>
            <label>Country<input value={f.client_country} onChange={set('client_country')} placeholder="e.g. United States" /></label>
            <label>Tax / registration ID<input value={f.client_tax_id} onChange={set('client_tax_id')} placeholder="Optional (VAT, EIN, GSTIN…)" /></label>
            <label className="check span2"><input type="checkbox" checked={saveClient} onChange={(e) => setSaveClient(e.target.checked)} /> Save these details to the client list</label>
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h3>Invoice details</h3>{invNo && <span className="mono muted">{invNo}</span>}</div>
          <div className="form-grid">
            <label>Issue date<input type="date" value={f.issue_date} onChange={set('issue_date')} /></label>
            <label><span className="label-row">Due date <a onClick={() => setF((p) => ({ ...p, due_date: addDays(p.issue_date, dueDays) }))}>Issue date + {dueDays} days</a></span>
              <input type="date" value={f.due_date} onChange={set('due_date')} /></label>
            <label>Currency
              <select value={f.currency} onChange={set('currency')}>{Object.entries(INVOICE_CURRENCIES).map(([k, v]) => <option key={k} value={k}>{k} – {v.name}</option>)}</select>
            </label>
            <label>Status
              <select value={f.status} onChange={set('status')}>
                <option value="draft">Draft</option>
                <option value="sent" disabled={needsApproval}>Sent{needsApproval ? ' (needs approval)' : ''}</option>
                <option value="partially_paid" disabled={needsApproval}>Partially paid{needsApproval ? ' (needs approval)' : ''}</option>
                <option value="paid" disabled={needsApproval}>Paid{needsApproval ? ' (needs approval)' : ''}</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label>Service period<input value={f.service_period} onChange={set('service_period')} placeholder="e.g. 01–31 Oct 2026" /></label>
            <label>PO / reference<input value={f.po_number} onChange={set('po_number')} placeholder="Optional" /></label>
            {f.status === 'partially_paid' && <label>Amount received ({f.currency})<input type="number" min="0" step="0.01" value={f.amount_paid} onChange={set('amount_paid')} /></label>}
            {['paid', 'partially_paid'].includes(f.status) && <label>Payment date<input type="date" value={f.paid_on} onChange={set('paid_on')} /></label>}
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><h3>Line items</h3><span className="muted small">Amounts in {f.currency}</span></div>
        <div className="items">
          <div className="items-head" aria-hidden="true"><span>SAC</span><span>Description</span><span>Qty</span><span>Unit</span><span>Rate</span><span className="r">Amount</span><span /></div>
          {f.items.map((it, i) => (
            <div key={i} className="items-row">
              <input value={it.sac || ''} onChange={(e) => setItem(i, 'sac', e.target.value)} placeholder="Optional" maxLength={8} inputMode="numeric" aria-label={`Line ${i + 1} SAC code (optional)`} />
              <div className="items-desc">
                <input value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} placeholder="Service or deliverable" aria-label={`Line ${i + 1} description`} />
                <input className="sub" value={it.details} onChange={(e) => setItem(i, 'details', e.target.value)} placeholder="Details (optional) – e.g. 160 hours · Sep 2026 · resource name" aria-label={`Line ${i + 1} details`} />
              </div>
              <input type="number" min="0" step="0.01" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} aria-label={`Line ${i + 1} quantity`} />
              <input value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} placeholder="Hours" list="units" aria-label={`Line ${i + 1} unit`} />
              <input type="number" min="0" step="0.01" value={it.rate} onChange={(e) => setItem(i, 'rate', e.target.value)} placeholder="0.00" aria-label={`Line ${i + 1} rate`} />
              <span className="r mono">{num(calc.lines[i], f.currency)}</span>
              <button className="icon-btn danger" disabled={f.items.length === 1} onClick={() => setF((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }))} aria-label={`Remove line ${i + 1}`} title="Remove line"><Icon name="trash" /></button>
            </div>
          ))}
          <datalist id="units">{['Hours', 'Days', 'Months', 'Placement', 'Resource', 'Project', 'Fixed fee', 'Licence'].map((u) => <option key={u} value={u} />)}</datalist>
          <button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => setF((p) => ({ ...p, items: [...p.items, blankItem(p.items[p.items.length - 1]?.sac || company?.default_sac || '')] }))}><Icon name="plus" /> Add line</button>
        </div>

        <div className="totals-grid">
          <div className="form-grid one">
            <label>Notes to client<textarea rows={3} value={f.notes} onChange={set('notes')} placeholder="Optional – shown on the invoice" /></label>
            <label>Payment terms<textarea rows={2} value={f.terms} onChange={set('terms')} /></label>
          </div>
          <div className="totals">
            <div><span>Subtotal</span><b>{num(calc.subtotal, f.currency)}</b></div>
            <div><span>Discount</span><input type="number" min="0" step="0.01" value={f.discount} onChange={set('discount')} placeholder="0.00" aria-label="Discount amount" /></div>
            {showTax ? (
              <div className="tax-row">
                <input value={f.tax_label} onChange={set('tax_label')} placeholder="Tax name (VAT, GST…)" aria-label="Tax name" />
                <input type="number" min="0" step="0.01" value={f.tax_rate} onChange={set('tax_rate')} placeholder="%" aria-label="Tax rate percent" />
                <b>{num(calc.tax, f.currency)}</b>
                <button className="icon-btn" aria-label="Remove tax line" title="Remove tax line" onClick={() => { setShowTax(false); setF((p) => ({ ...p, tax_rate: '' })); }}><Icon name="x" /></button>
              </div>
            ) : <div><button className="link-btn" onClick={() => setShowTax(true)}>+ Add a tax line (optional)</button><span /></div>}
            <div className="grand"><span>Total</span><b>{money(calc.total, f.currency)}</b></div>
            {f.status === 'partially_paid' && calc.paid > 0 && <div><span>Balance due</span><b>{money(calc.balance, f.currency)}</b></div>}
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><h3>Terms &amp; compliance</h3><span className="muted small">Optional</span></div>
        <div className="form-grid three">
          <label>Terms &amp; Conditions page
            <select value={f.tnc} onChange={set('tnc')}>
              <option value="none">Don't attach</option>
              <option value="domestic">Attach – domestic (India) terms</option>
              <option value="international">Attach – international terms</option>
            </select>
          </label>
          <label className="check" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={f.export_lut} onChange={(e) => setF((p) => ({ ...p, export_lut: e.target.checked }))} disabled={!foreign && !f.export_lut} />
            Foreign client – zero-rated under GST LUT
          </label>
        </div>
        {foreign && f.tnc === 'none' && <p className="muted small" style={{ marginTop: 10 }}>Foreign client: you can attach the international terms (bank charges, FX, withholding tax). <button className="link-btn" onClick={() => setF((p) => ({ ...p, tnc: 'international' }))}>Attach them</button></p>}
        {f.tnc !== 'none' && !tncText && <div className="note err" style={{ marginTop: 10 }}>The {f.tnc} terms template is empty. Add it under Company details, or the page won't be printed.</div>}
        {f.tnc !== 'none' && tncText.includes('[') && <div className="note err" style={{ marginTop: 10 }}>The {f.tnc} terms still contain [placeholders]. Fill them in under Company details before sending this invoice.</div>}
        {f.export_lut && <p className="muted small" style={{ marginTop: 10 }}>Prints the GST export declaration (CGST Rule 46): <i>"Supply meant for export under bond or letter of undertaking without payment of integrated tax"</i>, the LUT reference and "Place of supply: Outside India".</p>}
        {f.export_lut && !company?.lut_arn && <div className="note err" style={{ marginTop: 10 }}>No LUT ARN saved yet. Add it under Company details so it prints on the invoice.</div>}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- company details
function CompanyDetails({ ctx, onClose }) {
  const toast = useToast();
  const { company, isFinance } = ctx.fin;
  const [f, setF] = useState({ ...company });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const field = (k, label, opts = {}) => (
    <label className={opts.span ? 'span2' : ''}>{label}
      {opts.area
        ? <textarea rows={opts.rows || 2} value={f[k] || ''} onChange={set(k)} disabled={!isFinance} />
        : <input type={opts.type || 'text'} value={f[k] ?? ''} onChange={set(k)} disabled={!isFinance} placeholder={opts.ph} />}
    </label>
  );
  async function save() {
    setBusy(true);
    const { id, updated_at, updated_by, ...rest } = f; // eslint-disable-line no-unused-vars
    rest.default_due_days = Number(rest.default_due_days) || 0;
    const { error } = await supabase.from('inv_company').update(rest).eq('id', 1);
    setBusy(false);
    if (error) return toast(error.message, 'err');
    toast('Company details saved'); ctx.fin.reload(); onClose();
  }
  return (
    <Modal title="Company details" onClose={onClose} wide
      footer={isFinance ? <><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Save</button></> : <button className="btn primary" onClick={onClose}>Close</button>}>
      <p className="muted small" style={{ marginBottom: 14 }}>Printed on every invoice PDF. {isFinance ? 'Changes apply to every PDF downloaded from now on, including older invoices.' : 'Only Finance can edit these.'}</p>
      <div className="form-grid">
        {field('legal_name', 'Legal name')}{field('brand_name', 'Brand name (logo text)')}
        {field('address', 'Registered address', { area: true, span: true })}
        {field('email', 'Billing email')}{field('phone', 'Phone')}
        {field('website', 'Website')}{field('tagline', 'Tagline')}
        {field('gstin', 'GSTIN (optional)')}{field('pan', 'PAN (optional)')}
        {field('cin', 'CIN (optional)')}<label>Invoice numbering<input value="CL / financial year / serial  (e.g. CL/26-27/001)" disabled /></label>
      </div>
      <div className="section-box">
        <div className="section-title"><Icon name="card" /> Bank details</div>
        <div className="form-grid">
          {field('bank_account_name', 'Account name')}{field('bank_name', 'Bank')}
          {field('bank_branch', 'Branch')}{field('bank_account_no', 'Account number')}
          {field('bank_ifsc', 'IFSC')}{field('bank_swift', 'SWIFT / BIC (international)')}
          {field('intl_payment_note', 'Note shown on foreign-currency invoices', { area: true, span: true })}
        </div>
      </div>
      <div className="section-box">
        <div className="section-title"><Icon name="shield" /> Compliance</div>
        <p className="muted small">Used only when an invoice is marked "Foreign client – zero-rated under GST LUT", plus the signature block printed on every invoice.</p>
        <div className="form-grid">
          {field('lut_arn', 'LUT ARN (GST)', { ph: 'From your LUT acknowledgement' })}{field('lut_fy', 'LUT valid for FY', { ph: 'e.g. 2026-27' })}
          {field('default_sac', 'Default SAC for new lines', { ph: 'Optional – confirm with your CA' })}<span />
          {field('signatory_name', 'Authorised signatory name')}{field('signatory_title', 'Designation')}
        </div>
      </div>
      <div className="section-box">
        <div className="section-title"><Icon name="file" /> Terms &amp; Conditions templates</div>
        <p className="muted small">Optional page attached per invoice. Separate clauses with a blank line and start each with "1. Heading." Replace every [bracketed] value before use, and have your CA or lawyer review the wording.</p>
        <div className="form-grid one">
          {field('terms_domestic', 'Domestic clients (India)', { area: true, rows: 9 })}
          {(f.terms_domestic || '').includes('[') && <div className="note err">Domestic terms still have [placeholders] to fill in.</div>}
          {field('terms_international', 'International clients', { area: true, rows: 11 })}
          {(f.terms_international || '').includes('[') && <div className="note err">International terms still have [placeholders] to fill in.</div>}
        </div>
      </div>
      <div className="section-box">
        <div className="section-title"><Icon name="file" /> Defaults</div>
        <div className="form-grid">
          {field('default_due_days', 'Payment due (days)', { type: 'number' })}{field('footer_note', 'Closing line')}
          {field('default_terms', 'Default payment terms', { area: true, span: true })}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- read-only viewer
function InvoiceViewer({ ctx, invoice: i, onClose, onEdit, onMarkPaid, onDuplicate, onDelete }) {
  const { company } = ctx.fin;
  const [aprTick, setAprTick] = useState(0);
  const apr = useApproval('client', i.id, `${aprTick}-${i.approval_status}`);
  const stagesConfigured = ctx.apr.stages.some((s) => s.flow === 'client');
  const [url, setUrl] = useState(null);
  const [blob, setBlob] = useState(null);
  const frame = useRef(null);
  const closeBtn = useRef(null);
  useEffect(() => {
    const b = buildInvoicePdf(i, company).output('blob');
    const u = URL.createObjectURL(b);
    setBlob(b); setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [i, company]);
  useEffect(() => {
    const prev = document.activeElement; closeBtn.current?.focus();
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); prev?.focus?.(); };
  }, [onClose]);
  const st = outStatus(i);
  const t = computeTotals(i);
  const bal = Number(i.total) - Number(i.amount_paid || 0);
  const by = ctx.profiles.find((p) => p.id === (i.updated_by || i.created_by));
  const row = (k, v) => v ? <div className="vw-row"><span>{k}</span><b>{v}</b></div> : null;

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`Invoice ${i.invoice_number}`}>
      <div className="viewer-bar">
        <button ref={closeBtn} className="btn small ghost" onClick={onClose}><Icon name="x" /> Close</button>
        <div className="grow viewer-title"><b className="mono">{i.invoice_number}</b><span>{i.client_name}</span></div>
        <button className="btn small ghost" onClick={() => frame.current?.contentWindow?.print()} disabled={!url}>Print</button>
        <a className="btn small ghost" href={url || '#'} target="_blank" rel="noreferrer"><Icon name="external" /> Open in new tab</a>
        <a className="btn small primary" href={url || '#'} download={invoiceFileName(i)}><Icon name="download" /> Download PDF</a>
      </div>
      <div className="viewer-body">
        <div className="viewer-doc">
          <PdfPages blob={blob} title={`Invoice ${i.invoice_number}`} />
          {url && <iframe ref={frame} title="Print copy" src={url} className="print-frame" tabIndex={-1} aria-hidden="true" />}
        </div>
        <aside className="viewer-side" aria-label="Invoice summary">
          <div className="vw-status"><StatusPill tone={STATUS[st].tone}>{STATUS[st].label}</StatusPill>
            {st === 'overdue' && <span className="danger small">{relDays(i.due_date)}</span>}</div>
          <div className="vw-amount"><span>Total</span><b>{money(i.total, i.currency)}</b></div>
          {bal > 0 && st !== 'cancelled' && <div className="vw-amount sub"><span>Balance due</span><b>{money(bal, i.currency)}</b></div>}
          <h4>Details</h4>
          {row('Client', i.client_name)}
          {row('Country', i.client_country)}
          {row('Issued', fmtDate(i.issue_date))}
          {row('Due', fmtDate(i.due_date))}
          {row('Currency', `${i.currency} – ${INVOICE_CURRENCIES[i.currency]?.name || ''}`)}
          {row('Service period', i.service_period)}
          {row('PO / reference', i.po_number)}
          {row('Line items', String((i.items || []).length))}
          {t.discount ? row('Discount', num(t.discount, i.currency)) : null}
          {Number(i.tax_rate) ? row(i.tax_label || 'Tax', `${Number(i.tax_rate)}%`) : null}
          {row('Amount received', Number(i.amount_paid) ? money(i.amount_paid, i.currency) : null)}
          {row('Paid on', i.paid_on ? fmtDate(i.paid_on) : null)}
          {row('T&C page', i.tnc && i.tnc !== 'none' ? (i.tnc === 'international' ? 'International' : 'Domestic') : null)}
          {row('GST export (LUT)', i.export_lut ? 'Yes' : null)}
          {(i.updated_at || i.created_at) && <p className="muted xsmall" style={{ marginTop: 14 }}>Last updated {fmtDate(String(i.updated_at || i.created_at).slice(0, 10))}{by ? ` by ${by.full_name || by.email}` : ''}</p>}
          {(onEdit || onMarkPaid) && (
            <div className="vw-actions">
              {onMarkPaid && ['sent', 'partially_paid'].includes(i.status) && <button className="btn ghost" onClick={() => onMarkPaid(i)}><Icon name="check" /> Mark paid</button>}
              {onEdit && <button className="btn ghost" onClick={() => onEdit(i)}><Icon name="edit" /> Edit invoice</button>}
              {onDuplicate && <button className="btn ghost" onClick={() => onDuplicate(i)}><Icon name="copy" /> Duplicate</button>}
              {onDelete && <button className="btn ghost danger-text" onClick={() => onDelete(i)}><Icon name="trash" /> Delete</button>}
            </div>
          )}
          <h4>Approval <ApprovalPill status={i.approval_status} req={apr.req && ['in_review', 'returned'].includes(apr.req.state) ? apr.req : null} /></h4>
          <ApprovalActions flow="client" invoiceId={i.id} approvalStatus={i.approval_status} req={apr.req} me={ctx.me} isFinance={!!ctx.fin.isFinance}
            stagesConfigured={stagesConfigured} onDone={() => { setAprTick((t) => t + 1); ctx.fin.reload(); ctx.apr.reload(); }} />
          <ApprovalTimeline req={apr.req} events={apr.events} profiles={ctx.profiles} me={ctx.me} />
        </aside>
      </div>
    </div>
  );
}
