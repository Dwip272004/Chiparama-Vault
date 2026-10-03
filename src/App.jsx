import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, ADMIN_ROLES } from './supabase.js';
import { ToastProvider, Icon, Avatar, RoleBadge, Modal, useToast } from './components/ui.jsx';
import Login from './components/Login.jsx';
import Vault from './components/Vault.jsx';
import AdminItems from './components/AdminItems.jsx';
import Members from './components/Members.jsx';
import TwoFAMap from './components/TwoFAMap.jsx';
import Activity from './components/Activity.jsx';
import Overview from './components/finance/Overview.jsx';
import Subscriptions from './components/finance/Subscriptions.jsx';
import Invoices from './components/finance/Invoices.jsx';
import ClientInvoices, { outStatus } from './components/finance/ClientInvoices.jsx';
import { invStatus } from './finance.js';
import Approvals from './components/approvals/Approvals.jsx';
import ApprovalStages from './components/approvals/ApprovalStages.jsx';
import NotificationBell from './components/Notifications.jsx';

export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="center-screen" aria-busy="true"><div className="spinner" role="status" aria-label="Loading" /></div>;
  return <ToastProvider>{session ? <Shell session={session} /> : <Login />}</ToastProvider>;
}

function Shell({ session }) {
  const [me, setMe] = useState(null);
  const [data, setData] = useState({ items: [], profiles: [], teams: [], teamMembers: [], access: [] });
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fin, setFin] = useState({ canView: false, isFinance: false, subs: [], invoices: [], clientInvoices: [], clients: [], company: {} });

  const isAdmin = !!me && me.active && ADMIN_ROLES.includes(me.role);
  const [apr, setApr] = useState({ stages: [], queue: [], isApprover: false });
  const [aprOpen, setAprOpen] = useState(null);
  const loadApr = useCallback(async () => {
    const [stages, queue, isApprover] = await Promise.all([
      supabase.from('apr_stages').select('*').order('position'),
      supabase.rpc('apr_my_queue'),
      supabase.rpc('apr_is_any_approver'),
    ]);
    setApr({ stages: stages.data || [], queue: queue.data || [], isApprover: !!isApprover.data });
    return queue.data || [];
  }, []);

  const load = useCallback(async () => {
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    setMe(prof);
    if (!prof?.active) { setLoading(false); return; }
    const [items, profiles, teams, teamMembers, access] = await Promise.all([
      supabase.rpc('pm_my_items'),
      supabase.from('profiles').select('id, full_name, email, role, active, created_at').order('full_name'),
      supabase.from('teams').select('id, name').order('name'),
      supabase.from('team_members').select('team_id, user_id'),
      supabase.from('pm_access').select('*'),
    ]);
    setData({
      items: items.data || [], profiles: profiles.data || [], teams: teams.data || [],
      teamMembers: teamMembers.data || [], access: access.data || [],
    });
    const [f, q] = await Promise.all([loadFin(), loadApr()]);
    setView((v) => v || (q?.length ? 'approvals' : f.canView && !(items.data || []).length ? 'spend' : 'vault'));
    setLoading(false);
  }, [session.user.id]); // eslint-disable-line

  const loadFin = useCallback(async () => {
    const [{ data: canView }, { data: isFinance }] = await Promise.all([supabase.rpc('inv_can_view'), supabase.rpc('inv_is_finance')]);
    let next = { canView: !!canView, isFinance: !!isFinance, subs: [], invoices: [], clientInvoices: [], clients: [], company: {} };
    if (canView) {
      const [subs, invoices, ci, clients, company] = await Promise.all([
        supabase.from('inv_subscriptions').select('*').order('platform'),
        supabase.from('inv_invoices').select('*').order('invoice_date', { ascending: false }),
        supabase.from('inv_client_invoices').select('*').order('issue_date', { ascending: false }).order('invoice_number', { ascending: false }),
        supabase.from('inv_clients').select('*').order('name'),
        supabase.from('inv_company').select('*').eq('id', 1).maybeSingle(),
      ]);
      next = { ...next, subs: subs.data || [], invoices: invoices.data || [], clientInvoices: ci.data || [], clients: clients.data || [], company: company.data || {} };
    }
    setFin(next);
    return next;
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
      const t = e.target;
      if (t.closest('input, textarea, select, [contenteditable=true], [role=dialog]')) return;
      const box = document.querySelector('[data-search]');
      if (box) { e.preventDefault(); box.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loading) return <div className="center-screen" aria-busy="true"><div className="spinner" role="status" aria-label="Loading" /></div>;

  if (!me || !me.active) {
    return (
      <div className="center-screen">
        <div className="card pending">
          <div className="brand-mark big">C</div>
          <h2>Account pending approval</h2>
          <p><b>{session.user.email}</b> is registered but not yet activated. An administrator will approve it shortly; you'll then see the credentials shared with you.</p>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}><Icon name="logout" /> Sign out</button>
        </div>
      </div>
    );
  }

  const pendingCount = data.profiles.filter((p) => !p.active).length;
  const unpaid = fin.invoices.filter((i) => invStatus(i) === 'overdue').length;
  const clientOverdue = fin.clientInvoices.filter((i) => outStatus(i) === 'overdue').length;
  const nav = [
    { id: 'vault', label: 'Passwords', icon: 'lock', count: data.items.length },
    ...(isAdmin ? [
      { section: 'Administration' },
      { id: 'items', label: 'Manage logins', icon: 'key' },
      { id: 'members', label: 'Members', icon: 'users', count: pendingCount || null, alert: pendingCount > 0 },
      { id: 'twofa', label: '2FA holders', icon: 'phone' },
      { id: 'activity', label: 'Activity log', icon: 'activity' },
      { id: 'stages', label: 'Approval stages', icon: 'shield' },
    ] : []),
    { section: 'Approvals' },
    { id: 'approvals', label: 'Invoice approvals', icon: 'check', count: apr.queue.length || null, alert: apr.queue.length > 0 },
    ...(fin.canView ? [
      { section: 'Finance' },
      { id: 'spend', label: 'Overview', icon: 'chart' },
      { id: 'billing', label: 'Client invoices', icon: 'file', count: clientOverdue || null, alert: clientOverdue > 0 },
      { id: 'subs', label: 'Subscriptions', icon: 'card', count: fin.subs.filter((s) => ['active', 'trial'].includes(s.status)).length || null },
      { id: 'invoices', label: 'Vendor invoices', icon: 'receipt', count: unpaid || null, alert: unpaid > 0 },
    ] : []),
  ];

  const openApproval = (id) => { setAprOpen(id || null); setView('approvals'); };
  const ctx = { me, isAdmin, ...data, reload: load, fin: { ...fin, reload: loadFin }, apr: { ...apr, reload: loadApr } };

  return (
    <div className="layout">
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className="sidebar" aria-label="Primary">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">C</div>
          <div className="grow"><b>Chiplabs</b><span>Workspace</span></div>
          <NotificationBell ctx={ctx} onOpenApproval={openApproval} />
        </div>
        <nav aria-label="Main navigation">
          {nav.map((n, i) => n.section
            ? <div key={i} className="nav-section" role="presentation">{n.section}</div>
            : (
              <button key={n.id} className={'nav-item' + (view === n.id ? ' active' : '')} aria-current={view === n.id ? 'page' : undefined}
                onClick={() => { setView(n.id); document.getElementById('main')?.focus(); }} title={n.label}>
                <Icon name={n.icon} /> <span>{n.label}</span>
                {n.count != null && <em className={n.alert ? 'alert' : ''} aria-label={n.alert ? `${n.count} need attention` : `${n.count} items`}>{n.count}</em>}
              </button>
            ))}
        </nav>
        <AccountMenu me={me} email={session.user.email} />
      </aside>
      <main className="main" id="main" tabIndex={-1}>
        {apr.queue.length > 0 && view !== 'approvals' && (
          <div className="action-banner" role="status">
            <Icon name="bell" />
            <span><b>{apr.queue.length} invoice{apr.queue.length > 1 ? 's are' : ' is'} waiting for your approval.</b> {apr.queue.slice(0, 2).map((r) => r.invoice_label.split(' · ')[0]).join(', ')}{apr.queue.length > 2 ? '…' : ''}</span>
            <button className="btn small primary" onClick={() => openApproval(apr.queue.length === 1 ? apr.queue[0].id : null)}>Review now</button>
          </div>
        )}
        {view === 'vault' && <Vault ctx={ctx} />}
        {isAdmin && view === 'items' && <AdminItems ctx={ctx} />}
        {isAdmin && view === 'members' && <Members ctx={ctx} />}
        {isAdmin && view === 'twofa' && <TwoFAMap ctx={ctx} />}
        {isAdmin && view === 'activity' && <Activity ctx={ctx} />}
        {isAdmin && view === 'stages' && <ApprovalStages ctx={ctx} />}
        {view === 'approvals' && <Approvals ctx={ctx} openId={aprOpen} onOpened={() => setAprOpen(null)} />}
        {fin.canView && view === 'spend' && <Overview ctx={ctx} go={setView} />}
        {fin.canView && view === 'subs' && <Subscriptions ctx={ctx} />}
        {fin.canView && view === 'invoices' && <Invoices ctx={ctx} />}
        {fin.canView && view === 'billing' && <ClientInvoices ctx={ctx} />}
      </main>
    </div>
  );
}

function AccountMenu({ me, email }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    ref.current?.querySelector('.menu button')?.focus();
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const roleLabel = { cofounder: 'Co-founder', cmo: 'CMO', cfo: 'CFO', cto: 'CTO' }[me.role] || me.role[0].toUpperCase() + me.role.slice(1);
  return (
    <div className="me" ref={ref}>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head"><b>{me.full_name || email}</b><span>{email}</span></div>
          <button role="menuitem" onClick={() => { setOpen(false); setPw(true); }}><Icon name="key" /> Change password</button>
          <button role="menuitem" onClick={() => supabase.auth.signOut()}><Icon name="logout" /> Sign out</button>
        </div>
      )}
      <button className="me-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Avatar name={me.full_name || me.email} size={30} />
        <span className="me-info"><b>{me.full_name || me.email}</b><span>{roleLabel}</span></span>
        <Icon name="chevronUp" />
      </button>
      {pw && <ChangePassword onClose={() => setPw(false)} />}
    </div>
  );
}

function ChangePassword({ onClose }) {
  const toast = useToast();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save(e) {
    e?.preventDefault();
    if (a.length < 8) return setErr('Use at least 8 characters.');
    if (a !== b) return setErr('The two passwords do not match.');
    setBusy(true); setErr('');
    const { error } = await supabase.auth.updateUser({ password: a });
    setBusy(false);
    if (error) return setErr(error.message);
    toast('Password updated');
    onClose();
  }
  return (
    <Modal title="Change password" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Update password'}</button></>}>
      <form className="form-grid one" onSubmit={save}>
        <label>New password<input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} autoFocus /></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></label>
        {err && <div className="note err" role="alert">{err}</div>}
        <p className="muted small">At least 8 characters. Avoid passwords you use elsewhere.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
