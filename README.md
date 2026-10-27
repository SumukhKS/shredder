# Shredder

A fitness tracker for Android that keeps training, food, water, steps and sleep in one place: Hevy-style workout logging, MyFitnessPal-style food tracking, and daily habits read from Health Connect.

Built with Expo (React Native 0.88, SDK 58), Expo Router, Zustand and Supabase. Dark theme throughout.

## Features

**Training**
- Live workout logger: previous-performance column, warm-up / drop / failure sets, rest timer with haptics, notes, drag-and-drop reordering by the grip
- The active workout is saved on the device, so a dropped connection or closed app never loses a session
- Routines with target sets, reps and rest per exercise
- Every logged workout stays editable: name, date, start time, length, exercises and sets
- PR medals on every set that beats all earlier sets of that exercise (more weight, or more reps at the weight), across the whole history and live while logging, with a celebration when you hit one
- Muscle map for each session: an anatomical male or female figure (from your profile) with the trained muscles lit, and a volume bar for each muscle group
- Exercise pages: all-time bests, a progress chart (heaviest, estimated 1RM, volume, reps or time), every past session with its sets and medals, and how to do the movement
- Exercise library of about 1,290 exercises from ExerciseDB, each with an animated demo and step-by-step instructions; search matches words in any order
- Import from Hevy (API key or CSV export). Imported exercises are matched to the library, and any custom duplicates can be merged into it later, history and PRs included

**Nutrition**
- Food diary by meal with calorie and macro targets and rings
- About 7,000 everyday foods from USDA FoodData Central, plus common Indian dishes
- Packaged food search and barcode scanning through Open Food Facts
- Custom foods, serving or gram entry, "log again" from history

**Habits**
- Steps and sleep from Health Connect (read-only; up to a year of history), water logging, weigh-ins
- Week calendar with a month view on every tracker, days with activity highlighted, swipe between days
- Daily and weekly streaks

**Today screen**
- Cards for streaks, calories, workout, water, steps and sleep; rearrange, resize or hide them under Customize layout
- The Train, Fuel and Progress tabs can be switched off from the same place

**Progress**
- Body-weight trend, weekly training volume and a personal-record board

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Apply the database schema** with the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   This runs everything in `supabase/migrations/` in order: schema, row-level security, PR and record functions, and the exercise and food data.
3. **Configure the app.**
   ```sh
   cp .env.example .env
   ```
   Fill in the project URL and publishable key from Project Settings → API.
4. **Run it.**
   ```sh
   npm install
   npx expo start
   ```
   Health Connect and the other native modules need a development build (`npx expo run:android` or an EAS build); they don't work in Expo Go.

### Builds and updates

- Android APKs are built with EAS (`eas.json`, `preview` profile).
- JavaScript changes ship over the air: `npx eas-cli update --channel preview --platform android --environment preview`. The update only reaches installs built from the same native fingerprint, so changes to native packages, `app.json`, assets or `.gitignore` need a new APK.
- `EXPO_PUBLIC_*` variables for over-the-air updates come from the EAS environment, not the local `.env`.

### Workers

Two small Cloudflare Workers live in this repo:
- `proxy/`: forwards app traffic to Supabase for networks that block `*.supabase.co`, and serves the email confirmation pages, so link scanners can't use up the one-time link.
- `download/`: serves the latest APK as `Shredder.apk`.

## Checks

```sh
npm run typecheck   # TypeScript
npm run lint        # ESLint (Expo + React Compiler rules)
npm run test:db     # Runs every migration in an in-memory Postgres and checks RLS, PRs, records, edits, merges and data
```

## Project structure

```
src/
  app/                  Expo Router screens
    (auth)/welcome      Sign up / sign in
    onboarding          Goal and target setup
    (tabs)/             Today, Train, Fuel, Progress
    workout/            Active logger, exercise picker, workout detail, day view, editor
    exercise/           Exercise history and how-to, matching custom exercises to the library
    habit/[kind]        Water, steps and sleep trackers
    routine/edit        Routine builder
    food/               Search, add, barcode scan, custom food
    import              Hevy import
    settings            Goals, Health Connect, data and account
  components/           UI kit, charts, calendar, muscle map, drag-and-drop list
  constants/theme.ts    Design tokens
  lib/                  Supabase client, data access, health sync, Hevy import, matching, maths
  stores/               Zustand stores (session, active workout, Today layout)
supabase/
  migrations/           Schema, RLS, functions and triggers, seed data
  tests/                Database test suite
proxy/, download/       Cloudflare Workers
```

## Notes

- Exercise animations and instructions come from [ExerciseDB](https://github.com/ExerciseDB/exercisedb-api); the free tier's GIFs are 180 px.
- Open Food Facts data is community-contributed and licensed under ODbL; keep the attribution shown on food screens.
- Seeded Indian food values are approximations of home-style recipes. Check them against IFCT 2017.
- Health Connect only returns about 30 days from before the app was first allowed in, unless the history permission is granted.
