import React, { useEffect, useState } from 'react';
import { supabase, LEADER_ROLES } from '../supabase.js';
import { generatePassword, copyText, timeAgo } from '../lib.js';
import { Icon, SearchBox, Avatar, Modal, RoleBadge, useToast, Empty } from './ui.jsx';

export default function Members({ ctx }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [q, setQ] = useState('');
  const pending = ctx.profiles.filter((p) => !p.active);
  const people = ctx.profiles.filter((p) => p.active && (!q || (p.full_name + ' ' + p.email).toLowerCase().includes(q.toLowerCase())));
  const inactive = ctx.profiles.filter((p) => !p.active);

  async function update(p, patch, msg) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', p.id);
    if (error) return toast(error.message, 'err');
    toast(msg);
    ctx.reload();
  }
  const teamsOf = (uid) => ctx.teamMembers.filter((t) => t.user_id === uid).map((t) => ctx.teams.find((x) => x.id === t.team_id)?.name).filter(Boolean);
  const reachCount = (uid) => {
    const myTeams = new Set(ctx.teamMembers.filter((t) => t.user_id === uid).map((t) => t.team_id));
    return new Set(ctx.access.filter((a) => (a.user_id === uid || myTeams.has(a.team_id)) && (!a.expires_at || new Date(a.expires_at) > new Date())).map((a) => a.item_id)).size;
  };
  const holds = (uid) => ctx.items.filter((i) => i.twofa_holder_id === uid).length;

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Members</h1><p className="muted">Approve accounts, set roles and teams, and review what each person can access.</p></div>
        <div className="head-actions">
          <SearchBox value={q} onChange={setQ} placeholder="Search people" label="Search people" />
          <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" /> Add member</button>
        </div>
      </header>

      {pending.length > 0 && (
        <div className="card pending-list">
          <div className="section-title"><Icon name="user" /> Waiting for approval ({pending.length})</div>
          {inactive.map((p) => (
            <div key={p.id} className="list-row">
              <Avatar name={p.full_name || p.email} />
              <div className="grow"><b>{p.full_name}</b><div className="muted small">{p.email} · signed up {timeAgo(p.created_at)}</div></div>
              <button className="btn small primary" onClick={() => update(p, { active: true }, 'Member approved')}><Icon name="check" /> Approve</button>
            </div>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Member</th><th>Role</th><th>Teams</th><th>Access</th><th>2FA held</th><th /></tr></thead>
          <tbody>
            {people.map((p) => {
              const leader = LEADER_ROLES.includes(p.role);
              const exec = ['cfo', 'cto'].includes(p.role);
              const founderMe = ctx.me.role === 'founder';
              const self = p.id === ctx.me.id;
              return (
                <tr key={p.id}>
                  <td><div className="cell-title"><Avatar name={p.full_name || p.email} /><div><b>{p.full_name}</b>{self && <span className="muted small"> (you)</span>}<div className="muted small">{p.email}</div></div></div></td>
                  <td>
                    {leader || self || (exec && !founderMe) ? <RoleBadge role={p.role} /> : (
                      <select className="narrow" value={p.role} onChange={(e) => update(p, { role: e.target.value }, 'Role updated')}>
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        {founderMe && <option value="cfo">CFO</option>}
                        {founderMe && <option value="cto">CTO</option>}
                      </select>
                    )}
                  </td>
                  <td><div className="tags">{teamsOf(p.id).map((t) => <span key={t} className="tag">{t}</span>)}{teamsOf(p.id).length === 0 && <span className="muted small">—</span>}</div></td>
                  <td>{['founder', 'cofounder', 'cmo', 'admin'].includes(p.role) ? <span className="muted small">All (admin)</span> : <b>{reachCount(p.id)}</b>}</td>
                  <td>{holds(p.id) || <span className="muted">0</span>}</td>
                  <td className="row-actions">
                    <button className="btn small ghost" onClick={() => setViewing(p)}>Manage access</button>
                    {!leader && !self && <button className="icon-btn danger" title="Deactivate" aria-label="Deactivate" onClick={() => update(p, { active: false }, 'Member deactivated')}><Icon name="logout" /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adding && <AddMember ctx={ctx} onClose={() => setAdding(false)} />}
      {viewing && <MemberAccess ctx={ctx} person={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function AddMember({ ctx, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ full_name: '', email: '', password: generatePassword(14), role: 'member', team_ids: [] });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const toggleTeam = (id) => setF({ ...f, team_ids: f.team_ids.includes(id) ? f.team_ids.filter((x) => x !== id) : [...f.team_ids, id] });

  async function submit() {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('pm-add-member', { body: f });
    setBusy(false);
    let msg = error?.message;
    if (error?.context?.json) { try { msg = (await error.context.json()).error || msg; } catch {} }
    if (error || data?.error) return toast(msg || data.error, 'err');
    setDone(f);
    ctx.reload();
  }

  if (done) {
    const text = `Chiparama Vault login\nLink: ${window.location.origin}\nEmail: ${done.email}\nTemporary password: ${done.password}`;
    return (
      <Modal title="Member added" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Done</button>}>
        <p>Share these sign-in details with <b>{done.full_name || done.email}</b> privately (ask them to change the password later).</p>
        <pre className="cred-box">{text}</pre>
        <button className="btn ghost" onClick={async () => { await copyText(text, { sensitive: true }); toast('Copied'); }}><Icon name="copy" /> Copy details</button>
      </Modal>
    );
  }
  return (
    <Modal title="Add member" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.email} onClick={submit}>{busy ? 'Adding…' : 'Add member'}</button></>}>
      <div className="form-grid one">
        <label>Full name<input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoFocus /></label>
        <label>Work email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Temporary password
          <div className="input-group">
            <input className="mono" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <button type="button" className="icon-btn" title="Generate" onClick={() => setF({ ...f, password: generatePassword(14) })}><Icon name="dice" /></button>
          </div>
        </label>
        <label>Role
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="member">Member — sees only what is shared</option>
            <option value="admin">Admin — sees and shares everything</option>
          </select>
        </label>
        <div><div className="label">Teams</div><div className="chips">{ctx.teams.map((t) => <button type="button" key={t.id} className={'chip' + (f.team_ids.includes(t.id) ? ' on' : '')} onClick={() => toggleTeam(t.id)}>{t.name}</button>)}</div></div>
      </div>
    </Modal>
  );
}

function MemberAccess({ ctx, person, onClose }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [add, setAdd] = useState('');
  const [perm, setPerm] = useState('view');
  const isAdminRole = ['founder', 'cofounder', 'cmo', 'admin'].includes(person.role);

  async function load() {
    const { data, error } = await supabase.rpc('pm_member_access', { p_user: person.id });
    if (error) toast(error.message, 'err');
    setRows(data || []);
  }
  useEffect(() => { load(); }, [ctx.access, ctx.teamMembers]); // eslint-disable-line

  const myTeams = new Set(ctx.teamMembers.filter((t) => t.user_id === person.id).map((t) => t.team_id));
  async function toggleTeam(team) {
    const q = myTeams.has(team.id)
      ? supabase.from('team_members').delete().eq('team_id', team.id).eq('user_id', person.id)
      : supabase.from('team_members').insert({ team_id: team.id, user_id: person.id });
    const { error } = await q;
    if (error) return toast(error.message, 'err');
    ctx.reload();
  }
  async function grant() {
    if (!add) return;
    const { error } = await supabase.from('pm_access').insert({ item_id: add, user_id: person.id, permission: perm });
    if (error) return toast(error.message.includes('duplicate') ? 'Already shared directly' : error.message, 'err');
    setAdd(''); toast('Access granted'); ctx.reload();
  }
  async function revokeDirect(itemId) {
    const { error } = await supabase.from('pm_access').delete().eq('item_id', itemId).eq('user_id', person.id);
    if (error) return toast(error.message, 'err');
    toast('Direct access removed'); ctx.reload();
  }
  const directIds = new Set((rows || []).filter((r) => r.via === 'Direct').map((r) => r.item_id));

  return (
    <Modal title={`Access · ${person.full_name || person.email}`} onClose={onClose} wide footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      {isAdminRole && <div className="note ok">This person is an admin, so they can see every credential regardless of the list below.</div>}
      <div className="label">Teams</div>
      <div className="chips">{ctx.teams.map((t) => <button key={t.id} className={'chip' + (myTeams.has(t.id) ? ' on' : '')} onClick={() => toggleTeam(t)}>{myTeams.has(t.id) && <Icon name="check" size={12} />} {t.name}</button>)}</div>

      <div className="share-add" style={{ marginTop: 18 }}>
        <select value={add} onChange={(e) => setAdd(e.target.value)}>
          <option value="">Give direct access to a credential…</option>
          {ctx.items.filter((i) => !directIds.has(i.id)).map((i) => <option key={i.id} value={i.id}>{i.title} · {i.category}</option>)}
        </select>
        <select value={perm} onChange={(e) => setPerm(e.target.value)} className="narrow"><option value="view">Can view</option><option value="edit">Can edit</option></select>
        <button className="btn primary" disabled={!add} onClick={grant}><Icon name="plus" /> Grant</button>
      </div>

      {rows === null ? <div className="pad"><div className="spinner" /></div> : rows.length === 0 ? <Empty title="No credentials shared yet" /> : (
        <div className="list">
          {rows.map((r, idx) => (
            <div key={r.item_id + idx} className="list-row">
              <div className="grow"><b>{r.title}</b><div className="muted small">{r.category}{r.expires_at ? ` · until ${new Date(r.expires_at).toLocaleDateString()}` : ''}</div></div>
              <span className={'tag' + (r.via === 'Direct' ? ' blue' : '')}>{r.via}</span>
              <span className={'perm perm-' + r.permission}>{r.permission === 'edit' ? 'Can edit' : 'View only'}</span>
              {r.via === 'Direct' ? <button className="icon-btn danger" title="Remove direct access" aria-label="Remove direct access" onClick={() => revokeDirect(r.item_id)}><Icon name="trash" /></button> : <span style={{ width: 30 }} />}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
