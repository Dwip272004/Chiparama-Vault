import React, { useState } from 'react';
import { supabase } from '../supabase.js';
import { Icon } from './ui.jsx';

export default function Login() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ type: 'err', text: error.message });
    } else if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
      setMsg(error ? { type: 'err', text: error.message } : { type: 'ok', text: 'Account requested. Confirm your email if asked, then an admin will approve you.' });
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      setMsg(error ? { type: 'err', text: error.message } : { type: 'ok', text: 'If that email exists, a reset link is on its way.' });
    }
    setBusy(false);
  }

  return (
    <div className="login-wrap">
      <div className="login-art">
        <div className="brand-mark big"><Icon name="lock" size={28} /></div>
        <h1>Chiparama Vault</h1>
        <p>One place for the team's logins. Admins decide who sees what, and everyone knows who holds the OTP.</p>
        <ul>
          <li><Icon name="shield" /> Passwords encrypted at rest</li>
          <li><Icon name="share" /> Shared per member or per team</li>
          <li><Icon name="phone" /> Clear 2FA / authenticator ownership</li>
          <li><Icon name="activity" /> Every reveal and copy is logged</li>
        </ul>
      </div>
      <form className="login-card" onSubmit={submit}>
        <h2>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Request access' : 'Reset password'}</h2>
        <p className="muted">{mode === 'signin' ? 'Use your work email.' : mode === 'signup' ? 'An admin approves new accounts.' : 'We will email you a reset link.'}</p>
        {mode === 'signup' && <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>}
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        {mode !== 'reset' && <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></label>}
        {msg && <div className={'note ' + msg.type}>{msg.text}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Request access' : 'Send reset link'}</button>
        <div className="login-links">
          {mode !== 'signin' && <a onClick={() => setMode('signin')}>Back to sign in</a>}
          {mode === 'signin' && <a onClick={() => setMode('signup')}>Request access</a>}
          {mode === 'signin' && <a onClick={() => setMode('reset')}>Forgot password?</a>}
        </div>
      </form>
    </div>
  );
}
