import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase.js';
import { Icon, useToast } from './ui.jsx';
import { timeAgo } from '../lib.js';
import { FLOW_LABELS } from './approvals/shared.jsx';

// Bell + panel available to every signed-in user.
// Shows invoices waiting for *your* approval (with one-click approve) and your recent notifications.
export default function NotificationBell({ ctx, onOpenApproval }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(null);
  const ref = useRef(null);
  const me = ctx.me;
  const queue = ctx.apr.queue || [];

  const load = useCallback(async () => {
    const { data } = await supabase.from('notifications').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(30);
    setItems(data || []);
  }, [me.id]);

  // live updates: new notification rows for me, plus a light poll / on-focus refresh of the approval queue
  useEffect(() => {
    load();
    const ch = supabase.channel(`notif-${me.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${me.id}` }, (payload) => {
        load(); ctx.apr.reload();
        if (payload.new?.title) toast(payload.new.title);
      })
      .subscribe();
    const refresh = () => { load(); ctx.apr.reload(); };
    const t = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { supabase.removeChannel(ch); clearInterval(t); window.removeEventListener('focus', refresh); };
  }, [me.id]); // eslint-disable-line

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const unread = items.filter((n) => !n.read_at).length;
  const badge = queue.length || unread;

  async function markRead(ids) {
    if (!ids.length) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
    load();
  }
  async function approve(r) {
    setBusy(r.id);
    const { data, error } = await supabase.rpc('apr_decide', { p_request: r.id, p_decision: 'approve', p_comment: null });
    setBusy(null); setConfirmId(null);
    if (error) return toast(error.message, 'err');
    toast(data === 'approved' ? `${r.invoice_label.split(' · ')[0]} fully approved` : 'Approved – sent to the next stage');
    markRead(items.filter((n) => n.entity_id === r.id && !n.read_at).map((n) => n.id));
    ctx.apr.reload(); ctx.fin?.reload?.();
  }
  function openReq(id) {
    setOpen(false);
    markRead(items.filter((n) => n.entity_id === id && !n.read_at).map((n) => n.id));
    onOpenApproval(id);
  }

  return (
    <div className="bell" ref={ref}>
      <button className="bell-btn" onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`Notifications${badge ? `, ${badge} new` : ''}`} title="Notifications">
        <Icon name="bell" size={18} />
        {badge > 0 && <span className="bell-badge" aria-hidden="true">{badge > 9 ? '9+' : badge}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <b>Notifications</b>
            {unread > 0 && <button className="link-btn" onClick={() => markRead(items.filter((n) => !n.read_at).map((n) => n.id))}>Mark all as read</button>}
          </div>

          <div className="bell-body">
            <div className="bell-section">Waiting for your approval {queue.length > 0 && <em>{queue.length}</em>}</div>
            {queue.length === 0 ? <p className="bell-empty">Nothing needs your approval right now.</p> : queue.map((r) => {
              const stage = r.stages?.[r.current_index];
              const back = r.last_action === 'rejected';
              return (
                <div key={r.id} className="bell-task">
                  <div className="grow">
                    <b>{r.invoice_label}</b>
                    <div className="muted xsmall">{FLOW_LABELS[r.flow]} · {r.amount_label}</div>
                    <div className="xsmall">Stage {r.current_index + 1}/{r.stages.length}: <b>{stage?.name}</b>{back && <span className="warn-text"> · returned for reconsideration</span>}</div>
                    {back && r.last_comment && <div className="apr-comment rej">{r.last_comment}</div>}
                  </div>
                  <div className="bell-task-actions">
                    {confirmId === r.id ? (
                      <>
                        <button className="btn small primary" disabled={busy === r.id} onClick={() => approve(r)}>Confirm approve</button>
                        <button className="btn small ghost" onClick={() => setConfirmId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn small primary" onClick={() => setConfirmId(r.id)} aria-label={`Approve ${r.invoice_label}`}><Icon name="check" /> Approve</button>
                        <button className="btn small ghost" onClick={() => openReq(r.id)} aria-label={`Review ${r.invoice_label}`}>Review</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="bell-section">Recent</div>
            {items.length === 0 ? <p className="bell-empty">No notifications yet.</p> : items.map((n) => (
              <button key={n.id} className={'bell-item' + (n.read_at ? '' : ' unread')}
                onClick={() => (n.entity_type === 'apr_request' ? openReq(n.entity_id) : markRead([n.id]))}>
                {!n.read_at && <i className="bell-dot" aria-label="Unread" />}
                <span className="grow">
                  <b>{n.title}</b>
                  {n.body && <span className="bell-text">{n.body}</span>}
                  <span className="muted xsmall">{timeAgo(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="bell-foot"><button className="link-btn" onClick={() => { setOpen(false); onOpenApproval(null); }}>Open all approvals →</button></div>
        </div>
      )}
    </div>
  );
}
