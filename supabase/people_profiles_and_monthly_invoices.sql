-- =====================================================================
-- Chiplabs Workspace · People profiles + monthly invoices
-- Run once in Supabase → SQL editor (project kphlxmvlqyrzrmalthgj).
-- Safe to re-run: everything is "if not exists" / "create or replace".
-- =====================================================================

-- ---------- company details (Bill-to block on every monthly invoice) ----------
update public.inv_company set
  address = E'Ward No. 7, Near Dainik Bharti Press,\nShahdol- 484001, Madhya Pradesh',
  email   = 'finance@chiplabs.tech',
  phone   = '+91 78996-38080',
  website = 'chiplabs.tech',
  pan     = 'AANCC0967A'
where id = 1;

-- ---------- who approves monthly invoices ----------
create table if not exists public.pay_invoice_approvers (
  email text primary key check (email = lower(email))
);
insert into public.pay_invoice_approvers (email) values ('finance@chiplabs.tech'), ('prashant@chiplabs.tech')
  on conflict do nothing;
alter table public.pay_invoice_approvers enable row level security;
drop policy if exists "approvers readable" on public.pay_invoice_approvers;
create policy "approvers readable" on public.pay_invoice_approvers for select to authenticated using (true);

create or replace function public.pay_inv_is_approver()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.pay_invoice_approvers a on a.email = lower(p.email)
    where p.id = auth.uid() and p.active);
$$;

-- ---------- people profiles (self-service details + admin-uploaded offer letter) ----------
create table if not exists public.people_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  full_name text,
  designation text,
  start_date date,
  phone text,
  address text,
  pan text,
  bank_account_name text,
  bank_account_no text,
  bank_ifsc text check (bank_ifsc is null or bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_name text,
  bank_branch text,
  offer_letter_path text,
  offer_letter_name text,
  offer_letter_uploaded_at timestamptz,
  offer_letter_uploaded_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.people_profiles enable row level security;

create or replace function public.people_can_manage()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.inv_is_finance();
$$;

drop policy if exists "people read" on public.people_profiles;
create policy "people read" on public.people_profiles for select to authenticated
  using (user_id = auth.uid() or public.people_can_manage() or public.pay_inv_is_approver() or public.inv_can_view_payroll());
drop policy if exists "people insert" on public.people_profiles;
create policy "people insert" on public.people_profiles for insert to authenticated
  with check ((user_id = auth.uid() and public.is_active_user()) or public.people_can_manage());
drop policy if exists "people update" on public.people_profiles;
create policy "people update" on public.people_profiles for update to authenticated
  using ((user_id = auth.uid() and public.is_active_user()) or public.people_can_manage())
  with check ((user_id = auth.uid() and public.is_active_user()) or public.people_can_manage());

-- only admins / Finance may set the offer letter; normalise IFSC + PAN
create or replace function public.people_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.bank_ifsc := nullif(upper(regexp_replace(coalesce(new.bank_ifsc, ''), '\s', '', 'g')), '');
  new.pan := nullif(upper(regexp_replace(coalesce(new.pan, ''), '\s', '', 'g')), '');
  new.bank_account_no := nullif(regexp_replace(coalesce(new.bank_account_no, ''), '\s', '', 'g'), '');
  if not public.people_can_manage() then
    if tg_op = 'INSERT' then
      new.offer_letter_path := null; new.offer_letter_name := null;
      new.offer_letter_uploaded_at := null; new.offer_letter_uploaded_by := null;
    else
      new.offer_letter_path := old.offer_letter_path; new.offer_letter_name := old.offer_letter_name;
      new.offer_letter_uploaded_at := old.offer_letter_uploaded_at; new.offer_letter_uploaded_by := old.offer_letter_uploaded_by;
    end if;
  elsif new.offer_letter_path is distinct from (case when tg_op = 'UPDATE' then old.offer_letter_path end) then
    new.offer_letter_uploaded_at := case when new.offer_letter_path is null then null else now() end;
    new.offer_letter_uploaded_by := case when new.offer_letter_path is null then null else auth.uid() end;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists people_guard on public.people_profiles;
create trigger people_guard before insert or update on public.people_profiles
  for each row execute function public.people_guard();

grant select, insert, update on public.people_profiles to authenticated;

-- ---------- people can see their own salary record + payouts ----------
drop policy if exists "pay_employees self read" on public.pay_employees;
create policy "pay_employees self read" on public.pay_employees for select to authenticated
  using (profile_id = auth.uid());
drop policy if exists "pay_runs self read" on public.pay_runs;
create policy "pay_runs self read" on public.pay_runs for select to authenticated
  using (exists (select 1 from public.pay_employees e where e.id = employee_id and e.profile_id = auth.uid()));

-- ---------- private storage for offer letters ----------
insert into storage.buckets (id, name, public) values ('hr-docs', 'hr-docs', false)
  on conflict (id) do nothing;
-- path: offer-letters/<user_id>/<file>
drop policy if exists "hr-docs read" on storage.objects;
create policy "hr-docs read" on storage.objects for select to authenticated
  using (bucket_id = 'hr-docs' and ((storage.foldername(name))[2] = auth.uid()::text or public.people_can_manage()));
drop policy if exists "hr-docs insert" on storage.objects;
create policy "hr-docs insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'hr-docs' and public.people_can_manage());
drop policy if exists "hr-docs update" on storage.objects;
create policy "hr-docs update" on storage.objects for update to authenticated
  using (bucket_id = 'hr-docs' and public.people_can_manage());
drop policy if exists "hr-docs delete" on storage.objects;
create policy "hr-docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'hr-docs' and public.people_can_manage());

-- ---------- monthly invoices raised by people ----------
create table if not exists public.pay_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  employee_id uuid references public.pay_employees(id) on delete set null,
  month date not null check (extract(day from month) = 1),
  invoice_number text not null,
  issue_date date not null,
  items jsonb not null default '[]'::jsonb,        -- [{kind:'salary'|'extra', description, amount}]
  total numeric(14,2) not null default 0,
  currency text not null default 'INR',
  payee jsonb not null default '{}'::jsonb,        -- snapshot of the person's details + bank at submission
  bill_to jsonb not null default '{}'::jsonb,      -- snapshot of Chiplabs' details at submission
  notes text,
  status text not null default 'submitted' check (status in ('submitted','approved','rejected','paid','withdrawn')),
  submitted_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_comment text,
  paid_on date,
  payment_ref text,
  pay_run_id uuid,
  payroll_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month),
  unique (user_id, invoice_number)
);
create index if not exists pay_invoices_status_idx on public.pay_invoices (status, month desc);
alter table public.pay_invoices enable row level security;
drop policy if exists "pay_invoices read" on public.pay_invoices;
create policy "pay_invoices read" on public.pay_invoices for select to authenticated
  using (user_id = auth.uid() or public.inv_is_finance() or public.pay_inv_is_approver() or public.inv_can_view_payroll());
