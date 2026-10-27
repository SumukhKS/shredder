import { KeyboardAvoidingView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { ScrollView as GHScrollView, RefreshControl } from 'react-native-gesture-handler';
import Animated, { type AnimatedRef } from 'react-native-reanimated';
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
  /** Lets a drag-and-drop list inside scroll the screen (see `Sortable`). */
  scrollRef?: AnimatedRef<Animated.ScrollView>;
}

/**
 * Scroll view that takes part in gesture handling, so a drag handle inside it wins the touch
 * instead of the page starting to scroll (Android's own scroll view steals it otherwise).
 */
export const GestureScrollView = Animated.createAnimatedComponent(GHScrollView);

export function Screen({
  title,
  subtitle,
  right,
  refreshing,
  onRefresh,
  padTop = true,
  footer,
  scrollRef,
  children,
  contentContainerStyle,
  ...rest
}: ScreenProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    // Padding for the keyboard keeps a focused field scrollable into view (Android draws edge to edge).
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <GestureScrollView
        ref={scrollRef as never}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.primary} /> : undefined
        }
        contentContainerStyle={[
          {
            paddingTop: padTop ? insets.top + Space.lg : Space.lg,
            paddingBottom: 120,
            paddingHorizontal: Space.lg,
            gap: Space.lg,
          },
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
      </GestureScrollView>
      {/* The status bar is transparent (edge to edge), so give it a solid strip to keep content from scrolling under it. */}
      {padTop ? <View pointerEvents="none" style={[styles.statusBar, { height: insets.top, backgroundColor: c.bg }]} /> : null}
      {footer}
    </KeyboardAvoidingView>
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
  statusBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  empty: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Space.xl,
    gap: Space.sm,
    alignItems: 'center',
  },
});
