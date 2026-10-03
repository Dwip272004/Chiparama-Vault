import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase.js';
import { timeAgo } from '../lib.js';
import { Icon, Avatar, Empty } from './ui.jsx';

const LABELS = {
  created: ['Created', 'green'], updated: ['Edited', 'blue'], password_changed: ['Changed password', 'amber'],
  password_revealed: ['Revealed password', 'gray'], password_copied: ['Copied password', 'gray'],
  shared: ['Shared', 'green'], share_changed: ['Changed access', 'blue'], unshared: ['Removed access', 'red'], deleted: ['Deleted', 'red'],
};

export default function Activity({ ctx }) {
  const [rows, setRows] = useState(null);
  const [who, setWho] = useState('');
  const [kind, setKind] = useState('');
  async function load() {
    let q = supabase.from('pm_access_log').select('*').order('created_at', { ascending: false }).limit(300);
    if (who) q = q.eq('user_id', who);
    if (kind) q = q.eq('action', kind);
    const { data } = await q;
    setRows(data || []);
  }
  useEffect(() => { load(); }, [who, kind]); // eslint-disable-line
  const person = (id) => ctx.profiles.find((p) => p.id === id);

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Activity log</h1><p className="muted">Every reveal, copy, edit and sharing change.</p></div>
        <div className="head-actions">
          <select value={who} onChange={(e) => setWho(e.target.value)}><option value="">Everyone</option>{ctx.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</select>
          <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All actions</option>{Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select>
          <button className="icon-btn" title="Refresh" onClick={load}><Icon name="refresh" /></button>
        </div>
      </header>
      {rows === null ? <div className="pad"><div className="spinner" /></div> : rows.length === 0 ? <Empty icon="activity" title="No activity yet" /> : (
        <div className="card timeline">
          {rows.map((r) => {
            const p = person(r.user_id);
            const [label, color] = LABELS[r.action] || [r.action, 'gray'];
            return (
              <div key={r.id} className="tl-row">
                <Avatar name={p?.full_name || p?.email || '?'} size={28} />
                <div className="grow">
                  <b>{p?.full_name || p?.email || 'System'}</b> <span className={'act ' + color}>{label}</span> <b>{r.item_title || 'a credential'}</b>
                  {r.detail && <span className="muted"> · {r.detail}</span>}
                </div>
                <span className="muted small" title={new Date(r.created_at).toLocaleString()}>{timeAgo(r.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
