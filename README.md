# RehabTrack

RehabTrack is a responsive HTML, CSS, and vanilla JavaScript rehabilitation-monitoring prototype. It runs entirely in the browser with no backend or package installation required.

Open `index.html` through a simple local development server (such as VS Code Live Server). The app stores prototype data in browser `localStorage`, so data persists through refreshes in the same browser.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Healthcare Worker | `therapist@rehabtrack.test` | `therapist123` |
| Patient | `patient@rehabtrack.test` | `patient123` |

Demo users, a linked patient, sample exercises, plans, and a welcome notification are added only when the relevant storage keys are missing. Existing local data is not overwritten.

## Local data keys

The centralized helpers in `js/storage.js` manage these keys:

- `rehabtrack_users`
- `rehabtrack_current_user`
- `rehabtrack_patients`
- `rehabtrack_exercises`
- `rehabtrack_rehabilitation_plans`
- `rehabtrack_exercise_records`
- `rehabtrack_condition_logs`
- `rehabtrack_notifications`

## Important prototype note

This project stores passwords and rehabilitation data in browser local storage solely for a school prototype. It is not secure authentication or a suitable storage solution for real patient information. A production version needs a properly secured backend and authentication service.
