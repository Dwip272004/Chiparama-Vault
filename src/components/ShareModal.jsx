import React, { useState } from 'react';
import { supabase } from '../supabase.js';
import { Icon, Modal, Avatar, useToast } from './ui.jsx';

export function effectiveUsers(itemId, ctx) {
  const now = Date.now();
  const grants = ctx.access.filter((a) => a.item_id === itemId && (!a.expires_at || new Date(a.expires_at).getTime() > now));
  const ids = new Set();
  grants.forEach((g) => {
    if (g.user_id) ids.add(g.user_id);
    else ctx.teamMembers.filter((tm) => tm.team_id === g.team_id).forEach((tm) => ids.add(tm.user_id));
  });
  return ids;
}

export default function ShareModal({ ctx, item, onClose }) {
  const toast = useToast();
  const grants = ctx.access.filter((a) => a.item_id === item.id);
  const [kind, setKind] = useState('user');
  const [target, setTarget] = useState('');
  const [perm, setPerm] = useState('view');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);

  const name = (g) => g.user_id
    ? (ctx.profiles.find((p) => p.id === g.user_id)?.full_name || ctx.profiles.find((p) => p.id === g.user_id)?.email || 'Unknown')
    : (ctx.teams.find((t) => t.id === g.team_id)?.name || 'Team');
  const taken = new Set(grants.map((g) => g.user_id || g.team_id));
  const options = kind === 'user'
    ? ctx.profiles.filter((p) => p.active && !taken.has(p.id))
    : ctx.teams.filter((t) => !taken.has(t.id));

  async function add() {
    if (!target) return;
    setBusy(true);
    const row = { item_id: item.id, permission: perm, expires_at: expires ? new Date(expires + 'T23:59:59').toISOString() : null };
    row[kind === 'user' ? 'user_id' : 'team_id'] = target;
    const { error } = await supabase.from('pm_access').insert(row);
    setBusy(false);
    if (error) return toast(error.message, 'err');
    setTarget(''); setExpires('');
    toast('Access granted');
    ctx.reload();
  }
  async function change(g, permission) {
    const { error } = await supabase.from('pm_access').update({ permission }).eq('id', g.id);
    if (error) return toast(error.message, 'err');
    ctx.reload();
  }
  async function remove(g) {
    const { error } = await supabase.from('pm_access').delete().eq('id', g.id);
    if (error) return toast(error.message, 'err');
    toast('Access removed');
    ctx.reload();
  }

  const reach = effectiveUsers(item.id, ctx).size;

  return (
    <Modal title={`Share · ${item.title}`} onClose={onClose} wide footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <div className="share-add">
        <div className="seg">
          <button className={kind === 'user' ? 'on' : ''} onClick={() => { setKind('user'); setTarget(''); }}><Icon name="user" size={14} /> Member</button>
          <button className={kind === 'team' ? 'on' : ''} onClick={() => { setKind('team'); setTarget(''); }}><Icon name="users" size={14} /> Team</button>
        </div>
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">{kind === 'user' ? 'Choose a member…' : 'Choose a team…'}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.full_name || o.name || o.email}{o.email && o.full_name ? ` (${o.email})` : ''}</option>)}
        </select>
        <select value={perm} onChange={(e) => setPerm(e.target.value)} className="narrow">
          <option value="view">Can view</option>
          <option value="edit">Can edit</option>
        </select>
        <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} title="Optional expiry" className="narrow" />
        <button className="btn primary" disabled={!target || busy} onClick={add}><Icon name="plus" /> Grant</button>
      </div>
      <p className="muted small">Admins always see everything. {reach} member{reach === 1 ? ' currently reaches' : 's currently reach'} this credential through the grants below. Leave the date empty for no expiry.</p>

      {grants.length === 0 ? <div className="muted pad">Not shared with anyone yet.</div> : (
        <div className="list">
          {grants.map((g) => {
            const expired = g.expires_at && new Date(g.expires_at) < new Date();
            return (
              <div key={g.id} className="list-row">
                {g.user_id ? <Avatar name={name(g)} /> : <span className="team-ico"><Icon name="users" /></span>}
                <div className="grow">
                  <b>{name(g)}</b>
                  <div className="muted small">
                    {g.team_id ? `Team · ${ctx.teamMembers.filter((t) => t.team_id === g.team_id).length} members` : ctx.profiles.find((p) => p.id === g.user_id)?.email}
                    {g.expires_at && <span className={expired ? 'danger' : ''}> · {expired ? 'expired' : 'expires'} {new Date(g.expires_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <select value={g.permission} onChange={(e) => change(g, e.target.value)} className="narrow">
                  <option value="view">Can view</option>
                  <option value="edit">Can edit</option>
                </select>
                <button className="icon-btn danger" title="Remove access" aria-label="Remove access" onClick={() => remove(g)}><Icon name="trash" /></button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
