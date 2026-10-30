-- Numbers that can't be right never get in, whichever route they come by.

-- Keep the limits in step with src/lib/validate.ts.
alter table public.workout_sets add constraint workout_sets_limits check (
  (weight_kg is null or weight_kg between 0 and 1000)
  and (reps is null or reps between 0 and 1000)
  and (duration_s is null or duration_s between 0 and 86400)
  and (distance_m is null or distance_m between 0 and 1000000)
);

alter table public.body_metrics add constraint body_metrics_limits check (
  (weight_kg is null or weight_kg between 20 and 500)
  and (body_fat_pct is null or body_fat_pct between 1 and 80)
  and (neck_cm is null or neck_cm between 5 and 300)
  and (shoulders_cm is null or shoulders_cm between 5 and 300)
  and (chest_cm is null or chest_cm between 5 and 300)
  and (waist_cm is null or waist_cm between 5 and 300)
  and (hips_cm is null or hips_cm between 5 and 300)
  and (arm_cm is null or arm_cm between 5 and 300)
  and (forearm_cm is null or forearm_cm between 5 and 300)
  and (thigh_cm is null or thigh_cm between 5 and 300)
  and (calf_cm is null or calf_cm between 5 and 300)
);

alter table public.food_logs add constraint food_logs_limits check (
  grams > 0 and grams <= 100000 and kcal >= 0 and protein >= 0 and carbs >= 0 and fat >= 0
);

-- Foods people add or that come from Open Food Facts must add up. USDA and seeded foods are curated
-- (USDA's fibre-rich and alcoholic foods legitimately differ from a simple sum), so they're left alone.
-- Keep the rule in step with foodProblem in src/lib/validate.ts.
create function public.check_food_numbers()
returns trigger
language plpgsql
as $$
declare
  v_fibre numeric := least(greatest(coalesce(new.fiber_100g, 0), 0), new.carbs_100g);
  v_supplied numeric := new.protein_100g * 4 + (new.carbs_100g - v_fibre) * 4 + v_fibre * 2 + new.fat_100g * 9;
  v_gap numeric := new.kcal_100g - v_supplied;
begin
  if new.source not in ('off', 'custom') then
    return new;
  end if;
  if new.kcal_100g <= 0 or new.kcal_100g > 902 or new.protein_100g < 0 or new.carbs_100g < 0 or new.fat_100g < 0
     or new.protein_100g + new.carbs_100g + new.fat_100g > 100.5 then
    raise exception 'these food numbers cannot be right' using errcode = 'check_violation';
  end if;
  if abs(v_gap) > greatest(15, new.kcal_100g * 0.2)
     and not (v_gap > 0 and new.name ~* '\m(alcohol|beer|lager|ale|stout|wine|whisky|whiskey|vodka|rum|gin|tequila|brandy|liqueur|cider|malt liquor)\M') then
    raise exception 'the calories and macros of this food do not add up' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger foods_check_numbers before insert or update on public.foods
  for each row execute function public.check_food_numbers();

-- Targets whose macros don't add up to the calories: the calories were what was set, and protein and
-- fat are the goals that matter most, so carbs take up the difference.
update public.profiles
set carbs_g = greatest(0, round((calorie_target - protein_g * 4 - fat_g * 9) / 4.0))
where abs(calorie_target - (protein_g * 4 + carbs_g * 4 + fat_g * 9)) > greatest(50, calorie_target * 0.05)
  and calorie_target - protein_g * 4 - fat_g * 9 >= 0;
