-- RehabTrack core schema. Run through Supabase migrations or SQL Editor.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'patient' check (role in ('patient', 'therapist')),
  created_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  patient_code text not null unique default ('PAT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  full_name text not null,
  age integer check (age is null or age between 0 and 130),
  contact text not null default '',
  emergency_contact text not null default '',
  caregiver_name text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive', 'discharged')),
  therapist_id uuid not null references public.profiles (id) on delete restrict,
  linked_user_id uuid unique references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.profiles (id) on delete restrict,
  name text not null,
  description text not null default '',
  instructions text not null,
  target_repetitions integer not null default 0 check (target_repetitions >= 0),
  target_duration integer not null default 0 check (target_duration >= 0),
  image_url text not null default '',
  video_url text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.rehabilitation_plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  scheduled_days text[] not null default '{}',
  scheduled_time time not null,
  target_repetitions integer not null default 0 check (target_repetitions >= 0),
  target_duration integer not null default 0 check (target_duration >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint rehabilitation_plans_valid_days check (
    scheduled_days <@ array['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']::text[]
  )
);

create table public.exercise_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  plan_id uuid references public.rehabilitation_plans (id) on delete set null,
  exercise_id uuid references public.exercises (id) on delete set null,
  logged_by uuid not null references public.profiles (id) on delete restrict,
  status text not null check (status in ('completed', 'missed')),
  repetitions integer not null default 0 check (repetitions >= 0),
  duration integer not null default 0 check (duration >= 0),
  notes text not null default '',
  completed_at timestamptz not null default now()
);

create table public.condition_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  logged_by uuid not null references public.profiles (id) on delete restrict,
  feeling text not null check (feeling in ('great', 'good', 'okay', 'tired', 'unwell')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete cascade,
  type text not null default 'general',
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index patients_therapist_id_idx on public.patients (therapist_id);
create index exercises_therapist_id_idx on public.exercises (therapist_id);
create index plans_patient_id_active_idx on public.rehabilitation_plans (patient_id, active);
create index plans_exercise_id_idx on public.rehabilitation_plans (exercise_id);
create index exercise_records_patient_completed_idx on public.exercise_records (patient_id, completed_at desc);
create index condition_logs_patient_created_idx on public.condition_logs (patient_id, created_at desc);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- Initial signup behavior; the later self-registration migration replaces this
-- function so new users can choose patient or therapist during sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'RehabTrack User'),
    'patient'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Used only in RLS policies. Security definer avoids recursive profile policies.
create or replace function public.is_current_therapist()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'therapist'
  );
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_current_therapist() from public, anon, authenticated;
grant execute on function public.is_current_therapist() to authenticated;

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.exercises enable row level security;
alter table public.rehabilitation_plans enable row level security;
alter table public.exercise_records enable row level security;
alter table public.condition_logs enable row level security;
alter table public.notifications enable row level security;

revoke all on table public.profiles, public.patients, public.exercises,
  public.rehabilitation_plans, public.exercise_records, public.condition_logs,
  public.notifications from anon, authenticated;

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.patients to authenticated;
grant select, insert, update, delete on public.exercises to authenticated;
grant select, insert, update, delete on public.rehabilitation_plans to authenticated;
grant select, insert on public.exercise_records to authenticated;
grant select, insert on public.condition_logs to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Therapists and linked patients can read patient records"
  on public.patients for select to authenticated
  using (therapist_id = (select auth.uid()) or linked_user_id = (select auth.uid()));
create policy "Therapists can create their patient records"
  on public.patients for insert to authenticated
  with check (therapist_id = (select auth.uid()) and (select public.is_current_therapist()));
create policy "Therapists can update their patient records"
  on public.patients for update to authenticated
  using (therapist_id = (select auth.uid()) and (select public.is_current_therapist()))
  with check (therapist_id = (select auth.uid()) and (select public.is_current_therapist()));
create policy "Therapists can delete their patient records"
  on public.patients for delete to authenticated
  using (therapist_id = (select auth.uid()) and (select public.is_current_therapist()));

create policy "Therapists and assigned patients can read exercises"
  on public.exercises for select to authenticated
  using (
    therapist_id = (select auth.uid())
    or exists (
      select 1 from public.rehabilitation_plans plan
      join public.patients patient on patient.id = plan.patient_id
      where plan.exercise_id = exercises.id and patient.linked_user_id = (select auth.uid())
    )
  );
