import { RefreshControl, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Space } from '@/constants/theme';

import { AppText } from './text';
import { useColors } from './theme';

interface ScreenProps extends ScrollViewProps {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Tab screens draw their own top inset; stack screens with a header don't. */
  padTop?: boolean;
  footer?: React.ReactNode;
}

export function Screen({
  title,
  subtitle,
  right,
  refreshing,
  onRefresh,
  padTop = true,
  footer,
  children,
  contentContainerStyle,
  ...rest
}: ScreenProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.primary} /> : undefined}
        contentContainerStyle={[
          { paddingTop: padTop ? insets.top + Space.lg : Space.lg, paddingBottom: 120, paddingHorizontal: Space.lg, gap: Space.lg },
          contentContainerStyle,
        ]}
        {...rest}>
        {title ? (
          <View style={styles.header}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="h1">{title}</AppText>
              {subtitle ? (
                <AppText variant="body" color="textMuted">
                  {subtitle}
                </AppText>
              ) : null}
            </View>
            {right}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={[styles.header, { marginTop: Space.sm }]}>
      <AppText variant="h3" style={{ flex: 1 }}>
        {title}
      </AppText>
      {action}
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.empty, { borderColor: c.hairline }]}>
      <AppText variant="h3" align="center">
        {title}
      </AppText>
      <AppText variant="body" color="textMuted" align="center">
        {body}
      </AppText>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  empty: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Space.xl,
    gap: Space.sm,
    alignItems: 'center',
  },
});
