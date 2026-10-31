import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase.js';
import { Icon, Avatar, Drawer, Modal, SearchBox, Empty, useToast } from '../ui.jsx';
import { fmtDate, fmtINR } from '../../finance.js';
import { money } from '../../invoicePdf.js';
import { downloadPayeeInvoice } from '../../payeeInvoicePdf.js';
import { ProfileForm, PayInvoiceViewer, PinvPill, profileGaps, maskAcct, monthName, nameOf, usePayWindow } from './shared.jsx';
import { openOfferLetter } from './MyProfile.jsx';

export default function People({ ctx }) {
  const w = usePayWindow();
  const [pps, setPps] = useState(null);
  const [invs, setInvs] = useState([]);
  const [emps, setEmps] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState(null);

  async function load() {
    const [p, i, e] = await Promise.all([
      supabase.from('people_profiles').select('*'),
      supabase.from('pay_invoices').select('*').order('month', { ascending: false }),
      ctx.fin.canViewPayroll ? supabase.from('pay_employees').select('id, profile_id, monthly_gross, status') : Promise.resolve({ data: [] }),
    ]);
    setPps(p.data || []); setInvs(i.data || []); setEmps(e.data || []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  const rows = ctx.profiles.filter((p) => p.active).map((p) => {
    const pp = (pps || []).find((x) => x.user_id === p.id) || null;
    const curInv = w ? invs.find((i) => i.user_id === p.id && i.month === w.month) : null;
    return { p, pp, gaps: profileGaps(pp), curInv, emp: emps.find((e) => e.profile_id === p.id && e.status !== 'exited') };
  }).filter((r) => {
    if (filter === 'incomplete' && !r.gaps.length) return false;
    if (filter === 'nooffer' && r.pp?.offer_letter_path) return false;
    const t = q.trim().toLowerCase();
    return !t || [r.p.full_name, r.p.email, r.pp?.designation].some((v) => v && v.toLowerCase().includes(t));
  });

  const total = ctx.profiles.filter((p) => p.active).length;
  const complete = ctx.profiles.filter((p) => p.active && !profileGaps((pps || []).find((x) => x.user_id === p.id)).length).length;
  const offers = (pps || []).filter((x) => x.offer_letter_path).length;

  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>People</h1><p className="muted">Profiles, bank details and offer letters. People fill in their own details from My profile; you upload offer letters here.</p></div>
      </header>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat"><span className="stat-label">Profiles complete</span><b className="stat-value">{complete} / {total}</b><span className="stat-sub">Name, bank account and IFSC added</span></div>
        <div className="stat"><span className="stat-label">Offer letters uploaded</span><b className="stat-value">{offers} / {total}</b><span className="stat-sub">Stored privately</span></div>
        <div className="stat"><span className="stat-label">Invoices for {w ? monthName(w.month).split(' ')[0] : '…'}</span><b className="stat-value">{w ? invs.filter((i) => i.month === w.month && i.status !== 'withdrawn').length : '—'}</b><span className="stat-sub">{w?.open ? 'Window is open' : w ? `Opens ${fmtDate(w.opens)}` : ''}</span></div>
      </div>
      <div className="toolbar">
        <div className="filters">
          <SearchBox value={q} onChange={setQ} placeholder="Search name, email, designation" label="Search people" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="narrow" aria-label="Filter">
            <option value="">Everyone</option><option value="incomplete">Profile incomplete</option><option value="nooffer">No offer letter</option>
          </select>
        </div>
      </div>
      {pps === null ? <div className="pad"><div className="spinner" /></div> : rows.length === 0 ? <Empty icon="users" title="No one matches" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col">Person</th><th scope="col">Designation</th><th scope="col">Started</th><th scope="col">Bank details</th><th scope="col">Offer letter</th><th scope="col">{w ? monthName(w.month).split(' ')[0] : ''} invoice</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.p.id} className="clickable" onClick={() => setSel(r.p.id)}>
                  <td><div className="cell-user"><Avatar name={r.pp?.full_name || r.p.full_name || r.p.email} size={28} /><div><b>{r.pp?.full_name || r.p.full_name || '—'}</b><div className="muted xsmall">{r.p.email}</div></div></div></td>
                  <td className="small">{r.pp?.designation || <span className="muted">—</span>}</td>
                  <td className="small">{r.pp?.start_date ? fmtDate(r.pp.start_date) : <span className="muted">—</span>}</td>
                  <td className="small">{r.pp?.bank_account_no && r.pp?.bank_ifsc ? <span className="ok-text"><Icon name="check" size={13} /> {r.pp.bank_ifsc.slice(0, 4)} {maskAcct(r.pp.bank_account_no)}</span> : <span className="warn-text">Missing</span>}</td>
                  <td className="small">{r.pp?.offer_letter_path ? <span className="ok-text"><Icon name="check" size={13} /> Uploaded</span> : <span className="muted">Not uploaded</span>}</td>
                  <td>{r.curInv ? <PinvPill status={r.curInv.status} short /> : <span className="muted small">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sel && <PersonDrawer ctx={ctx} profile={ctx.profiles.find((p) => p.id === sel)} pp={(pps || []).find((x) => x.user_id === sel) || null}
        invs={invs.filter((i) => i.user_id === sel)} emp={emps.find((e) => e.profile_id === sel && e.status !== 'exited')} onClose={() => setSel(null)} reload={load} />}
    </div>
  );
}

function PersonDrawer({ ctx, profile, pp, invs, emp, onClose, reload }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [open, setOpen] = useState(null);
  const file = useRef(null);
  const name = pp?.full_name || profile.full_name || profile.email;

  async function upload(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast('Keep the file under 10 MB', 'err');
    if (!/\.(pdf|docx?|png|jpe?g)$/i.test(f.name)) return toast('Upload a PDF, Word file or image', 'err');
    setBusy(true);
    const safe = f.name.replace(/[^\w.-]+/g, '_');
    const path = `offer-letters/${profile.id}/${Date.now()}-${safe}`;
    const up = await supabase.storage.from('hr-docs').upload(path, f, { contentType: f.type || undefined });
    if (up.error) { setBusy(false); return toast(up.error.message, 'err'); }
    const old = pp?.offer_letter_path;
    const { error } = await supabase.from('people_profiles').upsert(
      { user_id: profile.id, full_name: pp?.full_name || profile.full_name || null, offer_letter_path: path, offer_letter_name: f.name }, { onConflict: 'user_id' });
    if (!error && old) await supabase.storage.from('hr-docs').remove([old]);
    setBusy(false);
    if (error) return toast(error.message, 'err');
    toast(old ? 'Offer letter replaced' : 'Offer letter uploaded'); reload();
  }
  async function removeLetter() {
    setBusy(true);
    const old = pp.offer_letter_path;
    const { error } = await supabase.from('people_profiles').update({ offer_letter_path: null, offer_letter_name: null }).eq('user_id', profile.id);
    if (!error) await supabase.storage.from('hr-docs').remove([old]);
    setBusy(false); setConfirmRemove(false);
    if (error) return toast(error.message, 'err');
    toast('Offer letter removed'); reload();
  }

  return (
    <Drawer title={name} header={<Avatar name={name} size={34} />} onClose={onClose}>
      <p className="muted small" style={{ marginTop: -6 }}>{[pp?.designation, profile.email].filter(Boolean).join(' · ')}</p>

      <div className="section-box">
        <div className="section-title"><Icon name="file" /> Offer letter</div>
        {pp?.offer_letter_path ? (
          <div className="doc-row">
            <span className="doc-ico"><Icon name="file" size={20} /></span>
            <div className="grow"><b>{pp.offer_letter_name}</b><div className="muted xsmall">Uploaded {fmtDate(String(pp.offer_letter_uploaded_at).slice(0, 10))}{pp.offer_letter_uploaded_by ? ` by ${nameOf(ctx.profiles, pp.offer_letter_uploaded_by)}` : ''}</div></div>
            <button className="btn small ghost" onClick={() => openOfferLetter(pp.offer_letter_path, toast)}>View</button>
          </div>
        ) : <p className="muted small">No offer letter yet. {name.split(' ')[0]} will see it on their profile once you upload it.</p>}
        <div className="row-gap" style={{ marginTop: 8 }}>
          <input ref={file} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" hidden onChange={upload} />
          <button className="btn small primary" disabled={busy} onClick={() => file.current?.click()}><Icon name="plus" /> {busy ? 'Uploading…' : pp?.offer_letter_path ? 'Replace' : 'Upload offer letter'}</button>
          {pp?.offer_letter_path && <button className="btn small ghost danger-text" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove</button>}
        </div>
      </div>

      <div className="section-box">
        <div className="section-title" style={{ justifyContent: 'space-between' }}><span className="row-gap"><Icon name="user" /> Details</span><button className="link-btn" onClick={() => setEditing(true)}>Edit</button></div>
        <dl className="kv">
          <dt>Full name</dt><dd>{pp?.full_name || '—'}</dd>
          <dt>Designation</dt><dd>{pp?.designation || '—'}</dd>
          <dt>Starting date</dt><dd>{pp?.start_date ? fmtDate(pp.start_date) : '—'}</dd>
          <dt>Phone</dt><dd>{pp?.phone || '—'}</dd>
          <dt>Address</dt><dd className="pre">{pp?.address || '—'}</dd>
          <dt>PAN</dt><dd>{pp?.pan || '—'}</dd>
          <dt>Bank</dt><dd>{pp?.bank_name || '—'}{pp?.bank_branch ? `, ${pp.bank_branch}` : ''}</dd>
          <dt>Account no.</dt><dd className="mono">{pp?.bank_account_no || <span className="warn-text">Missing</span>}</dd>
          <dt>IFSC</dt><dd className="mono">{pp?.bank_ifsc || <span className="warn-text">Missing</span>}</dd>
          {emp && <><dt>Monthly salary</dt><dd>{fmtINR(emp.monthly_gross)}</dd></>}
        </dl>
      </div>

      <div className="section-box">
        <div className="section-title"><Icon name="receipt" /> Monthly invoices</div>
        {invs.length === 0 ? <p className="muted small">None raised yet.</p> : (
          <table className="table compact">
            <tbody>{invs.map((i) => (
              <tr key={i.id} className="clickable" onClick={() => setOpen(i)}>
                <td><b>{i.invoice_number}</b><div className="muted xsmall">{monthName(i.month)}</div></td>
                <td className="num">{money(i.total, i.currency)}</td>
                <td><PinvPill status={i.status} short /></td>
                <td className="row-actions"><button className="icon-btn" aria-label="Download" onClick={(e) => { e.stopPropagation(); downloadPayeeInvoice(i, { email: profile.email, approvedBy: i.decided_by ? nameOf(ctx.profiles, i.decided_by) : '' }); }}><Icon name="download" /></button></td>
              </tr>))}</tbody>
          </table>
        )}
      </div>

      {editing && <ProfileForm userId={profile.id} initial={pp} fallbackName={profile.full_name} onClose={() => setEditing(false)} onSaved={reload} title={`Edit details · ${name}`} />}
      {confirmRemove && <Modal title="Remove offer letter?" onClose={() => setConfirmRemove(false)}
        footer={<><button className="btn ghost" onClick={() => setConfirmRemove(false)}>Cancel</button><button className="btn danger" onClick={removeLetter}>Remove</button></>}>
        <p>The file is deleted and {name.split(' ')[0]} will no longer see it.</p></Modal>}
      {open && <PayInvoiceViewer ctx={ctx} inv={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </Drawer>
  );
}
