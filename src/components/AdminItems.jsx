import React, { useState } from 'react';
import { supabase, TWOFA } from '../supabase.js';
import { timeAgo, hostOf } from '../lib.js';
import { Icon, Empty, Avatar, Modal, useToast } from './ui.jsx';
import { Favicon } from './ItemCard.jsx';
import ItemForm from './ItemForm.jsx';
import ShareModal, { effectiveUsers } from './ShareModal.jsx';

export default function AdminItems({ ctx }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null); // 'new' | item
  const [share, setShare] = useState(null);
  const [del, setDel] = useState(null);

  const items = ctx.items.filter((i) => {
    const s = q.trim().toLowerCase();
    return !s || [i.title, i.url, i.username, i.category, i.twofa_holder_name].some((v) => v && v.toLowerCase().includes(s));
  });

  async function doDelete() {
    const { error } = await supabase.from('pm_items').delete().eq('id', del.id);
    if (error) return toast(error.message, 'err');
    toast('Credential deleted');
    setDel(null);
    ctx.reload();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Credentials</h1>
          <p className="muted">Create logins, set the 2FA holder, and decide who can see each one.</p>
        </div>
        <div className="head-actions">
          <div className="search"><Icon name="search" /><input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button className="btn primary" onClick={() => setForm('new')}><Icon name="plus" /> New credential</button>
        </div>
      </header>

      {ctx.items.length === 0 ? (
        <Empty icon="key" title="No credentials yet">Add your first shared login, then share it with members or teams.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Credential</th><th>Username</th><th>2FA holder</th><th>Shared with</th><th>Updated</th><th /></tr></thead>
            <tbody>
              {items.map((i) => {
                const grants = ctx.access.filter((a) => a.item_id === i.id);
                const reach = effectiveUsers(i.id, ctx).size;
                return (
                  <tr key={i.id}>
                    <td>
                      <div className="cell-title">
                        <Favicon url={i.url} title={i.title} />
                        <div><b>{i.title}</b><div className="muted small">{i.category}{i.url ? ' · ' + hostOf(i.url) : ''}</div></div>
                      </div>
                    </td>
                    <td className="mono small">{i.username || '—'}</td>
                    <td>
                      {i.twofa_type === 'none' ? <span className="muted small">No 2FA</span> : (
                        <div className="holder-cell">
                          {i.twofa_holder_name ? <Avatar name={i.twofa_holder_name} size={24} /> : <span className="warn-dot" title="No holder set" />}
                          <div><div className="small"><b>{i.twofa_holder_name || 'Unassigned'}</b></div><div className="muted xsmall">{TWOFA[i.twofa_type]?.short}</div></div>
                        </div>
                      )}
                    </td>
                    <td>
                      <button className="share-pill" onClick={() => setShare(i)}>
                        <Icon name="share" size={13} />
                        {grants.length === 0 ? 'Not shared' : `${reach} member${reach === 1 ? '' : 's'}`}
                        {grants.some((g) => g.team_id) && <span className="muted"> · {grants.filter((g) => g.team_id).length} team</span>}
                      </button>
                    </td>
                    <td className="muted small">{timeAgo(i.updated_at)}</td>
                    <td className="row-actions">
                      <button className="icon-btn" title="Share" onClick={() => setShare(i)}><Icon name="share" /></button>
                      <button className="icon-btn" title="Edit" onClick={() => setForm(i)}><Icon name="edit" /></button>
                      <button className="icon-btn danger" title="Delete" onClick={() => setDel(i)}><Icon name="trash" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && <ItemForm ctx={ctx} item={form === 'new' ? null : form} onClose={() => setForm(null)}
        onSaved={(id) => { if (form === 'new') setTimeout(() => setShare({ id, title: 'new credential' }), 50); }} />}
      {share && <ShareModal ctx={ctx} item={ctx.items.find((x) => x.id === share.id) || share} onClose={() => setShare(null)} />}
      {del && (
        <Modal title="Delete credential?" onClose={() => setDel(null)}
          footer={<><button className="btn ghost" onClick={() => setDel(null)}>Cancel</button><button className="btn danger" onClick={doDelete}>Delete</button></>}>
          <p><b>{del.title}</b> and all its sharing will be removed for everyone. The stored password is wiped.</p>
        </Modal>
      )}
    </div>
  );
}
