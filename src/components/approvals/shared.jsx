import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../supabase.js';
import { Icon, Avatar, Modal, useToast } from '../ui.jsx';
import { StatusPill } from '../finance/charts.jsx';
import { timeAgo } from '../../lib.js';

export const ROLE_LABELS = { founder: 'Founder', cofounder: 'Co-founder', cmo: 'CMO', cfo: 'CFO', cto: 'CTO', admin: 'Admin', member: 'Member' };
export const FLOW_LABELS = { client: 'Client invoice', vendor: 'Vendor invoice' };

export const APPROVAL = {
  not_submitted: { label: 'Not submitted', tone: 'neutral' },
  pending: { label: 'In approval', tone: 'info' },
  changes_requested: { label: 'Changes requested', tone: 'warning' },
  approved: { label: 'Approved', tone: 'good' },
};

export function approverNames(stage, profiles) {
  const people = (stage.approver_ids || []).map((id) => profiles.find((p) => p.id === id)).filter(Boolean).map((p) => p.full_name || p.email);
  const roles = (stage.approver_roles || []).map((r) => `any ${ROLE_LABELS[r] || r}`);
  return [...people, ...roles];
}

export function isMyStage(stage, me) {
  if (!stage || !me) return false;
  return (stage.approver_ids || []).includes(me.id) || (stage.approver_roles || []).includes(me.role);
}

// Latest approval request (+ its events) for one invoice
export function useApproval(flow, invoiceId, refreshKey) {
  const [data, setData] = useState({ req: null, events: [], loading: true });
  const load = useCallback(async () => {
    if (!invoiceId) return;
    const { data: reqs } = await supabase.from('apr_requests').select('*').eq('flow', flow).eq('invoice_id', invoiceId).order('submitted_at', { ascending: false }).limit(1);
    const req = reqs?.[0] || null;
    let events = [];
    if (req) {
      const ev = await supabase.from('apr_events').select('*').eq('request_id', req.id).order('id');
      events = ev.data || [];
    }
    setData({ req, events, loading: false });
  }, [flow, invoiceId]);
  useEffect(() => { load(); }, [load, refreshKey]);
  return { ...data, reload: load };
}

export function ApprovalPill({ status, req }) {
  const s = APPROVAL[status] || APPROVAL.not_submitted;
  const stage = req && req.state === 'in_review' ? req.stages?.[req.current_index]?.name : null;
  return <StatusPill tone={s.tone}>{s.label}{stage ? ` · ${stage}` : ''}</StatusPill>;
}

const ACTION_TEXT = {
  submitted: 'submitted for approval', resubmitted: 'resubmitted after changes', approved: 'approved', rejected: 'rejected',
  withdrawn: 'withdrew the request', auto_approved: 'submitted (no stages configured, approved automatically)',
};

