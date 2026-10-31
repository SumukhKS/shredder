import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { FoodDiary, useFoodDay } from '@/components/food-diary';
import { DayHeading, LoadError, Screen } from '@/components/ui/screen';
import { SwipeDays } from '@/components/swipe-days';
import { toDay } from '@/lib/dates';

/** The Food diary for one day, opened from the Today card or the Calendar. */
export default function FoodDay() {
  const params = useLocalSearchParams<{ day?: string }>();
  const [day, setDay] = useState(params.day ?? toDay());
  const q = useFoodDay(day);

  return (
    <Screen padTop={false} refreshing={q.refreshing} onRefresh={q.refresh}>
      <LoadError q={q} what="this day" />
      <DayHeading day={day} />
      <SwipeDays day={day} onChange={setDay}>
        <FoodDiary day={day} data={q.data} />
      </SwipeDays>
    </Screen>
  );
}
