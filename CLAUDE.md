# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```sh
npx tsc --noEmit                  # typecheck (npm run typecheck)
npx expo lint                     # ESLint, including the React Compiler rules
npm run test:db                   # every migration in in-memory Postgres (PGlite) + SQL checks
npx expo start                    # dev server (native modules need a dev build, not Expo Go)
npx expo-updates runtimeversion:resolve --platform android   # current native fingerprint
npx supabase db push --linked --dry-run                       # which migrations are pending
```

There is no unit-test runner. `npm run test:db` is a single script (`supabase/tests/schema.test.mjs`) that applies all of `supabase/migrations/` in order, then runs assertions top to bottom and stops at the first failure. To check one area, read the assertions around it; they share users and data set up earlier in the file. Pure TypeScript helpers (`src/lib/history-stats.ts`, `exercise-match.ts`, `body-shapes.ts`) have no React Native imports, so they can be exercised directly with `npx tsx`.

Format with Prettier using the project's options (there is no config file): `npx prettier --single-quote --print-width 130 --bracket-same-line --trailing-comma es5 --write <files>`.

## Shipping

- **Over-the-air updates** are the normal release path: `npx eas-cli@latest update --channel preview --platform android --environment preview --message "..." --non-interactive`. The bundle reads `EXPO_PUBLIC_*` from the **EAS environment**, not `.env`; a missing var crashes the update on launch and the app silently rolls back.
- **The runtime version is a fingerprint.** An update only reaches installs whose native fingerprint matches. Changing native packages, `app.json`, assets or **`.gitignore`** changes it and needs a new APK (`eas build --profile preview`). Check the fingerprint before publishing; keep local-only ignores in `.git/info/exclude` instead of `.gitignore`. Pure-JS packages (e.g. `react-native-body-highlighter`) leave it unchanged.
- **Migrations** go in `supabase/migrations/` with a timestamp prefix and must be safe to re-run where they touch data. Push with `npx supabase db push --linked`; the app's code should not depend on a migration until it has been pushed.
- After each update, commit and push to `origin master` (private repo SumukhKS/shredder).

## Architecture

**Client.** Expo Router screens in `src/app/` (tabs: Today, Train, Fuel, Progress; stack screens for workouts, exercises, habits, food, import, settings, registered with their options in `src/app/_layout.tsx`). Data access is plain functions in `src/lib/` calling the Supabase client (`src/lib/supabase.ts`, session in expo-sqlite `localStorage`), read through the small `useQuery(load, key)` hook (`src/lib/use-query.ts`), which reloads on focus and when `key` changes. Zustand stores in `src/stores/`: `session` (auth + profile), `workout` (the active workout, persisted on device so a session survives app restarts), `today-layout` (Today card order/size/visibility and hidden tabs), `picker` (passes picked exercises back to the routine and workout editors).

**Server logic lives in Postgres.** Row-level security restricts every user table to its owner; library rows (`exercises`, `foods` with `created_by is null`) are shared. Writes that must stay consistent are `security definer` RPCs rather than client inserts: `finish_workout` / `import_workouts` (thin wrappers over `*_core` that then call `refresh_prs`), `update_workout` (edit a logged workout), `merge_exercises` (fold custom exercises into library ones), `exercise_bests`, `exercise_set_history`. Internal helpers like `refresh_prs` and `refresh_records` are revoked from clients. A statement trigger re-runs PR flags after workout exercises are deleted.

**PR rules exist twice and must stay in step.** A set is a PR when no earlier set of that exercise (from an earlier workout) had both at least as much weight and at least as many reps; the first workout with an exercise is the baseline. Server: `refresh_prs` (migration `20261028000001_set_prs.sql`) sets `workout_sets.is_pr` and `pr_count`. Client: `beatsAll` in `src/lib/workouts.ts` and `detectPr` in `src/stores/workout.ts` give live medals while logging. `personal_records` holds the best estimated 1RM (Epley, 1-12 reps) per exercise.

**Exercise library.** About 1,290 exercises: a 64-exercise seed plus the free ExerciseDB catalogue (`20261029000001_exercisedb_library.sql`, generated from the API; GIFs at `static.exercisedb.dev/media/<gif_id>.gif`, see `ExerciseDemo`). PostgREST returns at most 1,000 rows per request, so `fetchExercises` pages. `src/lib/exercise-match.ts` matches names across spellings ("Bicep Curl (Dumbbell)" = "Biceps Curl (Dumbbell)") and never across equipment; the Hevy import (`src/lib/hevy.ts`) uses it before creating a custom exercise, and `/exercise/match` uses it to suggest merges. Muscle groups are a fixed vocabulary (`Muscle` in `src/lib/body-shapes.ts`, labels in `MUSCLE_LABELS`); `mainMuscle` infers one from the name when an exercise was saved as `other`.

**Health.** Steps and sleep come only from Health Connect (`src/lib/health.ts`, read-only, no manual entry): `syncHealth` aggregates days into `daily_health` without overwriting manual values, and `backfillHealth` pulls a year once per session. Without the `READ_HEALTH_DATA_HISTORY` permission (needs a new APK), Health Connect returns only about 30 days before the first grant.

**Networking.** Some Indian networks block `*.supabase.co`, so the app's Supabase URL points at the `proxy/` Cloudflare Worker, which forwards everything to the project and also serves the email-confirmation pages (a button-press page, so link scanners can't burn the one-time token). `download/` serves the latest APK as `Shredder.apk`.

## Conventions

- **React Compiler lint:** no reading or writing refs, and no reassigning variables, during render. In gesture and animation code use Reanimated shared values with `.get()` / `.set()`, and `scheduleOnRN` from `react-native-worklets` to call back into JS.
- **Scrolling and gestures:** page scroll views are the gesture-handler one (`GestureScrollView` from `src/components/ui/screen.tsx`, used by `Screen`), so a drag handle inside wins over scrolling on Android. Reordering is always drag-and-drop through `Sortable` (`src/components/sortable.tsx`, `mode="handle"` or `"hold"`), never up/down arrows.
- **Numbers are never shortened:** volume is `12,450 kg`, not `12.5t` (`formatVolume`, chart axes).
- **Exercise imagery** is only the illustrated ExerciseDB animations; no photos or videos of real people.
- The theme is dark only; colours come from `useColors()` and tokens in `src/constants/theme.ts`.