// Stage track + history with comments
export function ApprovalTimeline({ req, events, profiles, me }) {
  if (!req) return <p className="muted small">Not submitted for approval yet.</p>;
  const name = (id) => { const p = profiles.find((x) => x.id === id); return p ? p.full_name || p.email : 'Someone'; };
  const stages = req.stages || [];
  const lastApprovalAt = (idx) => [...events].reverse().find((e) => e.stage_index === idx && (e.action === 'approved' || e.action === 'rejected'));
  // After a resubmission, only count decisions made since then
  const since = [...events].reverse().find((e) => e.action === 'resubmitted' || e.action === 'submitted');
  const done = (idx) => {
    if (req.state === 'approved') return true;
    if (req.state === 'withdrawn' || req.state === 'returned') return false;
    return idx < req.current_index;
  };

  return (
    <div className="apr">
      <ol className="apr-track">
        <li className="done"><span className="dot"><Icon name="check" size={12} /></span>
          <div><b>Submitted</b><span>{name(req.submitted_by)} · {timeAgo(req.submitted_at)}</span></div></li>
        {stages.map((s, idx) => {
          const current = req.state === 'in_review' && idx === req.current_index;
          const last = lastApprovalAt(idx);
          const isDone = done(idx);
          const mine = current && isMyStage(s, me);
          return (
            <li key={idx} className={isDone ? 'done' : current ? 'current' : ''}>
              <span className="dot">{isDone ? <Icon name="check" size={12} /> : idx + 1}</span>
              <div>
                <b>{s.name}{mine && <em className="you">Your turn</em>}</b>
                <span>{isDone && last && last.action === 'approved' && last.id > (since?.id ?? 0) ? `Approved by ${name(last.actor)} · ${timeAgo(last.created_at)}` : approverNames(s, profiles).join(', ')}</span>
              </div>
            </li>
          );
        })}
        <li className={req.state === 'approved' ? 'done final' : 'final'}><span className="dot"><Icon name={req.state === 'approved' ? 'check' : 'shield'} size={12} /></span>
          <div><b>{req.state === 'approved' ? 'Approved' : req.state === 'returned' ? 'Sent back to Finance for changes' : req.state === 'withdrawn' ? 'Withdrawn' : 'Final approval'}</b>
            {req.closed_at && <span>{timeAgo(req.closed_at)}</span>}</div></li>
      </ol>

      <h4>History</h4>
      <ul className="apr-log">
        {[...events].reverse().map((e) => (
          <li key={e.id} className={e.action}>
            <Avatar name={name(e.actor)} size={24} />
            <div className="grow">
              <div><b>{name(e.actor)}</b> {ACTION_TEXT[e.action] || e.action}{e.stage_name ? <span className="muted"> at “{e.stage_name}”</span> : null}</div>
              {e.comment && <div className={'apr-comment' + (e.action === 'rejected' ? ' rej' : '')}>{e.comment}</div>}
              <div className="muted xsmall">{new Date(e.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Decision / submission controls shown next to the timeline
export function ApprovalActions({ flow, invoiceId, approvalStatus, req, me, isFinance, stagesConfigured, onDone }) {
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const open = req && ['in_review', 'returned'].includes(req.state) ? req : null;
  const myTurn = open && open.state === 'in_review' && isMyStage(open.stages[open.current_index], me);
  const prevStage = open && open.current_index > 0 ? open.stages[open.current_index - 1]?.name : null;

  async function run(fn, args, ok) {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) return toast(error.message, 'err');
    toast(ok); setComment(''); setConfirm(null); onDone?.();
  }

  if (myTurn) {
    return (
      <div className="apr-box">
        <b>Your decision · {open.stages[open.current_index].name}</b>
        {open.last_action === 'rejected' && open.last_comment && (
          <div className="apr-comment rej"><b>Returned from the next stage:</b> {open.last_comment}</div>
        )}
        <label className="sr-only" htmlFor="apr-c">Comment</label>
        <textarea id="apr-c" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (required to reject)" />
        <div className="apr-btns">
          <button className="btn primary" disabled={busy} onClick={() => run('apr_decide', { p_request: open.id, p_decision: 'approve', p_comment: comment }, open.current_index + 1 >= open.stages.length ? 'Invoice approved' : 'Approved – sent to the next stage')}><Icon name="check" /> Approve</button>
          <button className="btn ghost danger-text" disabled={busy} onClick={() => {
            if (comment.trim().length < 3) return toast('Add a comment explaining why you are rejecting', 'err');
            setConfirm('reject');
          }}><Icon name="x" /> Reject</button>
        </div>
        <p className="muted xsmall">Rejecting sends it back to {prevStage ? `“${prevStage}” for reconsideration` : 'Finance to make changes'}.</p>
        {confirm === 'reject' && (
          <Modal title="Reject this invoice?" onClose={() => setConfirm(null)}
            footer={<><button className="btn ghost" onClick={() => setConfirm(null)}>Cancel</button><button className="btn danger" disabled={busy} onClick={() => run('apr_decide', { p_request: open.id, p_decision: 'reject', p_comment: comment }, 'Rejected and sent back')}>Reject</button></>}>
            <p>It will go back to {prevStage ? <b>{prevStage}</b> : <b>Finance</b>} with your comment:</p>
            <div className="apr-comment rej" style={{ marginTop: 10 }}>{comment}</div>
          </Modal>
        )}
      </div>
    );
  }

  if (isFinance && open?.state === 'returned') {
    return (
      <div className="apr-box warn">
        <b>Sent back for changes</b>
        {open.last_comment && <div className="apr-comment rej">{open.last_comment}</div>}
        <p className="muted small">Edit the invoice if needed, then resubmit. It restarts at the first stage.</p>
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What changed? (optional)" aria-label="Resubmission comment" />
        <div className="apr-btns">
          <button className="btn primary" disabled={busy} onClick={() => run('apr_resubmit', { p_request: open.id, p_comment: comment }, 'Resubmitted for approval')}>Resubmit</button>
          <button className="btn ghost" disabled={busy} onClick={() => run('apr_withdraw', { p_request: open.id, p_comment: comment }, 'Approval request withdrawn')}>Withdraw</button>
        </div>
      </div>
    );
  }

  if (isFinance && !open && approvalStatus !== 'approved') {
    return (
      <div className="apr-box">
        <b>Submit for approval</b>
        {!stagesConfigured && <p className="muted small">No approval stages are set for {FLOW_LABELS[flow].toLowerCase()}s, so it will be approved straight away.</p>}
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Note for approvers (optional)" aria-label="Note for approvers" />
        <button className="btn primary" disabled={busy} onClick={() => run('apr_submit', { p_flow: flow, p_invoice: invoiceId, p_comment: comment }, 'Submitted for approval')}>Submit for approval</button>
      </div>
    );
  }

  if (isFinance && open?.state === 'in_review') {
    return (
      <div className="apr-btns">
        <button className="btn ghost small" disabled={busy} onClick={() => run('apr_withdraw', { p_request: open.id, p_comment: null }, 'Approval request withdrawn')}>Withdraw request</button>
      </div>
    );
  }
  return null;
}
