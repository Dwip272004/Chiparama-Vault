import React, { useMemo, useState } from 'react';
import { Icon, Empty, SearchBox } from './ui.jsx';
import { Favicon, TwoFABadge, PasswordField, CopyField, ItemDrawer, useSecret } from './ItemCard.jsx';
import { hostOf } from '../lib.js';
import ItemForm from './ItemForm.jsx';

export default function Vault({ ctx }) {
  const { items, me } = ctx;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);

  const cats = useMemo(() => [...new Set(items.map((i) => i.category))].sort(), [items]);
  const holdCount = items.filter((i) => i.twofa_holder_id === me.id).length;
  const canEdit = (i) => ['edit', 'admin'].includes(i.my_permission);

  const shown = items.filter((i) => {
    if (cat && i.category !== cat) return false;
    if (filter === 'mine2fa' && i.twofa_holder_id !== me.id) return false;
    if (filter === 'edit' && !canEdit(i)) return false;
    const s = q.trim().toLowerCase();
    return !s || [i.title, i.url, i.username, i.category, i.twofa_holder_name].some((v) => v && v.toLowerCase().includes(s));
  });
  const open = items.find((i) => i.id === openId);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Passwords</h1>
          <p>{items.length} login{items.length === 1 ? '' : 's'} shared with you{holdCount ? ` · you receive the 2FA code for ${holdCount}` : ''}</p>
        </div>
      </header>

      <div className="toolbar">
        <div className="filters">
          <SearchBox value={q} onChange={setQ} placeholder="Search logins" label="Search logins" />
          {cats.length > 1 && (
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category">
              <option value="">All categories</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
        <div className="seg" role="group" aria-label="Quick filters">
          <button className={filter === 'all' ? 'on' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
          <button className={filter === 'mine2fa' ? 'on' : ''} aria-pressed={filter === 'mine2fa'} onClick={() => setFilter('mine2fa')}>My 2FA{holdCount ? ` (${holdCount})` : ''}</button>
          <button className={filter === 'edit' ? 'on' : ''} aria-pressed={filter === 'edit'} onClick={() => setFilter('edit')}>Editable</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty title={items.length ? 'No logins match' : 'Nothing shared with you yet'}>
          {items.length ? 'Try another search or clear the filters.' : 'Ask an administrator to share the logins you need.'}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="table vt">
            <caption className="sr-only">Logins shared with you. Select a row for details.</caption>
            <thead><tr>
              <th scope="col">Name</th><th scope="col" className="hide-sm">Username</th><th scope="col">Password</th>
              <th scope="col" className="hide-sm">2FA code goes to</th><th scope="col" className="hide-sm">Access</th><th scope="col"><span className="sr-only">Details</span></th>
            </tr></thead>
            <tbody>
              {shown.map((i) => <Row key={i.id} item={i} me={me} selected={openId === i.id} onOpen={() => setOpenId(i.id)} />)}
            </tbody>
          </table>
        </div>
      )}

      {open && <ItemDrawer item={open} me={me} onClose={() => setOpenId(null)} onEdit={canEdit(open) ? () => { setOpenId(null); setEditing(open); } : null} />}
      {editing && <ItemForm ctx={ctx} item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Row({ item, me, selected, onOpen }) {
  const secret = useSecret(item);
  return (
    <tr className={'clickable' + (selected ? ' selected' : '')} onClick={onOpen}>
      <td>
        <div className="cell-title name">
          <Favicon url={item.url} title={item.title} />
          <div><b>{item.title}</b><span>{item.url ? hostOf(item.url) : item.category}</span></div>
        </div>
      </td>
      <td className="hide-sm"><CopyField value={item.username} label="Username" /></td>
      <td><PasswordField item={item} secret={secret} /></td>
      <td className="hide-sm"><TwoFABadge item={item} me={me} /></td>
      <td className="hide-sm"><span className={'perm perm-' + item.my_permission}>{item.my_permission === 'admin' ? 'Admin' : item.my_permission === 'edit' ? 'Can edit' : 'View'}</span></td>
      <td className="row-actions">
        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onOpen(); }} aria-label={`Open details for ${item.title}`} title="Details"><Icon name="arrowRight" /></button>
      </td>
    </tr>
  );
}
