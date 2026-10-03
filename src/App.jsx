import React, { useCallback, useEffect, useState } from 'react';
import { supabase, ADMIN_ROLES } from './supabase.js';
import { ToastProvider, Icon, Avatar, RoleBadge } from './components/ui.jsx';
import Login from './components/Login.jsx';
import Vault from './components/Vault.jsx';
import AdminItems from './components/AdminItems.jsx';
import Members from './components/Members.jsx';
import TwoFAMap from './components/TwoFAMap.jsx';
import Activity from './components/Activity.jsx';
import Overview from './components/finance/Overview.jsx';
import Subscriptions from './components/finance/Subscriptions.jsx';
import Invoices from './components/finance/Invoices.jsx';
import { invStatus } from './finance.js';

export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="center-screen"><div className="spinner" /></div>;
  return <ToastProvider>{session ? <Shell session={session} /> : <Login />}</ToastProvider>;
}

function Shell({ session }) {
  const [me, setMe] = useState(null);
  const [data, setData] = useState({ items: [], profiles: [], teams: [], teamMembers: [], access: [] });
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fin, setFin] = useState({ canView: false, isFinance: false, subs: [], invoices: [] });

  const isAdmin = !!me && me.active && ADMIN_ROLES.includes(me.role);

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
    const f = await loadFin();
    setView((v) => v || (f.canView && !(items.data || []).length ? 'spend' : 'vault'));
    setLoading(false);
  }, [session.user.id]); // eslint-disable-line

  const loadFin = useCallback(async () => {
    const [{ data: canView }, { data: isFinance }] = await Promise.all([supabase.rpc('inv_can_view'), supabase.rpc('inv_is_finance')]);
    let next = { canView: !!canView, isFinance: !!isFinance, subs: [], invoices: [] };
    if (canView) {
      const [subs, invoices] = await Promise.all([
        supabase.from('inv_subscriptions').select('*').order('platform'),
        supabase.from('inv_invoices').select('*').order('invoice_date', { ascending: false }),
      ]);
      next = { ...next, subs: subs.data || [], invoices: invoices.data || [] };
    }
    setFin(next);
    return next;
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="center-screen"><div className="spinner" /></div>;

  if (!me || !me.active) {
    return (
      <div className="center-screen">
        <div className="card pending">
          <div className="brand-mark big"><Icon name="lock" size={26} /></div>
          <h2>Waiting for approval</h2>
          <p>Your account <b>{session.user.email}</b> has been created. An admin needs to approve it before you can see any shared credentials.</p>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}><Icon name="logout" /> Sign out</button>
        </div>
      </div>
    );
  }

  const pendingCount = data.profiles.filter((p) => !p.active).length;
  const unpaid = fin.invoices.filter((i) => invStatus(i) === 'overdue').length;
  const nav = [
    { id: 'vault', label: 'My Vault', icon: 'lock', count: data.items.length },
    ...(isAdmin ? [
      { section: 'Admin' },
      { id: 'items', label: 'Credentials', icon: 'key' },
      { id: 'members', label: 'Members', icon: 'users', count: pendingCount || null, alert: pendingCount > 0 },
      { id: 'twofa', label: '2FA / OTP map', icon: 'phone' },
      { id: 'activity', label: 'Activity log', icon: 'activity' },
    ] : []),
    ...(fin.canView ? [
      { section: 'Finance' },
      { id: 'spend', label: 'Spend overview', icon: 'chart' },
      { id: 'subs', label: 'Subscriptions', icon: 'card', count: fin.subs.filter((s) => ['active', 'trial'].includes(s.status)).length || null },
      { id: 'invoices', label: 'Invoices', icon: 'receipt', count: unpaid || null, alert: unpaid > 0 },
    ] : []),
  ];

  const ctx = { me, isAdmin, ...data, reload: load, fin: { ...fin, reload: loadFin } };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Icon name="lock" size={18} /></div>
          <div><b>Chiparama</b><span>Vault</span></div>
        </div>
        <nav>
          {nav.map((n, i) => n.section
            ? <div key={i} className="nav-section">{n.section}</div>
            : (
              <button key={n.id} className={'nav-item' + (view === n.id ? ' active' : '')} onClick={() => setView(n.id)}>
                <Icon name={n.icon} /> <span>{n.label}</span>
                {n.count != null && <em className={n.alert ? 'alert' : ''}>{n.count}</em>}
              </button>
            ))}
        </nav>
        <div className="me">
          <Avatar name={me.full_name || me.email} size={34} />
          <div className="me-info">
            <b>{me.full_name || me.email}</b>
            <RoleBadge role={me.role} />
          </div>
          <button className="icon-btn" title="Sign out" onClick={() => supabase.auth.signOut()}><Icon name="logout" /></button>
        </div>
      </aside>
      <main className="main">
        {view === 'vault' && <Vault ctx={ctx} />}
        {isAdmin && view === 'items' && <AdminItems ctx={ctx} />}
        {isAdmin && view === 'members' && <Members ctx={ctx} />}
        {isAdmin && view === 'twofa' && <TwoFAMap ctx={ctx} />}
        {isAdmin && view === 'activity' && <Activity ctx={ctx} />}
        {fin.canView && view === 'spend' && <Overview ctx={ctx} go={setView} />}
        {fin.canView && view === 'subs' && <Subscriptions ctx={ctx} />}
        {fin.canView && view === 'invoices' && <Invoices ctx={ctx} />}
      </main>
    </div>
  );
}
