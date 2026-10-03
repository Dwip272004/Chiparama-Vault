import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase.js';
import { Icon, Empty, useToast } from '../ui.jsx';
import { StatusPill } from '../finance/charts.jsx';
import PdfPages from '../finance/PdfPages.jsx';
import { buildInvoicePdf, money } from '../../invoicePdf.js';
import { fmtDate, fmtINR, fmtMoney } from '../../finance.js';
import { timeAgo } from '../../lib.js';
import { FLOW_LABELS, ApprovalTimeline, ApprovalActions, approverNames, isMyStage } from './shared.jsx';

const STATE = {
  in_review: { label: 'In review', tone: 'info' }, returned: { label: 'Sent back', tone: 'warning' },
  approved: { label: 'Approved', tone: 'good' }, withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};

export default function Approvals({ ctx, openId: requestedId, onOpened }) {
  const [tab, setTab] = useState('mine');
  const [rows, setRows] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [flow, setFlow] = useState('');

  async function load() {
    const { data } = await supabase.from('apr_requests').select('*').order('updated_at', { ascending: false }).limit(300);
    setRows(data || []);
  }
  useEffect(() => { load(); }, [ctx.apr.queue]); // eslint-disable-line
  useEffect(() => {
    if (requestedId && rows) { setOpenId(requestedId); onOpened?.(); }
  }, [requestedId, rows]); // eslint-disable-line

  const mine = (rows || []).filter((r) => r.state === 'in_review' && isMyStage(r.stages[r.current_index], ctx.me));
  const lists = {
    mine,
    open: (rows || []).filter((r) => ['in_review', 'returned'].includes(r.state)),
    done: (rows || []).filter((r) => ['approved', 'withdrawn'].includes(r.state)),
  };
  const shown = lists[tab].filter((r) => !flow || r.flow === flow);
  const name = (id) => { const p = ctx.profiles.find((x) => x.id === id); return p ? p.full_name || p.email : '—'; };
  const open = (rows || []).find((r) => r.id === openId);

  if (open) return <ApprovalDetail ctx={ctx} req={open} onClose={() => setOpenId(null)} onChanged={() => { load(); ctx.apr.reload(); ctx.fin?.reload?.(); }} />;

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Approvals</h1><p>Invoices moving through the approval stages. Rejections need a comment and go back one stage.</p></div>
        <select value={flow} onChange={(e) => setFlow(e.target.value)} aria-label="Invoice type" style={{ width: 'auto' }}>
          <option value="">Client & vendor invoices</option><option value="client">Client invoices</option><option value="vendor">Vendor invoices</option>
        </select>
      </header>
      <div className="seg" role="tablist" aria-label="Approval lists" style={{ marginBottom: 14 }}>
        <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>Waiting for me{mine.length ? ` (${mine.length})` : ''}</button>
        <button role="tab" aria-selected={tab === 'open'} className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>In progress ({lists.open.length})</button>
        <button role="tab" aria-selected={tab === 'done'} className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>Completed</button>
      </div>

      {rows === null ? <div className="pad"><div className="spinner" /></div> : shown.length === 0 ? (
        <Empty icon="shield" title={tab === 'mine' ? 'Nothing waiting for you' : 'No invoices here'}>{tab === 'mine' ? 'You’ll see invoices here when it’s your turn to approve.' : null}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col">Invoice</th><th scope="col">Type</th><th scope="col" className="num">Amount</th><th scope="col">Stage</th><th scope="col">Submitted</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
            <tbody>
              {shown.map((r) => {
                const st = r.stages[r.current_index];
                return (
                  <tr key={r.id} className="clickable" onClick={() => setOpenId(r.id)}>
                    <td><b>{r.invoice_label}</b>{r.last_action === 'rejected' && r.state === 'in_review' && <div className="xsmall warn-text">Returned for reconsideration</div>}</td>
                    <td className="small">{FLOW_LABELS[r.flow]}</td>
                    <td className="num"><b>{r.amount_label}</b></td>
                    <td className="small">{r.state === 'in_review' && st ? <>{r.current_index + 1}/{r.stages.length} · {st.name}<div className="muted xsmall">{approverNames(st, ctx.profiles).join(', ')}</div></> : r.state === 'returned' ? 'With Finance' : '—'}</td>
                    <td className="small">{name(r.submitted_by)}<div className="muted xsmall">{timeAgo(r.submitted_at)}</div></td>
                    <td><StatusPill tone={STATE[r.state].tone}>{STATE[r.state].label}</StatusPill></td>
                    <td className="row-actions"><button className="btn small ghost" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}>{isMyStage(st, ctx.me) && r.state === 'in_review' ? 'Review' : 'Open'}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ApprovalDetail({ ctx, req, onClose, onChanged }) {
  const toast = useToast();
  const [inv, setInv] = useState(null);
  const [company, setCompany] = useState(null);
  const [events, setEvents] = useState([]);
  const [cur, setCur] = useState(req);
  const [fileUrl, setFileUrl] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      const [r, ev] = await Promise.all([
        supabase.from('apr_requests').select('*').eq('id', req.id).maybeSingle(),
        supabase.from('apr_events').select('*').eq('request_id', req.id).order('id'),
      ]);
      if (r.data) setCur(r.data);
      setEvents(ev.data || []);
      if (req.flow === 'client') {
        const [i, c] = await Promise.all([
          supabase.from('inv_client_invoices').select('*').eq('id', req.invoice_id).maybeSingle(),
          supabase.from('inv_company').select('*').eq('id', 1).maybeSingle(),
        ]);
        setInv(i.data); setCompany(c.data || {});
      } else {
        const i = await supabase.from('inv_invoices').select('*').eq('id', req.invoice_id).maybeSingle();
        setInv(i.data);
        if (i.data?.file_path) {
          const s = await supabase.storage.from('invoices').createSignedUrl(i.data.file_path, 900);
          setFileUrl(s.data?.signedUrl || null);
        }
      }
    })();
  }, [req.id, req.flow, req.invoice_id, tick]);

  const blob = useMemo(() => (req.flow === 'client' && inv && company ? buildInvoicePdf(inv, company).output('blob') : null), [inv, company, req.flow]);
  const done = () => { setTick((t) => t + 1); onChanged?.(); };

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`Approval for ${req.invoice_label}`}>
      <div className="viewer-bar">
        <button className="btn small ghost" onClick={onClose} autoFocus><Icon name="x" /> Close</button>
        <div className="grow viewer-title"><b>{req.invoice_label}</b><span>{FLOW_LABELS[req.flow]} · {req.amount_label}</span></div>
        <StatusPill tone={STATE[cur.state].tone}>{STATE[cur.state].label}</StatusPill>
      </div>
      <div className="viewer-body">
        <div className="viewer-doc">
          {!inv ? <div className="pad"><div className="spinner" /></div> : req.flow === 'client'
            ? <PdfPages blob={blob} title={`Invoice ${inv.invoice_number}`} />
            : <VendorSummary inv={inv} fileUrl={fileUrl} />}
        </div>
        <aside className="viewer-side wide" aria-label="Approval">
          <ApprovalActions flow={req.flow} invoiceId={req.invoice_id} approvalStatus={inv?.approval_status} req={cur} me={ctx.me}
            isFinance={!!ctx.fin?.isFinance} stagesConfigured onDone={done} />
          <h4>Approval stages</h4>
          <ApprovalTimeline req={cur} events={events} profiles={ctx.profiles} me={ctx.me} />
        </aside>
      </div>
    </div>
  );
}

