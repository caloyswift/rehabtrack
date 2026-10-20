-- Allow new users to choose their workspace role during sign-up.
-- The browser can now self-select therapist access; this is not credential verification.
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
    case
      when new.raw_user_meta_data ->> 'role' = 'therapist' then 'therapist'
      else 'patient'
    end
  );
  return new;
end;
$$;
