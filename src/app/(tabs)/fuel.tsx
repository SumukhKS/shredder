import { useState } from 'react';

import { FoodDiary, useFoodDay } from '@/components/food-diary';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { SwipeDays } from '@/components/swipe-days';
import { dayLabel, toDay } from '@/lib/dates';

export default function Fuel() {
  const [day, setDay] = useState(toDay());
  const q = useFoodDay(day);

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <AppText variant="h3" align="center">
        {dayLabel(day)}
      </AppText>
      <SwipeDays day={day} onChange={setDay}>
        <FoodDiary day={day} data={q.data} />
      </SwipeDays>
    </Screen>
  );
}
