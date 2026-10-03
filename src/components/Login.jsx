import React, { useState } from 'react';
import { supabase } from '../supabase.js';
import { Icon } from './ui.jsx';

const COPY = {
  signin: { title: 'Sign in', sub: 'Use your Chiplabs work email.', cta: 'Sign in' },
  signup: { title: 'Request access', sub: 'An administrator approves new accounts.', cta: 'Request access' },
  reset: { title: 'Reset password', sub: "Enter your email and we'll send a reset link.", cta: 'Send reset link' },
};

export default function Login() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMsg({ type: 'err', text: error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message });
    } else if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name } } });
      setMsg(error ? { type: 'err', text: error.message } : { type: 'ok', text: 'Request received. You can sign in once an administrator approves your account.' });
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      setMsg(error ? { type: 'err', text: error.message } : { type: 'ok', text: 'If an account exists for that email, a reset link is on its way.' });
    }
    setBusy(false);
  }
  const go = (m) => { setMode(m); setMsg(null); };
  const c = COPY[mode];

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit} noValidate={false}>
        <div className="login-brand">
          <div className="brand-mark" aria-hidden="true">C</div>
          <div><b>Chiplabs</b><br /><span>Workspace</span></div>
        </div>
        <h2>{c.title}</h2>
        <p className="sub">{c.sub}</p>
        {mode === 'signup' && <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></label>}
        <label>Work email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus /></label>
        {mode !== 'reset' && (
          <label>
            <span className="label-row">Password {mode === 'signin' && <a onClick={() => go('reset')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go('reset')}>Forgot?</a>}</span>
            <span className="pw-field">
              <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'signup' ? 8 : undefined}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
              <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}><Icon name={show ? 'eyeOff' : 'eye'} /></button>
            </span>
          </label>
        )}
        {msg && <div className={'note ' + msg.type} role={msg.type === 'err' ? 'alert' : 'status'}>{msg.text}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Please wait…' : c.cta}</button>
        <div className="login-links">
          {mode === 'signin'
            ? <span className="muted">New here? <a onClick={() => go('signup')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go('signup')}>Request access</a></span>
            : <a onClick={() => go('signin')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go('signin')}>← Back to sign in</a>}
        </div>
      </form>
      <p className="login-foot">For Chiplabs Solutions Pvt Ltd staff only. Activity is logged.</p>
    </main>
  );
}
