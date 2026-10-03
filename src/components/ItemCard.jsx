import React, { useEffect, useRef, useState } from 'react';
import { supabase, TWOFA } from '../supabase.js';
import { copyText, fullUrl, hostOf, timeAgo } from '../lib.js';
import { Icon, useToast, Avatar, Drawer } from './ui.jsx';

export function Favicon({ url, title }) {
  const host = hostOf(url);
  const [err, setErr] = useState(false);
  if (!host || err) return <div className="fav letter" aria-hidden="true">{(title || '?')[0].toUpperCase()}</div>;
  return <img className="fav" alt="" src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`} onError={() => setErr(true)} />;
}

export function TwoFABadge({ item, me }) {
  if (!item.twofa_type || item.twofa_type === 'none') return <span className="tfa none"><i />None</span>;
  const mine = me && item.twofa_holder_id === me.id;
  return (
    <span className={'tfa' + (mine ? ' mine' : '')} title={TWOFA[item.twofa_type]?.label}>
      <i />{mine ? 'You' : item.twofa_holder_name || 'Unassigned'}
      <span className="faint">· {TWOFA[item.twofa_type]?.short}</span>
    </span>
  );
}

// Reveal / copy logic shared by the table row and the details panel
export function useSecret(item) {
  const toast = useToast();
  const [pw, setPw] = useState(null);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  async function fetchPw(action) {
    const { data, error } = await supabase.rpc('pm_reveal_password', { p_id: item.id, p_action: action });
    if (error) { toast(error.message, 'err'); return null; }
    return data;
  }
  async function toggle() {
    if (pw != null) { setPw(null); return; }
    const p = await fetchPw('revealed');
    if (p == null) return;
    setPw(p);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPw(null), 20000);
  }
  async function copy() {
    const p = pw ?? (await fetchPw('copied'));
    if (p == null) return;
    await copyText(p, { sensitive: true });
    toast('Password copied. Clipboard clears in 30 seconds.');
  }
  return { pw, toggle, copy };
}

export function PasswordField({ item, secret }) {
  if (!item.has_password) return <span className="faint">—</span>;
  const { pw, toggle, copy } = secret;
  return (
    <span className="secret" onClick={(e) => e.stopPropagation()}>
      <span className="mono" aria-live="polite">{pw != null ? pw : '••••••••••'}</span>
      <button className="icon-btn" onClick={toggle} aria-label={pw != null ? `Hide password for ${item.title}` : `Show password for ${item.title}`} title={pw != null ? 'Hide' : 'Show (logged)'}>
        <Icon name={pw != null ? 'eyeOff' : 'eye'} />
      </button>
      <button className="icon-btn" onClick={copy} aria-label={`Copy password for ${item.title}`} title="Copy (logged)"><Icon name="copy" /></button>
    </span>
  );
}

export function CopyField({ value, label, mono = true }) {
  const toast = useToast();
  if (!value) return <span className="faint">—</span>;
  return (
    <span className="secret" onClick={(e) => e.stopPropagation()}>
      <span className={mono ? 'mono' : ''}>{value}</span>
      <button className="icon-btn" onClick={async () => { await copyText(value); toast(`${label} copied`); }} aria-label={`Copy ${label.toLowerCase()} ${value}`} title="Copy"><Icon name="copy" /></button>
    </span>
  );
}

export function ItemDrawer({ item, me, onClose, onEdit }) {
  const secret = useSecret(item);
  const hasTfa = item.twofa_type && item.twofa_type !== 'none';
  const permLabel = item.my_permission === 'admin' ? 'Administrator' : item.my_permission === 'edit' ? 'Can edit' : 'View only';
  return (
    <Drawer title={item.title} header={<Favicon url={item.url} title={item.title} />} onClose={onClose}
      footer={<>
        {item.url && <a className="btn primary" href={fullUrl(item.url)} target="_blank" rel="noreferrer"><Icon name="external" /> Open site</a>}
        {onEdit && <button className="btn ghost" onClick={onEdit}><Icon name="edit" /> Edit</button>}
      </>}>
      <h4>Login</h4>
      <div className="dl"><div className="k">Website</div><div className="v">{item.url ? <a className="txt" href={fullUrl(item.url)} target="_blank" rel="noreferrer">{hostOf(item.url)}</a> : <span className="faint">—</span>}</div></div>
      <div className="dl"><div className="k">Username</div><div className="v"><CopyField value={item.username} label="Username" /></div></div>
      <div className="dl"><div className="k">Password</div><div className="v"><PasswordField item={item} secret={secret} /></div></div>
      <div className="dl"><div className="k">Category</div><div className="v"><span className="txt">{item.category}</span></div></div>
      <div className="dl"><div className="k">Your access</div><div className="v"><span className={'perm perm-' + item.my_permission}>{permLabel}</span></div></div>

      <h4>Two-factor authentication</h4>
      {hasTfa ? <>
        <div className="dl"><div className="k">Method</div><div className="v"><span className="txt">{TWOFA[item.twofa_type]?.label}</span></div></div>
        <div className="dl"><div className="k">Held by</div><div className="v">
          {item.twofa_holder_name
            ? <span className="holder-cell"><Avatar name={item.twofa_holder_name} size={22} /> <span>{item.twofa_holder_id === me.id ? 'You' : item.twofa_holder_name}<br /><span className="muted xsmall">{item.twofa_holder_email}</span></span></span>
            : <span className="warn-text">Not assigned</span>}
        </div></div>
        {item.twofa_contact && <div className="dl"><div className="k">Code sent to</div><div className="v"><span className="txt">{item.twofa_contact}</span></div></div>}
        {item.twofa_notes && <div className="dl"><div className="k">Notes</div><div className="v"><span className="txt">{item.twofa_notes}</span></div></div>}
      </> : <p className="muted small" style={{ padding: '8px 0' }}>This login doesn't use two-factor authentication.</p>}

      {item.notes && <><h4>Notes</h4><div className="notes">{item.notes}</div></>}
      <p className="muted xsmall" style={{ marginTop: 16 }}>Password last changed {timeAgo(item.password_updated_at)}. Reveals and copies are recorded in the activity log.</p>
    </Drawer>
  );
}
