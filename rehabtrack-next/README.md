# RehabTrack Next.js app

This folder contains the Next.js rebuild of RehabTrack. The original HTML prototype remains in the parent folder as a reference. This phase starts with empty patient and activity records; the legacy HTML app's data is not imported into Supabase.

## Supabase setup

1. Create a Supabase project and copy `.env.example` to `.env.local` in this folder.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` using the values from the Supabase project Connect panel. Do not put a service-role or secret key in a `NEXT_PUBLIC_` variable.
3. Install the dependencies listed in `package.json` with `npm install`.
4. Run the SQL files in `supabase/migrations/` in timestamp order in the Supabase SQL Editor. If the initial schema migration has already been applied, run only newer migrations that have not yet been applied.
5. In Supabase Auth URL Configuration, set the Site URL to `https://rehabtrack-navy.vercel.app` and allow `https://rehabtrack-navy.vercel.app/auth/callback` as a redirect URL. Add `http://localhost:3000/auth/callback` too if you still test email links locally.
6. Restart the Next.js development server after setting environment variables.

There is no administrator account or administrator login in RehabTrack. During sign-up, users can choose Patient / Caregiver or Healthcare Worker. Healthcare-worker registration is self-declared and is not verified; anyone who selects it can access the therapist workspace. The Supabase project owner still manages the Supabase project itself.

For local testing, the login page can show **Demo patient** and **Demo healthcare worker** buttons. These use normal Supabase password sign-in with two pre-confirmed test accounts; they do not bypass application authentication. The buttons are visible only in development. To create or reset these accounts and load linked sample patient, exercise, plan, and activity data, copy the demo environment variables from `.env.example` to `.env.local`, add the Supabase service-role/secret key as `SUPABASE_SERVICE_ROLE_KEY`, then run `npm run demo:seed` from this folder. The default demo emails and passwords are listed in `.env.example`. The seed script only touches the two dedicated demo accounts and their sample records. Never expose the service-role/secret key in the browser or commit `.env.local`.

Healthcare workers can add patients, create reusable exercises, and assign plans from their dashboard. When adding a patient, the app generates a patient code. Share that code with the patient / caregiver; they enter it during registration, and the app links the account after email confirmation. Existing patient accounts can enter the code from their Profile pane. Assigned active plans then appear on the linked patient's dashboard. The patient-code RPC migration is a one-time project setup step; no per-patient Supabase configuration is needed. The migrations do not import data from the legacy HTML app.

Patients can view today's scheduled exercises and their full active plan, record an exercise as completed or missed, and save a condition check-in. The dashboard tracks daily counts and weekly completion, shows recent activity and condition history, and adds in-app reminders when a scheduled exercise is due or missed. A database notification is also created when a healthcare worker assigns a new plan. These features use the activity/notification migration in `supabase/migrations/`; apply new migration files once in timestamp order.

The patient dashboard includes a general health information assistant powered by Groq. It does not read or save patient records or chat history. Users should not enter names, contact details, or personal medical record information. It is for general education only and must not be used for diagnosis or personal treatment advice; patients should contact their healthcare worker for personal care questions.

## Environment variables

Only the Supabase project URL and publishable key belong in the browser environment. Set `GROQ_API_KEY` as a server-only environment variable in `.env.local` for local development and in Vercel project environment settings for deployment. `GROQ_MODEL` is optional and defaults to `openai/gpt-oss-20b`. Never expose a Groq API key, Supabase secret, or service-role key in a `NEXT_PUBLIC_` variable. The assistant is unavailable until the Groq key is configured.

## Routes

- `/` — RehabTrack landing page
- `/login` — sign-in, patient registration, and password reset
- `/patient` — patient / caregiver dashboard
- `/therapist` — healthcare worker dashboard
