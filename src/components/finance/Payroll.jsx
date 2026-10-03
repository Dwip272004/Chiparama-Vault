import React, { useMemo, useState } from 'react';
import { supabase } from '../../supabase.js';
import { Icon, Empty, Modal, SearchBox, Avatar, useToast } from '../ui.jsx';
import { StatusPill } from './charts.jsx';
import { fmtINR, fmtDate, toCSV, download } from '../../finance.js';

export const EMP_TYPES = { full_time: 'Full-time', part_time: 'Part-time', intern: 'Intern', contractor: 'Contractor', consultant: 'Consultant' };
const EMP_STATUS = { active: { label: 'Active', tone: 'good' }, notice: { label: 'On notice', tone: 'warning' }, exited: { label: 'Exited', tone: 'neutral' } };
const RUN_STATUS = { pending: { label: 'Pending', tone: 'warning' }, paid: { label: 'Paid', tone: 'good' }, on_hold: { label: 'On hold', tone: 'neutral' } };

const monthStart = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const monthLabel = (m) => new Date(m + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const money = (n, cur = 'INR') => (cur === 'INR' ? fmtINR(n) : `${cur} ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);

export function payrollTotals(employees, runs) {
  const active = employees.filter((e) => e.status !== 'exited');
  const monthly = active.filter((e) => e.currency === 'INR').reduce((s, e) => s + Number(e.monthly_gross), 0);
  const annual = active.filter((e) => e.currency === 'INR').reduce((s, e) => s + Number(e.annual_ctc || e.monthly_gross * 12), 0);
  const cur = monthStart();
  const thisMonth = runs.filter((r) => r.month === cur);
  return {
    headcount: active.length, monthly, annual,
    paidThisMonth: thisMonth.filter((r) => r.status === 'paid').reduce((s, r) => s + Number(r.net), 0),
    pendingThisMonth: thisMonth.filter((r) => r.status !== 'paid').length,
  };
}

export default function Payroll({ ctx }) {
  const { employees, payRuns, isFinance } = ctx.fin;
  const [tab, setTab] = useState('people');
  const t = payrollTotals(employees, payRuns);

  return (
    <>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat"><span className="stat-label">Monthly payroll</span><b className="stat-value">{fmtINR(t.monthly)}</b><span className="stat-sub">{t.headcount} on payroll</span></div>
        <div className="stat"><span className="stat-label">Annual payroll (CTC)</span><b className="stat-value">{fmtINR(t.annual)}</b><span className="stat-sub">Active employees</span></div>
        <div className="stat"><span className="stat-label">Paid in {monthLabel(monthStart()).split(' ')[0]}</span><b className="stat-value">{fmtINR(t.paidThisMonth)}</b><span className="stat-sub">Net, this month</span></div>
        <div className="stat"><span className="stat-label">Pending this month</span><b className="stat-value">{t.pendingThisMonth}</b><span className="stat-sub">{t.pendingThisMonth ? <span className="warn-text">payouts not yet paid</span> : 'All settled'}</span></div>
      </div>
      <div className="seg" role="tablist" aria-label="Payroll" style={{ marginBottom: 14 }}>
        <button role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>Employees</button>
        <button role="tab" aria-selected={tab === 'runs'} className={tab === 'runs' ? 'on' : ''} onClick={() => setTab('runs')}>Monthly payouts</button>
      </div>
      {tab === 'people' ? <Employees ctx={ctx} isFinance={isFinance} /> : <Payouts ctx={ctx} isFinance={isFinance} />}
    </>
  );
}

function Employees({ ctx, isFinance }) {
  const { employees } = ctx.fin;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('current');
  const [form, setForm] = useState(null);
  const [hist, setHist] = useState(null);
  const team = (id) => ctx.teams.find((x) => x.id === id)?.name;

  const rows = employees.filter((e) => {
    if (status === 'current' && e.status === 'exited') return false;
    if (status && status !== 'current' && e.status !== status) return false;
    const s = q.trim().toLowerCase();
    return !s || [e.name, e.designation, team(e.team_id)].some((v) => v && v.toLowerCase().includes(s));
  }).sort((a, b) => a.name.localeCompare(b.name));

  function exportCSV() {
    download('employees-salaries.csv', toCSV(rows, [
      { label: 'Name', get: (e) => e.name }, { label: 'Designation', get: (e) => e.designation }, { label: 'Team', get: (e) => team(e.team_id) },
      { label: 'Type', get: (e) => EMP_TYPES[e.employment_type] }, { label: 'Join date', get: (e) => e.join_date }, { label: 'Exit date', get: (e) => e.exit_date },
      { label: 'Status', get: (e) => e.status }, { label: 'Currency', get: (e) => e.currency }, { label: 'Monthly gross', get: (e) => e.monthly_gross },
      { label: 'Annual CTC', get: (e) => e.annual_ctc || e.monthly_gross * 12 }, { label: 'Pay day', get: (e) => e.pay_day },
    ]));
  }

  return (
    <>
      <div className="toolbar">
        <div className="filters">
          <SearchBox value={q} onChange={setQ} placeholder="Search name, designation, team" label="Search employees" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="current">Active & on notice</option><option value="">Everyone</option>
            {Object.entries(EMP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={exportCSV}><Icon name="download" /> CSV</button>
          {isFinance && <button className="btn primary" onClick={() => setForm('new')}><Icon name="plus" /> Add employee</button>}
        </div>
      </div>
      {rows.length === 0 ? <Empty icon="users" title={employees.length ? 'No employees match' : 'No employees on payroll yet'}>{!employees.length && isFinance ? 'Add employees with their monthly salary, then generate monthly payouts.' : null}</Empty> : (
        <div className="table-wrap">
          <table className="table fin">
            <thead><tr><th scope="col">Employee</th><th scope="col">Type</th><th scope="col">Joined</th><th scope="col" className="num">Monthly gross</th><th scope="col" className="num">Annual CTC</th><th scope="col">Pay day</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td><div className="cell-title"><Avatar name={e.name} size={26} /><div><b>{e.name}</b><div className="muted xsmall">{[e.designation, team(e.team_id)].filter(Boolean).join(' · ') || '—'}</div></div></div></td>
                  <td className="small">{EMP_TYPES[e.employment_type]}</td>
                  <td className="small nowrap">{fmtDate(e.join_date)}{e.exit_date && <div className="muted xsmall">Exit {fmtDate(e.exit_date)}</div>}</td>
                  <td className="num"><b>{money(e.monthly_gross, e.currency)}</b></td>
                  <td className="num">{money(e.annual_ctc || e.monthly_gross * 12, e.currency)}</td>
                  <td className="small">{ordinal(e.pay_day)}</td>
                  <td><StatusPill tone={EMP_STATUS[e.status].tone}>{EMP_STATUS[e.status].label}</StatusPill></td>
                  <td className="row-actions">
                    <button className="icon-btn" title="Salary history" aria-label={`Salary history for ${e.name}`} onClick={() => setHist(e)}><Icon name="activity" /></button>
                    {isFinance && <button className="icon-btn" title="Edit" aria-label={`Edit ${e.name}`} onClick={() => setForm(e)}><Icon name="edit" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && <EmployeeForm ctx={ctx} emp={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {hist && <SalaryHistory ctx={ctx} emp={hist} onClose={() => setHist(null)} />}
    </>
  );
}

const ordinal = (n) => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10] || 'th'} of month`;

function EmployeeForm({ ctx, emp, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({
    profile_id: emp?.profile_id || '', name: emp?.name || '', designation: emp?.designation || '', team_id: emp?.team_id || '',
    employment_type: emp?.employment_type || 'full_time', join_date: emp?.join_date || '', exit_date: emp?.exit_date || '', status: emp?.status || 'active',
    monthly_gross: emp?.monthly_gross ?? '', annual_ctc: emp?.annual_ctc ?? '', currency: emp?.currency || 'INR', pay_day: emp?.pay_day ?? 1, notes: emp?.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const linked = new Set(ctx.fin.employees.filter((x) => x.profile_id && x.id !== emp?.id).map((x) => x.profile_id));

  function pickProfile(id) {
    const p = ctx.profiles.find((x) => x.id === id);
    const tm = ctx.teamMembers.find((x) => x.user_id === id);
    setF((s) => ({ ...s, profile_id: id, name: s.name || p?.full_name || '', team_id: s.team_id || tm?.team_id || '' }));
  }
  async function save() {
    if (!f.name.trim()) return toast('Name is required', 'err');
    if (f.monthly_gross === '' || Number(f.monthly_gross) < 0) return toast('Enter the monthly gross salary', 'err');
    setBusy(true);
    const row = {
      ...f, name: f.name.trim(), profile_id: f.profile_id || null, team_id: f.team_id || null, join_date: f.join_date || null,
      exit_date: f.exit_date || null, monthly_gross: Number(f.monthly_gross), annual_ctc: f.annual_ctc === '' ? null : Number(f.annual_ctc),
      pay_day: Math.min(31, Math.max(1, Number(f.pay_day) || 1)),
      status: f.exit_date && f.exit_date < new Date().toISOString().slice(0, 10) ? 'exited' : f.status,
    };
    const { error } = emp ? await supabase.from('pay_employees').update(row).eq('id', emp.id) : await supabase.from('pay_employees').insert(row);
    setBusy(false);
    if (error) return toast(error.message, 'err');
    toast(emp ? 'Employee updated' : 'Employee added'); ctx.fin.reload(); onClose();
  }
  async function remove() {
    const { error } = await supabase.from('pay_employees').delete().eq('id', emp.id);
    if (error) return toast(error.message, 'err');
    toast('Employee removed'); ctx.fin.reload(); onClose();
  }

  return (
    <Modal title={emp ? `Edit · ${emp.name}` : 'Add employee'} onClose={onClose} wide
      footer={<>
        {emp && <button className="btn ghost danger-text" style={{ marginRight: 'auto' }} onClick={() => setDel(true)}><Icon name="trash" /> Remove</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Save</button></>}>
      <div className="form-grid three">
        <label>Workspace member (optional)
          <select value={f.profile_id} onChange={(e) => pickProfile(e.target.value)}>
            <option value="">Not linked</option>
            {ctx.profiles.filter((p) => p.active && !linked.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </label>
        <label className="span2">Full name<input value={f.name} onChange={set('name')} autoFocus /></label>
        <label>Designation<input value={f.designation} onChange={set('designation')} placeholder="e.g. Talent Acquisition Lead" /></label>
        <label>Team<select value={f.team_id} onChange={set('team_id')}><option value="">—</option>{ctx.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Employment type<select value={f.employment_type} onChange={set('employment_type')}>{Object.entries(EMP_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      <div className="section-box">
        <div className="section-title"><Icon name="card" /> Salary</div>
        <div className="form-grid three">
          <label>Monthly gross<input type="number" min="0" step="1" value={f.monthly_gross} onChange={set('monthly_gross')} /></label>
          <label>Annual CTC <span className="muted xsmall">(blank = 12 × monthly)</span><input type="number" min="0" step="1" value={f.annual_ctc} onChange={set('annual_ctc')} placeholder={f.monthly_gross ? String(Number(f.monthly_gross) * 12) : ''} /></label>
          <label>Currency<select value={f.currency} onChange={set('currency')}>{['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED'].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Pay day<input type="number" min="1" max="31" value={f.pay_day} onChange={set('pay_day')} /></label>
          <label>Joined on<input type="date" value={f.join_date} onChange={set('join_date')} /></label>
          <label>Status<select value={f.status} onChange={set('status')}>{Object.entries(EMP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <label>Last working day<input type="date" value={f.exit_date} onChange={set('exit_date')} /></label>
          <label className="span2">Notes<input value={f.notes} onChange={set('notes')} placeholder="Optional (e.g. variable pay, increment due in April)" /></label>
        </div>
        <p className="muted xsmall" style={{ marginTop: 8 }}>Salary changes are recorded in the employee's salary history automatically. Totals in the overview use INR salaries.</p>
      </div>
      {del && (
        <Modal title={`Remove ${emp.name}?`} onClose={() => setDel(false)}
          footer={<><button className="btn ghost" onClick={() => setDel(false)}>Cancel</button><button className="btn danger" onClick={remove}>Remove permanently</button></>}>
          <p>This deletes the employee, their salary history and all their payout records. To keep records, set the status to <b>Exited</b> instead.</p>
        </Modal>
      )}
    </Modal>
  );
}

function SalaryHistory({ ctx, emp, onClose }) {
  const [rows, setRows] = useState(null);
  React.useEffect(() => {
    supabase.from('pay_salary_history').select('*').eq('employee_id', emp.id).order('id', { ascending: false }).then(({ data }) => setRows(data || []));
  }, [emp.id]);
  const who = (id) => ctx.profiles.find((p) => p.id === id)?.full_name || '—';
  return (
    <Modal title={`Salary history · ${emp.name}`} onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Close</button>}>
      {rows === null ? <div className="pad"><div className="spinner" /></div> : rows.length === 0 ? <p className="muted">No changes recorded.</p> : (
        <div className="list">
          {rows.map((r, i) => {
            const prev = rows[i + 1];
            const diff = prev ? Number(r.monthly_gross) - Number(prev.monthly_gross) : null;
            return (
              <div key={r.id} className="list-row">
                <div className="grow"><b>{money(r.monthly_gross, emp.currency)}</b> / month{r.annual_ctc ? <span className="muted"> · CTC {money(r.annual_ctc, emp.currency)}</span> : null}
                  <div className="muted xsmall">From {fmtDate(r.effective_from)} · by {who(r.changed_by)}</div></div>
                {diff !== null && diff !== 0 && <span className={'tag' + (diff > 0 ? ' blue' : '')}>{diff > 0 ? '+' : ''}{prev && Number(prev.monthly_gross) ? ((diff / Number(prev.monthly_gross)) * 100).toFixed(1) : '—'}%</span>}
                {i === rows.length - 1 && <span className="tag">Starting salary</span>}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function Payouts({ ctx, isFinance }) {
  const toast = useToast();
  const { employees, payRuns } = ctx.fin;
  const months = useMemo(() => {
    const set = new Set(payRuns.map((r) => r.month)); set.add(monthStart());
    return [...set].sort().reverse();
  }, [payRuns]);
  const [month, setMonth] = useState(monthStart());
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const emp = (id) => employees.find((e) => e.id === id);
  const rows = payRuns.filter((r) => r.month === month).sort((a, b) => (emp(a.employee_id)?.name || '').localeCompare(emp(b.employee_id)?.name || ''));
  const sum = (k, st) => rows.filter((r) => !st || r.status === st).reduce((s, r) => s + (r.currency === 'INR' ? Number(r[k]) : 0), 0);

  async function generate() {
    setBusy(true);
    const { data, error } = await supabase.rpc('pay_generate_month', { p_month: month });
    setBusy(false);
    if (error) return toast(error.message, 'err');
    toast(data ? `${data} payout${data > 1 ? 's' : ''} added for ${monthLabel(month)}` : 'Everyone already has a payout for this month');
    ctx.fin.reload();
  }
  async function markPaid(ids) {
    if (!ids.length) return;
    const { error } = await supabase.from('pay_runs').update({ status: 'paid' }).in('id', ids);
    if (error) return toast(error.message, 'err');
    toast(ids.length > 1 ? `${ids.length} payouts marked paid` : 'Marked paid'); ctx.fin.reload();
  }
  function exportCSV() {
    download(`payroll-${month.slice(0, 7)}.csv`, toCSV(rows, [
      { label: 'Employee', get: (r) => emp(r.employee_id)?.name }, { label: 'Month', get: (r) => r.month.slice(0, 7) }, { label: 'Currency', get: (r) => r.currency },
      { label: 'Gross', get: (r) => r.gross }, { label: 'Deductions', get: (r) => r.deductions }, { label: 'Net', get: (r) => r.net },
      { label: 'Status', get: (r) => r.status }, { label: 'Paid on', get: (r) => r.paid_on }, { label: 'Reference', get: (r) => r.reference },
    ]));
  }

  return (
    <>
      <div className="toolbar">
        <div className="filters">
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <span className="muted small">Gross <b className="ink">{fmtINR(sum('gross'))}</b> · Net <b className="ink">{fmtINR(sum('net'))}</b> · Paid <b className="ink">{fmtINR(sum('net', 'paid'))}</b></span>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={exportCSV} disabled={!rows.length}><Icon name="download" /> CSV</button>
          {isFinance && <button className="btn ghost" disabled={busy} onClick={generate}><Icon name="plus" /> Generate {monthLabel(month).split(' ')[0]} payouts</button>}
          {isFinance && rows.some((r) => r.status === 'pending') && <button className="btn primary" onClick={() => markPaid(rows.filter((r) => r.status === 'pending').map((r) => r.id))}><Icon name="check" /> Mark all pending paid</button>}
        </div>
      </div>
      {rows.length === 0 ? (
        <Empty icon="calendar" title={`No payouts for ${monthLabel(month)}`}>{isFinance ? 'Use “Generate payouts” to create one for every employee on payroll this month, using their current salary.' : 'Finance hasn’t recorded payouts for this month yet.'}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col">Employee</th><th scope="col" className="num">Gross</th><th scope="col" className="num">Deductions</th><th scope="col" className="num">Net pay</th><th scope="col">Status</th><th scope="col">Paid on / ref.</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const e = emp(r.employee_id);
                return (
                  <tr key={r.id}>
                    <td><div className="cell-title"><Avatar name={e?.name || '?'} size={24} /><div><b>{e?.name || 'Removed employee'}</b><div className="muted xsmall">{e?.designation || ''}{e ? ` · pay day ${e.pay_day}` : ''}</div></div></div></td>
                    <td className="num">{money(r.gross, r.currency)}</td>
                    <td className="num muted">{Number(r.deductions) ? money(r.deductions, r.currency) : '—'}</td>
                    <td className="num"><b>{money(r.net, r.currency)}</b></td>
                    <td><StatusPill tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</StatusPill></td>
                    <td className="small">{r.paid_on ? fmtDate(r.paid_on) : '—'}{r.reference && <div className="muted xsmall">{r.reference}</div>}</td>
                    <td className="row-actions">
                      {isFinance && r.status !== 'paid' && <button className="btn small ghost" onClick={() => markPaid([r.id])}>Mark paid</button>}
                      {isFinance && <button className="icon-btn" title="Edit payout" aria-label={`Edit payout for ${e?.name}`} onClick={() => setEdit(r)}><Icon name="edit" /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {edit && <PayoutForm ctx={ctx} run={edit} name={emp(edit.employee_id)?.name} onClose={() => setEdit(null)} />}
    </>
  );
}

function PayoutForm({ ctx, run, name, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ gross: run.gross, deductions: run.deductions || '', status: run.status, paid_on: run.paid_on || '', reference: run.reference || '', notes: run.notes || '' });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function save() {
    const { error } = await supabase.from('pay_runs').update({
      gross: Number(f.gross) || 0, deductions: Number(f.deductions) || 0, status: f.status,
      paid_on: f.status === 'paid' ? f.paid_on || null : null, reference: f.reference || null, notes: f.notes || null,
    }).eq('id', run.id);
    if (error) return toast(error.message, 'err');
    toast('Payout updated'); ctx.fin.reload(); onClose();
  }
  async function remove() {
    const { error } = await supabase.from('pay_runs').delete().eq('id', run.id);
    if (error) return toast(error.message, 'err');
    toast('Payout removed'); ctx.fin.reload(); onClose();
  }
  const net = (Number(f.gross) || 0) - (Number(f.deductions) || 0);
  return (
    <Modal title={`${name} · ${monthLabel(run.month)}`} onClose={onClose}
      footer={<><button className="btn ghost danger-text" style={{ marginRight: 'auto' }} onClick={remove}>Remove</button><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="form-grid">
        <label>Gross<input type="number" min="0" value={f.gross} onChange={set('gross')} /></label>
        <label>Deductions <span className="muted xsmall">(TDS, PF, PT…)</span><input type="number" min="0" value={f.deductions} onChange={set('deductions')} placeholder="0" /></label>
        <div className="span2 muted small">Net pay: <b className="ink">{money(net, run.currency)}</b></div>
        <label>Status<select value={f.status} onChange={set('status')}>{Object.entries(RUN_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        {f.status === 'paid' && <label>Paid on<input type="date" value={f.paid_on} onChange={set('paid_on')} /></label>}
        <label className={f.status === 'paid' ? '' : ''}>Transfer reference<input value={f.reference} onChange={set('reference')} placeholder="UTR / batch no." /></label>
        <label>Notes<input value={f.notes} onChange={set('notes')} /></label>
      </div>
    </Modal>
  );
}
