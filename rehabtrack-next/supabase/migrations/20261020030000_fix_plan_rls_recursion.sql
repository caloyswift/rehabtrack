-- Break the RLS cycle where plan insert/update checks read exercises while
-- the exercise read policy also checks plans.
create or replace function public.therapist_owns_patient(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patients patient
    where patient.id = p_patient_id
      and patient.therapist_id = (select auth.uid())
  );
$$;

create or replace function public.therapist_owns_exercise(p_exercise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exercises exercise
    where exercise.id = p_exercise_id
      and exercise.therapist_id = (select auth.uid())
  );
$$;

revoke all on function public.therapist_owns_patient(uuid) from public, anon, authenticated;
revoke all on function public.therapist_owns_exercise(uuid) from public, anon, authenticated;
grant execute on function public.therapist_owns_patient(uuid) to authenticated;
grant execute on function public.therapist_owns_exercise(uuid) to authenticated;

drop policy if exists "Therapists can create plans for their patients"
  on public.rehabilitation_plans;
create policy "Therapists can create plans for their patients"
  on public.rehabilitation_plans for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select public.is_current_therapist())
    and (select public.therapist_owns_patient(patient_id))
    and (select public.therapist_owns_exercise(exercise_id))
  );

drop policy if exists "Therapists can update their plans"
  on public.rehabilitation_plans;
create policy "Therapists can update their plans"
  on public.rehabilitation_plans for update to authenticated
  using (
    created_by = (select auth.uid())
    and (select public.is_current_therapist())
    and (select public.therapist_owns_patient(patient_id))
  )
  with check (
    created_by = (select auth.uid())
    and (select public.is_current_therapist())
    and (select public.therapist_owns_patient(patient_id))
    and (select public.therapist_owns_exercise(exercise_id))
  );

drop policy if exists "Therapists can delete their plans"
  on public.rehabilitation_plans;
create policy "Therapists can delete their plans"
  on public.rehabilitation_plans for delete to authenticated
  using (
    created_by = (select auth.uid())
    and (select public.is_current_therapist())
    and (select public.therapist_owns_patient(patient_id))
  );
