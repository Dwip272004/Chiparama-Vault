import React from 'react';
import { TWOFA } from '../supabase.js';
import { Icon, Avatar, Empty } from './ui.jsx';
import { Favicon } from './ItemCard.jsx';

export default function TwoFAMap({ ctx }) {
  const withTfa = ctx.items.filter((i) => i.twofa_type !== 'none');
  const unassigned = withTfa.filter((i) => !i.twofa_holder_id);
  const noTfa = ctx.items.filter((i) => i.twofa_type === 'none');
  const holders = {};
  withTfa.filter((i) => i.twofa_holder_id).forEach((i) => {
    (holders[i.twofa_holder_id] ||= { name: i.twofa_holder_name, email: i.twofa_holder_email, items: [] }).items.push(i);
  });

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>2FA / OTP map</h1><p className="muted">Who to ask for the code, at a glance. {withTfa.length} of {ctx.items.length} credentials use 2FA.</p></div>
      </header>

      {unassigned.length > 0 && (
        <div className="banner warn"><Icon name="shield" /><span><b>{unassigned.length}</b> credential{unassigned.length > 1 ? 's have' : ' has'} 2FA but no holder assigned: {unassigned.map((i) => i.title).join(', ')}</span></div>
      )}

      {Object.keys(holders).length === 0 ? <Empty icon="phone" title="No 2FA holders yet">Set a 2FA method and holder when editing a credential.</Empty> : (
        <div className="holder-grid">
          {Object.entries(holders).sort((a, b) => b[1].items.length - a[1].items.length).map(([id, h]) => (
            <div key={id} className="card holder-card">
              <div className="holder-head">
                <Avatar name={h.name || h.email} size={40} />
                <div><b>{h.name}</b><div className="muted small">{h.email}</div></div>
                <span className="count">{h.items.length}</span>
              </div>
              {h.items.map((i) => (
                <div key={i.id} className="holder-item">
                  <Favicon url={i.url} title={i.title} />
                  <div className="grow"><div className="small"><b>{i.title}</b></div><div className="muted xsmall">{TWOFA[i.twofa_type]?.label}{i.twofa_contact ? ' → ' + i.twofa_contact : ''}</div></div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {noTfa.length > 0 && <p className="muted small" style={{ marginTop: 24 }}>Without 2FA: {noTfa.map((i) => i.title).join(', ')}</p>}
    </div>
  );
}
