-- One-off: the reviewed and approved mapping of one account's Hevy custom exercises. Run after migration
-- 20261030000003_exercise_aliases.sql is pushed:
--   npx supabase db query --linked -f supabase/scripts/map-hevy-exercises.sql
-- All or nothing: a missing exercise, or any change in the number of logged sets, rolls everything back.
-- Each merge can be undone afterwards with undo_exercise_merge.
do $$
declare
  v_user constant uuid := '45fc2fd5-73ff-472a-bb0b-865f70c914b3';
  v_map record;
  v_from uuid;
  v_to uuid;
  v_pairs jsonb := '[]';
  v_before bigint;
  v_after bigint;
begin
  select count(*) into v_before
  from workout_sets s
  join workout_exercises we on we.id = s.workout_exercise_id
  join workouts w on w.id = we.workout_id
  where w.user_id = v_user;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  for v_map in
    select * from (values
      ('Lat Pulldown (Machine)', 'Front Pulldown (Machine)'),
      ('Seated Shoulder Press (Machine)', 'Shoulder Press (Machine)'),
      ('Iso-Lateral Chest Press (Machine)', 'Chest Press (Machine)'),
      ('Rear Delt Reverse Fly (Machine)', 'Seated Reverse Fly (Machine)'),
      ('Seated Incline Curl (Dumbbell)', 'Incline Curl (Dumbbell)'),
      ('Iso-Lateral Row (Machine)', 'Unilateral Row (Machine)'),
      ('Chest Fly (Machine)', 'Pec Deck'),
      ('Triceps Kickback (Cable)', 'Kickback (Cable)'),
      ('Hanging Leg Raises ( Weighted )', 'Hanging Leg Raise'),
      ('Decline Crunch (Weighted)', 'Decline Crunch'),
      ('Lying Leg Raise', 'Lying Leg Raise Flat Bench'),
      ('Lying Leg Raises (Weighted)', 'Lying Leg Raise Flat Bench'),
      ('Hammer Curl (Cable)', 'Hammer Curl (With Rope) (Cable)'),
      ('Seated Wrist Extension (Barbell)', 'Reverse Wrist Curl (Barbell)'),
      ('Squat (Bodyweight)', 'Quads (Bodyweight Squat)'),
      ('Triceps Extension (Cable)', 'Pushdown (Cable)'),
      ('Seated Chest Flys (Cable)', 'Middle Fly (Cable)'),
      ('Single Arm Cable Row', 'Seated Single-Arm Alternate Row (Cable)'),
      ('Tricep Supported Bicep Curls ( Dumbbell )', 'Preacher Curl (Dumbbell)'),
      ('Seated Palms Up Wrist Curl', 'Wrist Curl (Dumbbell)'),
      ('Rear Delt Reverse Fly (Cable)', 'Standing Crossover High Reverse Fly (Cable)'),
      ('Chest Supported Reverse Flys (Cable)', 'Standing Crossover High Reverse Fly (Cable)'),
      ('Triceps Extension (Dumbbell)', 'Overhead Triceps Extension')
    ) as m (custom, target)
  loop
    select id into strict v_from from exercises where name = v_map.custom and created_by = v_user;
    select id into strict v_to from exercises where name = v_map.target and created_by is null;
    v_pairs := v_pairs || jsonb_build_object('from', v_from, 'to', v_to);
  end loop;

  perform merge_exercises(v_pairs);

  -- Nothing equivalent in the library, so these two join it (with no animation).
  update exercises set created_by = null, primary_muscle = 'forearms', equipment = 'bodyweight'
  where name = 'Dead Hang' and created_by = v_user;
  if not found then raise exception 'Dead Hang not found'; end if;
  update exercises set created_by = null, primary_muscle = 'cardio'
  where name = 'Hiking' and created_by = v_user;
  if not found then raise exception 'Hiking not found'; end if;

  select count(*) into v_after
  from workout_sets s
  join workout_exercises we on we.id = s.workout_exercise_id
  join workouts w on w.id = we.workout_id
  where w.user_id = v_user;
  if v_after <> v_before then
    raise exception 'logged sets changed from % to %', v_before, v_after;
  end if;
  if exists (select 1 from exercises where created_by = v_user) then
    raise exception 'custom exercises are still left on this account';
  end if;
end;
$$;
