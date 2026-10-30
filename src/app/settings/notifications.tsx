import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ToggleRow } from '@/components/settings-row';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { WheelPicker } from '@/components/ui/wheel-picker';
import { Radius, Space } from '@/constants/theme';
import { allowReminders, formatTime, REMINDER_TEXT, scheduleReminders } from '@/lib/reminders';
import { useAppSettings, type Reminder, type ReminderKind } from '@/stores/app-settings';

const KINDS: ReminderKind[] = ['workout', 'food', 'water', 'weighIn'];

/** Settings > Notifications: daily reminders, each with its own time. */
export default function NotificationSettings() {
  const c = useColors();
  const reminders = useAppSettings((s) => s.reminders);
  const setReminder = useAppSettings((s) => s.setReminder);
  const [editing, setEditing] = useState<ReminderKind | null>(null);
  const [blocked, setBlocked] = useState(false);

  async function change(kind: ReminderKind, patch: Partial<Reminder>) {
    if (patch.on && !(await allowReminders())) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    setReminder(kind, patch);
    await scheduleReminders(useAppSettings.getState().reminders);
  }

  return (
    <Screen padTop={false}>
      {KINDS.map((k) => (
        <ToggleRow
          key={k}
          title={REMINDER_TEXT[k].label}
          detail={REMINDER_TEXT[k].detail}
          value={reminders[k].on}
          onChange={(on) => change(k, { on })}
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${REMINDER_TEXT[k].label} time`}
              onPress={() => setEditing(k)}
              style={[styles.time, { backgroundColor: c.surfaceHi }]}>
              <AppText variant="smallBold" color={reminders[k].on ? 'text' : 'textMuted'}>
                {formatTime(reminders[k].hour, reminders[k].minute)}
              </AppText>
            </Pressable>
          }
        />
      ))}
      {blocked ? (
        <View style={{ gap: Space.sm }}>
          <AppText variant="small" color="textMuted">
            Notifications are blocked for Shredder. Allow them in your phone settings to get reminders.
          </AppText>
          <Button
            label="Open phone settings"
            variant="secondary"
            icon="settings-outline"
            onPress={() => Linking.openSettings()}
          />
        </View>
      ) : null}
      <AppText variant="small" color="textMuted">
        Reminders are set on this phone and arrive every day at the time shown.
      </AppText>

      {editing ? (
        <TimeSheet
          title={REMINDER_TEXT[editing].label}
          value={reminders[editing]}
          onClose={() => setEditing(null)}
          onSave={(hour, minute) => {
            change(editing, { hour, minute });
            setEditing(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const twoDigits = (v: number) => String(v).padStart(2, '0');

/** Pick a time on hour and minute wheels. */
function TimeSheet({
  title,
  value,
  onClose,
  onSave,
}: {
  title: string;
  value: Reminder;
  onClose: () => void;
  onSave: (hour: number, minute: number) => void;
}) {
  const c = useColors();
  const [hour, setHour] = useState(value.hour);
  const [minute, setMinute] = useState(value.minute);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border }]}>
          <AppText variant="h3">{title} reminder</AppText>
          <AppText variant="stat" align="center">
            {formatTime(hour, minute)}
          </AppText>
          <View style={styles.pickers}>
            <WheelPicker label="Hour" values={HOURS} value={hour} onChange={setHour} format={twoDigits} />
            <AppText variant="h2">:</AppText>
            <WheelPicker label="Minute" values={MINUTES} value={minute} onChange={setMinute} format={twoDigits} />
          </View>
          <View style={{ flexDirection: 'row', gap: Space.md }}>
            <Button label="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button label="Save" onPress={() => onSave(hour, minute)} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  time: { paddingHorizontal: Space.sm, paddingVertical: 6, borderRadius: Radius.chip },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: Space.lg },
  sheet: { borderRadius: Radius.card, borderWidth: 1, padding: Space.lg, gap: Space.lg },
  pickers: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Space.md },
});
