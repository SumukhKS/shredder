# Shredder

A fitness tracker for Android that keeps training, food, water, steps and sleep in one place: Hevy-style workout logging, MyFitnessPal-style food tracking, and daily habits, with steps from the phone's sensor or Health Connect and sleep from Health Connect. Everything you log is saved on the phone first, so it keeps working without a connection.

Built with Expo (React Native 0.88, SDK 58), Expo Router, Zustand and Supabase. Dark theme throughout.

## Features

**Training**
- Live workout logger: previous-performance column, warm-up / drop / failure sets, rest timer with haptics, notes, drag-and-drop reordering by the grip
- The active workout is saved on the device, so a dropped connection or closed app never loses a session
- Train has three parts: Routines, History and Exercises
- Routines built set by set, with target reps per set and a rest timer switch per exercise
- Create your own exercises, private to you
- Every logged workout stays editable: name, date, start time, length, exercises and sets
- PR medals on every set that beats all earlier sets of that exercise (more weight, or more reps at the weight), across the whole history and live while logging, with a celebration when you hit one
- Muscle map for each session: an anatomical male or female figure (from your profile) with the trained muscles lit, and a volume bar for each muscle group
- Exercise pages: all-time bests, a progress chart (heaviest, estimated 1RM, volume, reps or time), every past session with its sets and medals, and how to do the movement
- Exercise library of about 1,290 exercises from ExerciseDB, each with an animated demo and step-by-step instructions; search matches words in any order
- Import from Hevy (API key or CSV export), or from any app's set-by-set CSV by matching its columns, with a preview first. Names it isn't sure about are asked about before anything is saved, and your choices are remembered
- Custom exercises with exactly the same name as a library one merge by themselves; close matches only merge if you choose them, history and PRs included, and a merge can be undone

**Nutrition**
- Food diary by meal with calorie and macro targets and rings
- Food has three parts: Diary, My Recipes and My Foods
- About 13,000 foods from USDA FoodData Central, plus Indian dishes; search ranks your own foods first, then verified ones, then community ones
- Packaged food search and barcode scanning through Open Food Facts
- Recipes, private to you: ingredients and servings, with the macros worked out, logged by the serving
- Foods you create are checked so their calories and macros agree, then shared with everyone; similar foods are shown before saving
- Serving or gram entry, "log again" from history

**Habits**
- Steps from the phone's sensor (with a live notification, works with the app closed) or Health Connect, never added together
- Sleep from Health Connect (read-only; up to a year of history), water logging, weigh-ins
- Swipe between days on every tracker; a calendar with tappable cards for any past day
- Week streak

**Today screen**
- Cards for calories, workout, water, steps and sleep; rearrange, resize or hide them under Customize layout
- The Train, Food and Profile tabs can be switched off from the same place

**Profile**
- Lifetime workouts, diet days, step goals and week streak
- One Daily / Weekly / Monthly switch for separate graphs of workouts, volume, calories, protein, sleep, steps and water, with goal lines and touch-to-read values
- In-app profile picture cropper, and a share link to a public page showing only your picture, name, bio, workout count and week streak

**Body**
- A graph per measurement with time ranges, and CSV import that never overwrites saved values with empty cells
- Private progress photos: a dated gallery and side-by-side compare
- Calculators, including body fat by tape, skinfold calipers or BMI, with results you can save

**Working offline**
- Workouts, food, water, measurements, routines, recipes and custom foods and exercises are saved on the phone and sent later, and a retry can't log anything twice
- Entries the server refuses wait under Settings > Import or export data > Needs attention
- Imports and account settings need a connection; progress photos upload when you're back online

**New here**
- A short app tour after onboarding, once per account, with a replay in Settings

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
- JavaScript changes ship over the air: `npx eas-cli update --channel preview --platform android --environment preview`. The update only reaches installs built from the same native fingerprint, so changes to native packages, `modules/`, `app.json`, assets, `package.json` scripts or `.gitignore` need a new APK.
- `EXPO_PUBLIC_*` variables for over-the-air updates come from the EAS environment, not the local `.env`.

### Workers

Two small Cloudflare Workers live in this repo:
- `proxy/`: forwards app traffic to Supabase for networks that block `*.supabase.co`, and serves the email confirmation pages, so link scanners can't use up the one-time link.
- `download/`: serves the latest APK as `Shredder.apk`, and public profile pages at `/u/<share id>`. It calls Supabase directly, because Cloudflare blocks one `workers.dev` worker from calling another.

## Checks

```sh
npm run typecheck   # TypeScript
npm run lint        # ESLint (Expo + React Compiler rules)
node --import tsx --test tests/*.test.ts   # Logic: validation, outbox, CSV import, graphs, matching, dates
npm run test:db     # Runs every migration in an in-memory Postgres and checks RLS, PRs, records, edits, merges and data
```

## Project structure

```
src/
  app/                  Expo Router screens
    (auth)/welcome      Sign up / sign in
    onboarding          Goal and target setup
    (tabs)/             Today, Train, Food, Profile
    workout/            Active logger, exercise picker, workout detail, day view, editor
    exercise/           Exercise history and how-to, matching custom exercises to the library
    habit/[kind]        Water, steps and sleep trackers
    routine/edit        Routine builder
    recipe/edit         Recipe builder
    food/               Search, add, barcode scan, custom food, a day's diary
    calendar            Any past day
    measurements        Body measurements and their graphs
    progress            Progress photos
    profile/            Edit profile, picture cropper
    import              Workout import
    settings/           Goals, integrations, reminders, calculators, data and account
  components/           UI kit, charts, calendar, muscle map, drag-and-drop list
  constants/theme.ts    Design tokens
  lib/                  Supabase client, offline outbox, data access, health sync, imports, matching, maths
  stores/               Zustand stores (session, active workout, Today layout, settings, picker)
modules/step-counter/   Local Android module: step-counting service and image-with-text sharing
supabase/
  migrations/           Schema, RLS, functions and triggers, seed data
  tests/                Database test suite
tests/                  Logic tests
proxy/, download/       Cloudflare Workers
```

## Notes

- Exercise animations and instructions come from [ExerciseDB](https://github.com/ExerciseDB/exercisedb-api); the free tier's GIFs are 180 px.
- Open Food Facts data is community-contributed and licensed under ODbL; keep the attribution shown on food screens.
- Seeded Indian food values are approximations of home-style recipes, and the newer ones are labelled "Recipe estimate". Check them against IFCT 2017.
- The phone-sensor step service needs a declaration before a Google Play release.
- Health Connect only returns about 30 days from before the app was first allowed in, unless the history permission is granted.
