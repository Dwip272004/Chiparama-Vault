import React, { useState } from 'react';
import { supabase } from '../../supabase.js';
import { Icon, Modal, Empty, Avatar, useToast } from '../ui.jsx';
import { ROLE_LABELS, FLOW_LABELS, approverNames } from './shared.jsx';

export default function ApprovalStages({ ctx }) {
  const toast = useToast();
  const [flow, setFlow] = useState('client');
  const [editing, setEditing] = useState(null); // 'new' | stage
  const [del, setDel] = useState(null);
  const stages = ctx.apr.stages.filter((s) => s.flow === flow).sort((a, b) => a.position - b.position);

  async function move(idx, dir) {
    const a = stages[idx], b = stages[idx + dir];
    if (!a || !b) return;
    const r1 = await supabase.from('apr_stages').update({ position: b.position, updated_at: new Date().toISOString() }).eq('id', a.id);
    const r2 = await supabase.from('apr_stages').update({ position: a.position, updated_at: new Date().toISOString() }).eq('id', b.id);
    if (r1.error || r2.error) return toast((r1.error || r2.error).message, 'err');
    ctx.apr.reload();
  }
  async function remove() {
    const { error } = await supabase.from('apr_stages').delete().eq('id', del.id);
    if (error) return toast(error.message, 'err');
    toast('Stage removed'); setDel(null); ctx.apr.reload();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Approval stages</h1><p>Decide who approves invoices, and in what order. Changes apply to invoices submitted from now on.</p></div>
        <div className="head-actions">
          <div className="seg" role="group" aria-label="Invoice type">
            <button className={flow === 'client' ? 'on' : ''} aria-pressed={flow === 'client'} onClick={() => setFlow('client')}>Client invoices</button>
            <button className={flow === 'vendor' ? 'on' : ''} aria-pressed={flow === 'vendor'} onClick={() => setFlow('vendor')}>Vendor invoices</button>
          </div>
          <button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" /> Add stage</button>
        </div>
      </header>

      <div className="flow-strip" aria-label="How approval works">
        <span className="fs-node">Finance submits</span>
        {stages.map((s, i) => <React.Fragment key={s.id}><Icon name="arrowRight" size={14} /><span className="fs-node stage">{i + 1}. {s.name}</span></React.Fragment>)}
        <Icon name="arrowRight" size={14} /><span className="fs-node ok">Approved{flow === 'client' ? ' → can be sent' : ' → can be paid'}</span>
      </div>
      <p className="muted small" style={{ margin: '-6px 0 16px' }}>
        If a stage rejects (a comment is required), the invoice goes back one stage for reconsideration. A rejection at stage 1 returns it to Finance to edit and resubmit.
        {stages.length === 0 && ' With no stages, invoices are approved as soon as they are submitted.'}
      </p>

      {stages.length === 0 ? (
        <Empty icon="shield" title={`No approval stages for ${FLOW_LABELS[flow].toLowerCase()}s`}>Add the first stage, e.g. “Finance check” → “Co-founder review” → “Founder sign-off”.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col" style={{ width: 60 }}>Order</th><th scope="col">Stage</th><th scope="col">Who can approve</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {stages.map((s, i) => (
                <tr key={s.id}>
                  <td><span className="stage-no">{i + 1}</span></td>
                  <td><b>{s.name}</b></td>
                  <td><div className="tags">{approverNames(s, ctx.profiles).map((n) => <span key={n} className={'tag' + (n.startsWith('any ') ? ' blue' : '')}>{n}</span>)}</div></td>
                  <td className="row-actions">
                    <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${s.name} up`} title="Move up"><Icon name="chevronUp" /></button>
                    <button className="icon-btn" disabled={i === stages.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${s.name} down`} title="Move down"><Icon name="chevron" /></button>
                    <button className="icon-btn" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`} title="Edit"><Icon name="edit" /></button>
                    <button className="icon-btn danger" onClick={() => setDel(s)} aria-label={`Delete ${s.name}`} title="Delete"><Icon name="trash" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <StageForm ctx={ctx} flow={flow} stage={editing === 'new' ? null : editing} nextPos={(stages.at(-1)?.position || 0) + 1} onClose={() => setEditing(null)} />}
      {del && (
        <Modal title={`Remove “${del.name}”?`} onClose={() => setDel(null)}
          footer={<><button className="btn ghost" onClick={() => setDel(null)}>Cancel</button><button className="btn danger" onClick={remove}>Remove stage</button></>}>
          <p>Invoices already in approval keep the stages they were submitted with. New submissions skip this stage.</p>
        </Modal>
      )}
    </div>
  );
}

function StageForm({ ctx, flow, stage, nextPos, onClose }) {
  const toast = useToast();
  const [name, setName] = useState(stage?.name || '');
  const [ids, setIds] = useState(stage?.approver_ids || []);
  const [roles, setRoles] = useState(stage?.approver_roles || []);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const people = ctx.profiles.filter((p) => p.active && (!q || `${p.full_name} ${p.email}`.toLowerCase().includes(q.toLowerCase())));
  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function save() {
    if (!name.trim()) return toast('Give the stage a name', 'err');
    if (!ids.length && !roles.length) return toast('Choose at least one person or role', 'err');
    setBusy(true);
    const row = { name: name.trim(), approver_ids: ids, approver_roles: roles, updated_at: new Date().toISOString() };
    const { error } = stage
      ? await supabase.from('apr_stages').update(row).eq('id', stage.id)
      : await supabase.from('apr_stages').insert({ ...row, flow, position: nextPos });
    setBusy(false);
    if (error) return toast(error.message, 'err');
    toast(stage ? 'Stage updated' : 'Stage added'); ctx.apr.reload(); onClose();
  }

  return (
    <Modal title={stage ? `Edit stage · ${stage.name}` : `New stage · ${FLOW_LABELS[flow]}s`} onClose={onClose} wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Save stage</button></>}>
      <div className="form-grid one">
        <label>Stage name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Co-founder review" autoFocus /></label>
      </div>
      <div className="section-box">
        <div className="section-title"><Icon name="users" /> Anyone with these roles can approve</div>
        <div className="chips" role="group" aria-label="Approver roles">
          {Object.entries(ROLE_LABELS).filter(([r]) => r !== 'member').map(([r, l]) => (
            <button key={r} type="button" className={'chip' + (roles.includes(r) ? ' on' : '')} aria-pressed={roles.includes(r)} onClick={() => toggle(roles, setRoles, r)}>{roles.includes(r) && <Icon name="check" size={12} />} {l}</button>
          ))}
        </div>
      </div>
      <div className="section-box">
        <div className="section-title"><Icon name="user" /> …or these people</div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" style={{ marginBottom: 8 }} />
        <div className="pick-list">
          {people.map((p) => (
            <label key={p.id} className="pick-row">
              <input type="checkbox" checked={ids.includes(p.id)} onChange={() => toggle(ids, setIds, p.id)} />
              <Avatar name={p.full_name || p.email} size={24} />
              <span className="grow"><b>{p.full_name}</b> <span className="muted small">{p.email}</span></span>
              <span className="badge">{ROLE_LABELS[p.role] || p.role}</span>
            </label>
          ))}
        </div>
        <p className="muted xsmall" style={{ marginTop: 8 }}>Any one of the selected people or roles can decide for this stage. Approvers can see the invoices they review even without Finance access.</p>
      </div>
    </Modal>
  );
}
