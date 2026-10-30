import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { FoodDiary, useFoodDay } from '@/components/food-diary';
import { LoadError, Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { SwipeDays } from '@/components/swipe-days';
import { dayLabel, toDay } from '@/lib/dates';

/** The Food diary for a day opened from the Calendar. */
export default function FoodDay() {
  const params = useLocalSearchParams<{ day?: string }>();
  const [day, setDay] = useState(params.day ?? toDay());
  const q = useFoodDay(day);

  return (
    <Screen padTop={false} refreshing={q.refreshing} onRefresh={q.refresh}>
      <LoadError q={q} what="this day" />
      <AppText variant="h3" align="center">
        {dayLabel(day)}
      </AppText>
      <SwipeDays day={day} onChange={setDay}>
        <FoodDiary day={day} data={q.data} />
      </SwipeDays>
    </Screen>
  );
}
