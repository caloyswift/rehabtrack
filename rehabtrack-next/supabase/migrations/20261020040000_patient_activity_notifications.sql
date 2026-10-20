-- Store patient/caregiver activity details used by the patient dashboard.
alter table public.exercise_records
  add column if not exists difficulty text
    check (difficulty is null or difficulty in ('easy', 'moderate', 'difficult')),
  add column if not exists recorded_as text not null default 'patient'
    check (recorded_as in ('patient', 'caregiver'));

alter table public.condition_logs
  add column if not exists recorded_as text not null default 'patient'
    check (recorded_as in ('patient', 'caregiver'));

-- Patients can create their own in-app reminders, but cannot notify other users.
grant insert on public.notifications to authenticated;
create policy "Linked patients can create their own notifications"
  on public.notifications for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and patient_id is not null
    and exists (
      select 1 from public.patients patient
      where patient.id = notifications.patient_id
        and patient.linked_user_id = (select auth.uid())
    )
  );

-- Notify a linked patient when a healthcare worker assigns a new plan.
create or replace function public.notify_patient_of_new_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient_user_id uuid;
  v_exercise_name text;
begin
  select patient.linked_user_id, exercise.name
  into v_patient_user_id, v_exercise_name
  from public.patients patient
  join public.exercises exercise on exercise.id = new.exercise_id
  where patient.id = new.patient_id;

  if v_patient_user_id is not null then
    insert into public.notifications (user_id, patient_id, type, title, message)
    values (
      v_patient_user_id,
      new.patient_id,
      'new_plan',
      'New rehabilitation plan',
      'Your healthcare worker assigned a new exercise: ' || coalesce(v_exercise_name, 'exercise') || '.'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_patient_of_new_plan() from public, anon, authenticated;
drop trigger if exists notify_patient_of_new_plan on public.rehabilitation_plans;
create trigger notify_patient_of_new_plan
  after insert on public.rehabilitation_plans
  for each row execute procedure public.notify_patient_of_new_plan();