function VendorSummary({ inv, fileUrl }) {
  const isImg = /\.(png|jpe?g|webp|gif)$/i.test(inv.file_path || '');
  return (
    <div className="vendor-sum">
      <div className="card">
        <div className="card-head"><h3>{inv.platform}</h3><span className="muted small">{inv.invoice_number ? '#' + inv.invoice_number : 'No invoice number'}</span></div>
        <div className="dl"><div className="k">Category</div><div className="v">{inv.category}</div></div>
        <div className="dl"><div className="k">Invoice date</div><div className="v">{fmtDate(inv.invoice_date)}</div></div>
        <div className="dl"><div className="k">Due date</div><div className="v">{fmtDate(inv.due_date)}</div></div>
        {inv.period_start && <div className="dl"><div className="k">Service period</div><div className="v">{fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}</div></div>}
        <div className="dl"><div className="k">Amount</div><div className="v">{fmtMoney(inv.amount, inv.currency)}{Number(inv.tax_amount) ? ` + tax ${fmtMoney(inv.tax_amount, inv.currency)}` : ''}</div></div>
        <div className="dl"><div className="k">Total</div><div className="v"><b>{fmtMoney(inv.total, inv.currency)}</b>{inv.currency !== 'INR' && <span className="muted"> ≈ {fmtINR(inv.total_inr)}</span>}</div></div>
        {inv.payment_method && <div className="dl"><div className="k">Payment method</div><div className="v">{inv.payment_method}</div></div>}
        {inv.notes && <div className="dl"><div className="k">Notes</div><div className="v">{inv.notes}</div></div>}
      </div>
      {fileUrl ? (isImg ? <img src={fileUrl} alt={`Invoice from ${inv.platform}`} className="vendor-file" /> : <iframe src={fileUrl} title={`Invoice file from ${inv.platform}`} className="vendor-file" />)
        : <p className="muted small" style={{ marginTop: 12 }}>No invoice file attached.</p>}
      {fileUrl && <p className="muted small" style={{ marginTop: 8 }}><a href={fileUrl} target="_blank" rel="noreferrer">Open attached file in a new tab</a></p>}
    </div>
  );
}
