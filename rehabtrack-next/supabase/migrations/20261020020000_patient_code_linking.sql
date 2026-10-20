-- Link a confirmed patient/caregiver account to an unclaimed patient record
-- using the patient code shared by the therapist.
create or replace function public.link_current_patient(p_patient_code text)
returns public.patients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_role text;
  v_email_confirmed_at timestamptz;
  v_patient public.patients%rowtype;
  v_code text := upper(trim(coalesce(p_patient_code, '')));
begin
  if v_user_id is null then
    raise exception 'Sign in before linking a patient record.';
  end if;

  select profile.role into v_user_role
  from public.profiles profile
  where profile.id = v_user_id;

  if v_user_role is distinct from 'patient' then
    raise exception 'Only patient or caregiver accounts can link a patient record.';
  end if;

  select account.email_confirmed_at into v_email_confirmed_at
  from auth.users account
  where account.id = v_user_id;

  if v_email_confirmed_at is null then
    raise exception 'Confirm your email before linking a patient record.';
  end if;

  if v_code = '' then
    raise exception 'Enter the patient code provided by your healthcare worker.';
  end if;

  update public.patients patient
  set linked_user_id = v_user_id
  where upper(patient.patient_code) = v_code
    and patient.linked_user_id is null
  returning patient.* into v_patient;

  if not found then
    select patient.* into v_patient
    from public.patients patient
    where upper(patient.patient_code) = v_code
      and patient.linked_user_id = v_user_id;

    if not found then
      raise exception 'That patient code was not found or is already linked to another account.';
    end if;
  end if;

  return v_patient;
end;
$$;

revoke all on function public.link_current_patient(text) from public, anon;
grant execute on function public.link_current_patient(text) to authenticated;

-- Therapist accounts can edit patient details, but only the linking function
-- may change linked_user_id.
revoke update on table public.patients from authenticated;
grant update (full_name, age, contact, emergency_contact, caregiver_name, status)
  on table public.patients to authenticated;
