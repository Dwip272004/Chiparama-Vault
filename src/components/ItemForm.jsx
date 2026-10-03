import React, { useMemo, useState } from 'react';
import { supabase, TWOFA } from '../supabase.js';
import { generatePassword, strength } from '../lib.js';
import { Icon, Modal, useToast } from './ui.jsx';

const STRENGTH = ['Very weak', 'Weak', 'Okay', 'Strong', 'Very strong'];

export default function ItemForm({ ctx, item, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !item;
  const [f, setF] = useState({
    title: item?.title || '', url: item?.url || '', username: item?.username || '', password: '',
    category: item?.category || 'General', notes: item?.notes || '',
    twofa_type: item?.twofa_type || 'none', twofa_holder_id: item?.twofa_holder_id || '',
    twofa_contact: item?.twofa_contact || '', twofa_notes: item?.twofa_notes || '',
  });
  const [show, setShow] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const cats = useMemo(() => [...new Set(['General', 'Social', 'Email', 'Job boards', 'Tools', 'Finance', 'Cloud', ...ctx.items.map((i) => i.category)])], [ctx.items]);
  const people = ctx.profiles.filter((p) => p.active);
  const s = strength(f.password);

  async function save() {
    if (!f.title.trim()) return toast('Give it a name', 'err');
    setBusy(true);
    const { data, error } = await supabase.rpc('pm_save_item', {
      p_id: item?.id || null, p_title: f.title, p_url: f.url, p_username: f.username, p_password: f.password || null,
      p_category: f.category, p_notes: f.notes || null, p_twofa_type: f.twofa_type,
      p_twofa_holder_id: f.twofa_type === 'none' ? null : f.twofa_holder_id || null,
      p_twofa_contact: f.twofa_type === 'none' ? null : f.twofa_contact || null,
      p_twofa_notes: f.twofa_type === 'none' ? null : f.twofa_notes || null,
    });
    setBusy(false);
    if (error) return toast(error.message, 'err');
    toast(isNew ? 'Login saved' : 'Changes saved');
    await ctx.reload();
    onClose();
    onSaved?.(data);
  }

  return (
    <Modal title={isNew ? 'New login' : `Edit ${item.title}`} onClose={onClose} wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : isNew ? 'Save and share' : 'Save changes'}</button></>}>
      <div className="form-grid">
        <label className="span2">Name<input value={f.title} onChange={set('title')} placeholder="e.g. LinkedIn Recruiter – Sales seat" autoFocus /></label>
        <label>Login link<input value={f.url} onChange={set('url')} placeholder="https://…" /></label>
        <label>Category<input list="cats" value={f.category} onChange={set('category')} /><datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></label>
        <label>Username / email<input value={f.username} onChange={set('username')} autoComplete="off" /></label>
        <label>
          Password {!isNew && <span className="muted small">(leave blank to keep current)</span>}
          <div className="input-group">
            <input type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} className="mono" autoComplete="new-password" />
            <button type="button" className="icon-btn" title={show ? 'Hide' : 'Show'} aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}><Icon name={show ? 'eyeOff' : 'eye'} /></button>
            <button type="button" className="icon-btn" title="Generate strong password" aria-label="Generate strong password" onClick={() => { setF({ ...f, password: generatePassword() }); setShow(true); }}><Icon name="dice" /></button>
          </div>
          {f.password && <div className="meter"><div className={'bar s' + s} style={{ width: (s + 1) * 20 + '%' }} /><span>{STRENGTH[s]}</span></div>}
        </label>
        <label className="span2">Notes<textarea rows={2} value={f.notes} onChange={set('notes')} placeholder="Anything the team should know (seat limits, recovery email, etc.)" /></label>
      </div>

      <div className="section-box">
        <div className="section-title"><Icon name="shield" /> Two-factor authentication</div>
        <p className="muted small">Record who receives the code so teammates know whom to ask when they sign in.</p>
        <div className="form-grid">
          <label>2FA method
            <select value={f.twofa_type} onChange={set('twofa_type')}>
              {Object.entries(TWOFA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          {f.twofa_type !== 'none' && <>
            <label>Held by (person)
              <select value={f.twofa_holder_id} onChange={set('twofa_holder_id')}>
                <option value="">— Not assigned —</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
            </label>
            <label>OTP goes to<input value={f.twofa_contact} onChange={set('twofa_contact')} placeholder="+91 98xxx xxx21 / ops@… / Google Authenticator on iPhone" /></label>
            <label>2FA notes<input value={f.twofa_notes} onChange={set('twofa_notes')} placeholder="Backup codes in safe, ping on Slack, etc." /></label>
          </>}
        </div>
      </div>
    </Modal>
  );
}
