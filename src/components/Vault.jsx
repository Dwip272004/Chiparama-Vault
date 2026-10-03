import React, { useMemo, useState } from 'react';
import { Icon, Empty } from './ui.jsx';
import ItemCard from './ItemCard.jsx';
import ItemForm from './ItemForm.jsx';

export default function Vault({ ctx }) {
  const { items, me } = ctx;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);

  const cats = useMemo(() => ['All', ...new Set(items.map((i) => i.category))], [items]);
  const holdCount = items.filter((i) => i.twofa_holder_id === me.id).length;

  const shown = items.filter((i) => {
    if (cat !== 'All' && i.category !== cat) return false;
    if (filter === 'mine2fa' && i.twofa_holder_id !== me.id) return false;
    if (filter === 'edit' && !['edit', 'admin'].includes(i.my_permission)) return false;
    const s = q.trim().toLowerCase();
    return !s || [i.title, i.url, i.username, i.category, i.twofa_holder_name].some((v) => v && v.toLowerCase().includes(s));
  });

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>My Vault</h1>
          <p className="muted">{items.length} credential{items.length === 1 ? '' : 's'} shared with you{holdCount ? ` · you hold 2FA for ${holdCount}` : ''}</p>
        </div>
        <div className="search">
          <Icon name="search" />
          <input placeholder="Search by name, site, username…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </header>

      {holdCount > 0 && (
        <div className="banner">
          <Icon name="phone" />
          <span>You are the <b>2FA / OTP holder</b> for {holdCount} account{holdCount > 1 ? 's' : ''}. Teammates may ping you for codes when they log in.</span>
          <button className="btn small ghost" onClick={() => setFilter('mine2fa')}>Show them</button>
        </div>
      )}

      <div className="toolbar">
        <div className="chips">
          {cats.map((c) => <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div className="seg">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
          <button className={filter === 'mine2fa' ? 'on' : ''} onClick={() => setFilter('mine2fa')}>2FA I hold</button>
          <button className={filter === 'edit' ? 'on' : ''} onClick={() => setFilter('edit')}>I can edit</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty title={items.length ? 'Nothing matches' : 'No credentials shared with you yet'}>
          {items.length ? 'Try a different search or filter.' : 'Ask an admin to share the logins you need.'}
        </Empty>
      ) : (
        <div className="grid">
          {shown.map((i) => <ItemCard key={i.id} item={i} me={me} onEdit={['edit', 'admin'].includes(i.my_permission) ? () => setEditing(i) : null} />)}
        </div>
      )}

      {editing && <ItemForm ctx={ctx} item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