create policy "Therapists can create their exercises"
  on public.exercises for insert to authenticated
  with check (therapist_id = (select auth.uid()) and (select public.is_current_therapist()));
create policy "Therapists can update their exercises"
  on public.exercises for update to authenticated
  using (therapist_id = (select auth.uid()) and (select public.is_current_therapist()))
  with check (therapist_id = (select auth.uid()) and (select public.is_current_therapist()));
create policy "Therapists can delete their exercises"
  on public.exercises for delete to authenticated
  using (therapist_id = (select auth.uid()) and (select public.is_current_therapist()));

create policy "Therapists and linked patients can read plans"
  on public.rehabilitation_plans for select to authenticated
  using (
    exists (
      select 1 from public.patients patient
      where patient.id = rehabilitation_plans.patient_id
        and (patient.therapist_id = (select auth.uid()) or patient.linked_user_id = (select auth.uid()))
    )
  );
create policy "Therapists can create plans for their patients"
  on public.rehabilitation_plans for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select public.is_current_therapist())
    and exists (
      select 1 from public.patients patient
      where patient.id = rehabilitation_plans.patient_id and patient.therapist_id = (select auth.uid())
    )
    and exists (
      select 1 from public.exercises exercise
      where exercise.id = rehabilitation_plans.exercise_id and exercise.therapist_id = (select auth.uid())
    )
  );
create policy "Therapists can update their plans"
  on public.rehabilitation_plans for update to authenticated
  using (
    created_by = (select auth.uid())
    and (select public.is_current_therapist())
    and exists (
      select 1 from public.patients patient
      where patient.id = rehabilitation_plans.patient_id and patient.therapist_id = (select auth.uid())
    )
  )
  with check (
    created_by = (select auth.uid())
    and (select public.is_current_therapist())
    and exists (
      select 1 from public.patients patient
      where patient.id = rehabilitation_plans.patient_id and patient.therapist_id = (select auth.uid())
    )
    and exists (
      select 1 from public.exercises exercise
      where exercise.id = rehabilitation_plans.exercise_id and exercise.therapist_id = (select auth.uid())
    )
  );
create policy "Therapists can delete their plans"
  on public.rehabilitation_plans for delete to authenticated
  using (
    created_by = (select auth.uid())
    and (select public.is_current_therapist())
    and exists (
      select 1 from public.patients patient
      where patient.id = rehabilitation_plans.patient_id and patient.therapist_id = (select auth.uid())
    )
  );

create policy "Care team and linked patients can read exercise records"
  on public.exercise_records for select to authenticated
  using (
    exists (
      select 1 from public.patients patient
      where patient.id = exercise_records.patient_id
        and (patient.linked_user_id = (select auth.uid()) or patient.therapist_id = (select auth.uid()))
    )
  );
create policy "Linked patients can record their own activity"
  on public.exercise_records for insert to authenticated
  with check (
    logged_by = (select auth.uid())
    and exists (
      select 1 from public.patients patient
      where patient.id = exercise_records.patient_id and patient.linked_user_id = (select auth.uid())
    )
    and (
      exercise_records.plan_id is null
      or exists (
        select 1 from public.rehabilitation_plans plan
        where plan.id = exercise_records.plan_id and plan.patient_id = exercise_records.patient_id
      )
    )
    and (
      exercise_records.exercise_id is null
      or exists (
        select 1 from public.rehabilitation_plans plan
        where plan.patient_id = exercise_records.patient_id and plan.exercise_id = exercise_records.exercise_id
      )
    )
  );

create policy "Care team and linked patients can read condition logs"
  on public.condition_logs for select to authenticated
  using (
    exists (
      select 1 from public.patients patient
      where patient.id = condition_logs.patient_id
        and (patient.linked_user_id = (select auth.uid()) or patient.therapist_id = (select auth.uid()))
    )
  );
create policy "Linked patients can create their condition logs"
  on public.condition_logs for insert to authenticated
  with check (
    logged_by = (select auth.uid())
    and exists (
      select 1 from public.patients patient
      where patient.id = condition_logs.patient_id and patient.linked_user_id = (select auth.uid())
    )
  );

create policy "Users can read their notifications"
  on public.notifications for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.patients patient
      where patient.id = notifications.patient_id and patient.linked_user_id = (select auth.uid())
    )
  );
create policy "Users can mark their notifications read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