-- no direct writes: everything goes through the functions below
grant select on public.pay_invoices to authenticated;

create table if not exists public.pay_invoice_events (
  id bigserial primary key,
  invoice_id uuid not null references public.pay_invoices(id) on delete cascade,
  action text not null,           -- submitted | resubmitted | approved | rejected | withdrawn | paid
  comment text,
  actor uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.pay_invoice_events enable row level security;
drop policy if exists "pay_invoice_events read" on public.pay_invoice_events;
create policy "pay_invoice_events read" on public.pay_invoice_events for select to authenticated
  using (exists (select 1 from public.pay_invoices i where i.id = invoice_id));
grant select on public.pay_invoice_events to authenticated;

-- best-effort notification (never blocks the main action)
create or replace function public.pay_inv_notify(p_user uuid, p_title text, p_body text, p_invoice uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
  values (p_user, 'monthly_invoice', p_title, p_body, 'pay_invoice', p_invoice);
exception when others then
  begin
    insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
    values (p_user, 'invoice_approval', p_title, p_body, 'pay_invoice', p_invoice);
  exception when others then null;
  end;
end $$;

-- the raising window, in India time: 25th → last day of the month
create or replace function public.pay_inv_window()
returns jsonb language sql stable set search_path = '' as $$
  with t as (select (now() at time zone 'Asia/Kolkata')::date d)
  select jsonb_build_object(
    'today', d,
    'month', date_trunc('month', d)::date,
    'opens', (date_trunc('month', d) + interval '24 days')::date,
    'closes', (date_trunc('month', d) + interval '1 month - 1 day')::date,
    'open', extract(day from d) >= 25)
  from t;
$$;

create or replace function public.pay_fy_label(d date)
returns text language sql immutable set search_path = '' as $$
  select case when extract(month from d) >= 4
    then to_char(d, 'YY') || '-' || to_char(d + interval '1 year', 'YY')
    else to_char(d - interval '1 year', 'YY') || '-' || to_char(d, 'YY') end;
$$;

-- lenient number parsing for user-entered amounts ('' / '1,200' / junk)
create or replace function public.pay_num(t text)
returns numeric language plpgsql immutable set search_path = '' as $$
begin
  return nullif(replace(trim(coalesce(t, '')), ',', ''), '')::numeric;
exception when others then return null;
end $$;

-- submit (or resubmit after a rejection / edit while still pending)
create or replace function public.pay_inv_submit(p_extras jsonb default '[]'::jsonb, p_notes text default null, p_items jsonb default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_month date := date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date;
  v_pp public.people_profiles;
  v_emp public.pay_employees;
  v_existing public.pay_invoices;
  v_items jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_x jsonb;
  v_num text;
  v_init text;
  v_seq int;
  v_company jsonb;
  v_id uuid;
begin
  if v_uid is null or not public.is_active_user() then raise exception 'Not signed in'; end if;

  select * into v_existing from public.pay_invoices where user_id = v_uid and month = v_month;
  if v_existing.id is null and extract(day from v_today) < 25 then
    raise exception 'Monthly invoices can be raised from the 25th to the last day of the month (opens %).',
      to_char(v_month + 24, 'DD Mon YYYY');
  end if;
  if v_existing.status in ('approved', 'paid') then
    raise exception 'Your invoice for % is already %.', to_char(v_month, 'FMMonth YYYY'), v_existing.status;
  end if;

  select * into v_pp from public.people_profiles where user_id = v_uid;
  if v_pp.user_id is null or coalesce(trim(v_pp.full_name), '') = '' or coalesce(v_pp.bank_account_no, '') = '' or coalesce(v_pp.bank_ifsc, '') = '' then
    raise exception 'Complete your profile first: full name, bank account number and IFSC are required.';
  end if;

  select * into v_emp from public.pay_employees where profile_id = v_uid and status <> 'exited' order by join_date desc nulls last limit 1;

  -- salary line comes from Salaries (cannot be changed by the person)
  if v_emp.id is not null and coalesce(v_emp.monthly_gross, 0) > 0 then
    v_items := jsonb_build_array(jsonb_build_object('kind', 'salary',
      'description', 'Professional fee / salary for ' || to_char(v_month, 'FMMonth YYYY'),
      'amount', round(v_emp.monthly_gross::numeric, 2)));
    v_total := round(v_emp.monthly_gross::numeric, 2);
  elsif p_items is not null and jsonb_typeof(p_items) = 'array' then
    -- no salary on file: the person enters the main lines
    for v_x in select * from jsonb_array_elements(p_items) loop
      if coalesce(trim(v_x->>'description'), '') = '' or coalesce(public.pay_num(v_x->>'amount'), 0) <= 0 then
        raise exception 'Each line needs a description and an amount above zero.';
      end if;
      v_items := v_items || jsonb_build_array(jsonb_build_object('kind', 'salary', 'description', trim(v_x->>'description'), 'amount', round(public.pay_num(v_x->>'amount'), 2)));
      v_total := v_total + round(public.pay_num(v_x->>'amount'), 2);
    end loop;
  end if;

  -- extra lines (reimbursements etc.)
  if p_extras is not null and jsonb_typeof(p_extras) = 'array' then
    for v_x in select * from jsonb_array_elements(p_extras) loop
      if coalesce(trim(v_x->>'description'), '') = '' and coalesce(public.pay_num(v_x->>'amount'), 0) = 0 then continue; end if;
      if coalesce(trim(v_x->>'description'), '') = '' or coalesce(public.pay_num(v_x->>'amount'), 0) <= 0 then
        raise exception 'Each extra line needs a description and an amount above zero.';
      end if;
      v_items := v_items || jsonb_build_array(jsonb_build_object('kind', 'extra', 'description', trim(v_x->>'description'), 'amount', round(public.pay_num(v_x->>'amount'), 2)));
      v_total := v_total + round(public.pay_num(v_x->>'amount'), 2);
    end loop;
  end if;
  if jsonb_array_length(v_items) = 0 or v_total <= 0 then
    raise exception 'No salary is on file for you yet. Add at least one line with an amount, or ask Finance to set up your salary.';
  end if;

  select jsonb_build_object('legal_name', c.legal_name, 'address', c.address, 'email', c.email, 'phone', c.phone,
                            'website', c.website, 'pan', c.pan, 'gstin', c.gstin)
    into v_company from public.inv_company c where c.id = 1;

  if v_existing.id is not null then
    update public.pay_invoices set
      items = v_items, total = v_total, notes = nullif(trim(coalesce(p_notes, '')), ''),
      employee_id = v_emp.id, currency = coalesce(v_emp.currency, 'INR'),
      payee = to_jsonb(v_pp) - 'offer_letter_path' - 'offer_letter_name' - 'offer_letter_uploaded_at' - 'offer_letter_uploaded_by' - 'updated_at',
      bill_to = coalesce(v_company, '{}'::jsonb),
      issue_date = v_today, status = 'submitted', submitted_at = now(),
      decided_by = null, decided_at = null, decision_comment = null, updated_at = now()
    where id = v_existing.id;
    insert into public.pay_invoice_events (invoice_id, action, actor)
      values (v_existing.id, case when v_existing.status = 'submitted' then 'edited' else 'resubmitted' end, v_uid);
    v_id := v_existing.id;
  else
    v_init := upper(coalesce(nullif(regexp_replace(initcap(v_pp.full_name), '[^A-Z]', '', 'g'), ''), 'XX'));
    select count(*) + 1 into v_seq from public.pay_invoices where user_id = v_uid and public.pay_fy_label(month) = public.pay_fy_label(v_month);
    v_num := v_init || '/' || public.pay_fy_label(v_month) || '/' || lpad(v_seq::text, 2, '0');
    insert into public.pay_invoices (user_id, employee_id, month, invoice_number, issue_date, items, total, currency, payee, bill_to, notes)
    values (v_uid, v_emp.id, v_month, v_num, v_today, v_items, v_total, coalesce(v_emp.currency, 'INR'),
            to_jsonb(v_pp) - 'offer_letter_path' - 'offer_letter_name' - 'offer_letter_uploaded_at' - 'offer_letter_uploaded_by' - 'updated_at',
            coalesce(v_company, '{}'::jsonb), nullif(trim(coalesce(p_notes, '')), ''))
    returning id into v_id;
    insert into public.pay_invoice_events (invoice_id, action, actor) values (v_id, 'submitted', v_uid);
  end if;

  if coalesce(v_existing.status, '') <> 'submitted' then
    perform public.pay_inv_notify(p.id, 'Monthly invoice to approve',
      v_pp.full_name || ' · ' || to_char(v_month, 'FMMonth YYYY') || ' · INR ' || to_char(v_total, 'FM99,99,99,990.00'), v_id)
    from public.profiles p join public.pay_invoice_approvers a on a.email = lower(p.email)
    where p.active and p.id <> v_uid;
  end if;
  return v_id;
end $$;

create or replace function public.pay_inv_withdraw(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.pay_invoices set status = 'withdrawn', updated_at = now()
  where id = p_id and user_id = auth.uid() and status = 'submitted';
  if not found then raise exception 'Only your own pending invoice can be withdrawn.'; end if;
  insert into public.pay_invoice_events (invoice_id, action, actor) values (p_id, 'withdrawn', auth.uid());
end $$;

-- approve / reject (finance@ or prashant@). Approval creates/updates that month's payout in Salaries.
create or replace function public.pay_inv_decide(p_id uuid, p_decision text, p_comment text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v public.pay_invoices;
  v_run uuid;
  v_note text;
begin
  if not public.pay_inv_is_approver() then raise exception 'Only finance@chiplabs.tech or prashant@chiplabs.tech can approve monthly invoices.'; end if;
  select * into v from public.pay_invoices where id = p_id for update;
  if v.id is null then raise exception 'Invoice not found'; end if;
  if v.status <> 'submitted' then raise exception 'This invoice is %, not waiting for approval.', v.status; end if;
  if v.user_id = auth.uid() then raise exception 'You cannot approve your own invoice.'; end if;

  if p_decision = 'reject' then
    if coalesce(trim(p_comment), '') = '' then raise exception 'Add a comment explaining what needs to change.'; end if;
    update public.pay_invoices set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
      decision_comment = trim(p_comment), updated_at = now() where id = p_id;
    insert into public.pay_invoice_events (invoice_id, action, comment, actor) values (p_id, 'rejected', trim(p_comment), auth.uid());
    perform public.pay_inv_notify(v.user_id, 'Monthly invoice sent back', v.invoice_number || ': ' || trim(p_comment), p_id);
    return 'rejected';
  elsif p_decision = 'approve' then
    -- add to Salaries → Monthly payouts (unless that payout is already paid)
    if v.employee_id is not null then
      begin
        insert into public.pay_runs (employee_id, month, gross, deductions, currency, status, notes)
        values (v.employee_id, v.month, v.total, 0, v.currency, 'pending', 'From invoice ' || v.invoice_number)
        on conflict (employee_id, month) do update
          set gross = excluded.gross, notes = excluded.notes
          where public.pay_runs.status <> 'paid'
        returning id into v_run;
        if v_run is null then
          select id into v_run from public.pay_runs where employee_id = v.employee_id and month = v.month;
          v_note := 'That month''s payout was already marked paid, so it was not changed.';
        end if;
      exception when others then
        v_note := 'Could not update Salaries automatically: ' || sqlerrm;
      end;
    else
      v_note := 'No salary record is linked to this person, so no payout was created.';
    end if;
    update public.pay_invoices set status = 'approved', decided_by = auth.uid(), decided_at = now(),
      decision_comment = nullif(trim(coalesce(p_comment, '')), ''), pay_run_id = v_run, payroll_note = v_note, updated_at = now()
    where id = p_id;
    insert into public.pay_invoice_events (invoice_id, action, comment, actor) values (p_id, 'approved', nullif(trim(coalesce(p_comment, '')), ''), auth.uid());
    perform public.pay_inv_notify(v.user_id, 'Monthly invoice approved', v.invoice_number || ' · you can download the approved invoice.', p_id);
    return 'approved';
  else
    raise exception 'Unknown decision %', p_decision;
  end if;
end $$;

-- Finance marks it paid (also marks the payout paid)
create or replace function public.pay_inv_mark_paid(p_id uuid, p_paid_on date default null, p_ref text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.pay_invoices;
begin
  if not public.inv_is_finance() then raise exception 'Only Finance can mark invoices as paid.'; end if;
  select * into v from public.pay_invoices where id = p_id for update;
  if v.status <> 'approved' then raise exception 'Only approved invoices can be marked paid.'; end if;
  update public.pay_invoices set status = 'paid', paid_on = coalesce(p_paid_on, (now() at time zone 'Asia/Kolkata')::date),
    payment_ref = nullif(trim(coalesce(p_ref, '')), ''), updated_at = now() where id = p_id;
  if v.pay_run_id is not null then
    begin
      update public.pay_runs set status = 'paid', paid_on = coalesce(p_paid_on, (now() at time zone 'Asia/Kolkata')::date),
        reference = coalesce(nullif(trim(coalesce(p_ref, '')), ''), reference) where id = v.pay_run_id;
    exception when others then null;
    end;
  end if;
  insert into public.pay_invoice_events (invoice_id, action, comment, actor) values (p_id, 'paid', nullif(trim(coalesce(p_ref, '')), ''), auth.uid());
  perform public.pay_inv_notify(v.user_id, 'Monthly invoice paid', v.invoice_number || ' has been paid.', p_id);
end $$;

revoke all on function public.pay_inv_submit(jsonb, text, jsonb), public.pay_inv_withdraw(uuid),
  public.pay_inv_decide(uuid, text, text), public.pay_inv_mark_paid(uuid, date, text), public.pay_inv_notify(uuid, text, text, uuid) from public, anon;
grant execute on function public.pay_inv_submit(jsonb, text, jsonb), public.pay_inv_withdraw(uuid),
  public.pay_inv_decide(uuid, text, text), public.pay_inv_mark_paid(uuid, date, text),
  public.pay_inv_window(), public.pay_inv_is_approver(), public.people_can_manage() to authenticated;
