import React, { useEffect, useRef, useState } from 'react';
import { supabase, TWOFA } from '../supabase.js';
import { copyText, fullUrl, hostOf, timeAgo } from '../lib.js';
import { Icon, useToast, Avatar } from './ui.jsx';

export function Favicon({ url, title }) {
  const host = hostOf(url);
  const [err, setErr] = useState(false);
  if (!host || err) return <div className="fav letter">{(title || '?')[0].toUpperCase()}</div>;
  return <img className="fav" alt="" src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`} onError={() => setErr(true)} />;
}

export function TwoFABadge({ item, me }) {
  if (!item.twofa_type || item.twofa_type === 'none') return <span className="tfa none">No 2FA</span>;
  const mine = me && item.twofa_holder_id === me.id;
  return (
    <span className={'tfa' + (mine ? ' mine' : '')}>
      <Icon name="phone" size={13} /> {TWOFA[item.twofa_type]?.short}
      {' · '}{mine ? 'You hold it' : item.twofa_holder_name ? item.twofa_holder_name : 'No holder set'}
    </span>
  );
}

export default function ItemCard({ item, me, onEdit }) {
  const toast = useToast();
  const [pw, setPw] = useState(null);
  const [open, setOpen] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);

  async function fetchPw(action) {
    const { data, error } = await supabase.rpc('pm_reveal_password', { p_id: item.id, p_action: action });
    if (error) { toast(error.message, 'err'); return null; }
    return data;
  }
  async function reveal() {
    if (pw != null) { setPw(null); return; }
    const p = await fetchPw('revealed');
    if (p == null) return;
    setPw(p);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPw(null), 20000);
  }
  async function copyPw() {
    const p = pw ?? (await fetchPw('copied'));
    if (p == null) return;
    await copyText(p, { sensitive: true });
    toast('Password copied · clipboard clears in 30s');
  }
  async function copyUser() { await copyText(item.username || ''); toast('Username copied'); }

  const hasTfa = item.twofa_type && item.twofa_type !== 'none';

  return (
    <div className="item">
      <div className="item-top">
        <Favicon url={item.url} title={item.title} />
        <div className="item-title">
          <h3>{item.title}</h3>
          {item.url ? <a href={fullUrl(item.url)} target="_blank" rel="noreferrer">{hostOf(item.url)} <Icon name="external" size={12} /></a> : <span className="muted small">No link</span>}
        </div>
        <span className={'perm perm-' + item.my_permission}>{item.my_permission === 'admin' ? 'Admin' : item.my_permission === 'edit' ? 'Can edit' : 'View only'}</span>
      </div>

      <div className="field-row">
        <label>Username</label>
        <div className="val mono">{item.username || <span className="muted">—</span>}</div>
        {item.username && <button className="icon-btn" title="Copy username" onClick={copyUser}><Icon name="copy" /></button>}
      </div>
      <div className="field-row">
        <label>Password</label>
        <div className="val mono">{item.has_password ? (pw != null ? pw : '••••••••••••') : <span className="muted">—</span>}</div>
        {item.has_password && <>
          <button className="icon-btn" title={pw != null ? 'Hide' : 'Reveal (logged)'} onClick={reveal}><Icon name={pw != null ? 'eyeOff' : 'eye'} /></button>
          <button className="icon-btn" title="Copy password (logged)" onClick={copyPw}><Icon name="copy" /></button>
        </>}
      </div>

      <div className="item-foot">
        <TwoFABadge item={item} me={me} />
        <div className="foot-actions">
          {(hasTfa || item.notes) && <button className="link-btn" onClick={() => setOpen(!open)}>{open ? 'Less' : 'Details'}</button>}
          {onEdit && <button className="icon-btn" title="Edit" onClick={onEdit}><Icon name="edit" /></button>}
        </div>
      </div>

      {open && (
        <div className="item-more">
          {hasTfa && (
            <div className="tfa-box">
              <div className="tfa-head"><Icon name="shield" size={14} /> Two-factor: <b>{TWOFA[item.twofa_type]?.label}</b></div>
              {item.twofa_holder_name && <div className="holder"><Avatar name={item.twofa_holder_name} size={22} /> <span><b>{item.twofa_holder_name}</b> <span className="muted">{item.twofa_holder_email}</span></span></div>}
              {item.twofa_contact && <div><span className="muted">OTP goes to:</span> {item.twofa_contact}</div>}
              {item.twofa_notes && <div className="muted">{item.twofa_notes}</div>}
            </div>
          )}
          {item.notes && <div className="notes">{item.notes}</div>}
          <div className="muted small">Password updated {timeAgo(item.password_updated_at)}</div>
        </div>
      )}
    </div>
  );
}
