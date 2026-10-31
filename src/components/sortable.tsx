import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { packRows, type Rect } from '@/lib/pack';

import { DragGrip } from './drag-grip';

/** How an item is picked up: hold it anywhere, or grab the handle passed to `renderItem`. */
type Mode = 'hold' | 'handle';

interface SortableProps<T> {
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T, state: { active: boolean; handle: ReactNode }) => ReactNode;
  /** Called with the new order of keys when an item is dropped somewhere new. */
  onReorder: (keys: string[]) => void;
  /** Share of the row an item takes: 1 for full width, 0.5 for half. Defaults to 1. */
  span?: (item: T) => number;
  gap?: number;
  mode?: Mode;
  /** The scroll view the list sits in, so dragging near the top or bottom edge scrolls it. */
  scrollRef?: AnimatedRef<Animated.ScrollView>;
  /** Fires when an item is picked up. */
  onDragStart?: (key: string) => void;
  /** Set to false to switch dragging off (e.g. outside an edit mode). Defaults to true. */
  enabled?: boolean;
}

const HOLD_MS = 320;
const EDGE = 110;
const SPEED = 9;
const settle = { damping: 20, stiffness: 220 };

/**
 * Drag-and-drop list or grid. Items are laid out by hand (absolutely positioned), so they can
 * glide to their new places while one follows the finger; the order is only reported on drop.
 */
export function Sortable<T>({
  items,
  keyOf,
  renderItem,
  onReorder,
  span,
  gap = 12,
  mode = 'hold',
  scrollRef,
  onDragStart,
  enabled = true,
}: SortableProps<T>) {
  const keys = items.map(keyOf);
  const byKey = useMemo(() => Object.fromEntries(items.map((it) => [keyOf(it), it])), [items, keyOf]);
  const spans = useMemo(() => Object.fromEntries(items.map((it) => [keyOf(it), span ? span(it) : 1])), [items, keyOf, span]);
  const [order, setOrder] = useState(keys);
  // The latest order, readable straight away by drop handlers that run before the next render.
  const orderRef = useRef(order);
  const [dragging, setDragging] = useState<string | null>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [width, setWidth] = useState(0);
  const { height: screenH } = useWindowDimensions();

  // Follow the parent's list (items added, removed or reordered elsewhere) while nothing is held.
  const keyString = keys.join('|');
  useEffect(() => {
    if (dragging) return;
    orderRef.current = keyString ? keyString.split('|') : [];
    setOrder(orderRef.current);
  }, [keyString, dragging]);

  const live = order.filter((k) => k in byKey);
  const { rects, height } = packRows(live, spans, heights, width, gap);

  const slots = useSharedValue<Record<string, Rect>>({});
  const activeKey = useSharedValue<string | null>(null);
  const hovered = useSharedValue<string | null>(null);
  const origin = useSharedValue<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const fingerY = useSharedValue(0);
  const startScroll = useSharedValue(0);
  const fallbackRef = useAnimatedRef<Animated.ScrollView>();
  const scroll = useScrollOffset(scrollRef ?? fallbackRef);
  const canScroll = !!scrollRef;

  useEffect(() => {
    slots.value = rects;
  });

  // The latest props, for handlers that must stay the same function across renders (see `Item`).
  const latest = useRef({ onDragStart, onReorder, keyString });
  useLayoutEffect(() => {
    latest.current = { onDragStart, onReorder, keyString };
  });

  function moveOver(key: string, target: string) {
    const o = orderRef.current;
    const from = o.indexOf(key);
    const to = o.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...o];
    next.splice(from, 1);
    next.splice(to, 0, key);
    orderRef.current = next;
    setOrder(next);
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  }

  // Each frame while something is held: scroll near the edges, and swap with whatever is underneath.
  const frame = useFrameCallback(() => {
    const key = activeKey.value;
    if (!key) return;
    if (canScroll) {
      const y = fingerY.value;
      const speed = y < EDGE ? -SPEED : y > screenH - EDGE ? SPEED : 0;
      if (speed) scrollTo(scrollRef ?? fallbackRef, 0, Math.max(0, scroll.value + speed), false);
    }
    const o = origin.value;
    const cx = o.x + tx.value + o.w / 2;
    const cy = o.y + ty.value + (scroll.value - startScroll.value) + o.h / 2;
    let hit: string | null = null;
    const all = slots.value;
    for (const k in all) {
      if (k === key) continue;
      const r = all[k];
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
        hit = k;
        break;
      }
    }
    if (hit !== hovered.value) {
      hovered.value = hit;
      if (hit) scheduleOnRN(moveOver, key, hit);
    }
  }, false);

  const begin = useCallback(
    (key: string) => {
      frame.setActive(true);
      setDragging(key);
      latest.current.onDragStart?.(key);
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [frame]
  );

  const finish = useCallback(() => {
    frame.setActive(false);
    setDragging(null);
    if (orderRef.current.join('|') !== latest.current.keyString) latest.current.onReorder(orderRef.current);
  }, [frame]);

  // Shared values never change identity, so one object lasts the list's lifetime.
  const [shared] = useState(() => ({ slots, activeKey, hovered, origin, tx, ty, fingerY, startScroll, scroll }));

  return (
    <View
      style={{ height, width: '100%' }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityHint={enabled && mode === 'hold' ? 'Hold an item, then drag it to move it' : undefined}>
      {width > 0
        ? live.map((k) => (
            <Item
              key={k}
              id={k}
              rect={rects[k]}
              measured={k in heights}
              mode={mode}
              enabled={enabled}
              shared={shared}
              onBegin={begin}
              onFinish={finish}
              onHeight={(h) => setHeights((prev) => (prev[k] === h ? prev : { ...prev, [k]: h }))}
              render={(handle) => renderItem(byKey[k], { active: dragging === k, handle })}
            />
          ))
        : null}
    </View>
  );
}

interface Shared {
  slots: SharedValue<Record<string, Rect>>;
  activeKey: SharedValue<string | null>;
  hovered: SharedValue<string | null>;
  origin: SharedValue<Rect>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  fingerY: SharedValue<number>;
  startScroll: SharedValue<number>;
  scroll: SharedValue<number>;
}

function Item({
  id,
  rect,
  measured,
  mode,
  enabled,
  shared,
  onBegin,
  onFinish,
  onHeight,
  render,
}: {
  id: string;
  rect: Rect;
  measured: boolean;
  mode: Mode;
  enabled: boolean;
  shared: Shared;
  onBegin: (key: string) => void;
  onFinish: () => void;
  onHeight: (h: number) => void;
  render: (handle: ReactNode) => ReactNode;
}) {
  const { activeKey, hovered, origin, tx, ty, fingerY, startScroll, scroll, slots } = shared;
  const x = useSharedValue(rect.x);
  const y = useSharedValue(rect.y);
  const lift = useSharedValue(0);
  const placed = useSharedValue(false);

  // Glide to a new slot; the first placement (and the held item) jump straight there.
  useEffect(() => {
    if (!measured) return;
    if (!placed.value) {
      x.value = rect.x;
      y.value = rect.y;
      placed.value = true;
    } else if (activeKey.value !== id) {
      x.value = withSpring(rect.x, settle);
      y.value = withSpring(rect.y, settle);
    }
  }, [rect.x, rect.y, measured, id, x, y, placed, activeKey]);

  // The same gesture across renders: rebuilding it mid-drag (the drag itself causes a render) can cancel it.
  const pan = useMemo(() => {
    const gesture = Gesture.Pan()
      .enabled(enabled)
      .maxPointers(1)
      .onStart((e) => {
        const slot = slots.get()[id];
        origin.set({ x: x.get(), y: y.get(), w: slot?.w ?? 0, h: slot?.h ?? 0 });
        tx.set(0);
        ty.set(0);
        fingerY.set(e.absoluteY);
        startScroll.set(scroll.get());
        hovered.set(null);
        activeKey.set(id);
        lift.set(withTiming(1, { duration: 140 }));
        scheduleOnRN(onBegin, id);
      })
      .onUpdate((e) => {
        tx.set(e.translationX);
        ty.set(e.translationY);
        fingerY.set(e.absoluteY);
      })
      .onFinalize(() => {
        if (activeKey.get() !== id) return;
        const o = origin.get();
        x.set(o.x + tx.get());
        y.set(o.y + ty.get() + (scroll.get() - startScroll.get()));
        activeKey.set(null);
        const slot = slots.get()[id];
        if (slot) {
          x.set(withSpring(slot.x, settle));
          y.set(withSpring(slot.y, settle));
        }
        lift.set(withTiming(0, { duration: 180 }));
        scheduleOnRN(onFinish);
      });
    // Holding anywhere waits a moment so the screen can still scroll; a handle grabs on touch, before any scroll starts.
    return mode === 'hold' ? gesture.activateAfterLongPress(HOLD_MS) : gesture.minDistance(0);
  }, [id, enabled, mode, onBegin, onFinish, slots, origin, tx, ty, fingerY, startScroll, scroll, hovered, activeKey, lift, x, y]);

  const handle = useMemo(
    () =>
      mode === 'handle' ? (
        <GestureDetector gesture={pan}>
          <DragGrip />
        </GestureDetector>
      ) : null,
    [mode, pan]
  );

  const style = useAnimatedStyle(() => {
    const held = activeKey.value === id;
    const o = origin.value;
    const left = held ? o.x + tx.value : x.value;
    const top = held ? o.y + ty.value + (scroll.value - startScroll.value) : y.value;
    return {
      zIndex: held || lift.value > 0 ? 10 : 0,
      opacity: placed.value ? 1 : 0,
      // Real layout positions, not a translate: Android ignores transforms when it scrolls a focused
      // text box into view, so with a translate every box looked to be at the top of the list.
      left,
      top,
      transform: [{ scale: 1 + lift.value * 0.03 }],
      shadowOpacity: lift.value * 0.35,
      elevation: lift.value * 12,
    };
  });

  const body = (
    <Animated.View
      style={[{ position: 'absolute', width: rect.w, shadowColor: '#000', shadowRadius: 16 }, style]}
      onLayout={(e) => onHeight(Math.round(e.nativeEvent.layout.height))}>
      {render(handle)}
    </Animated.View>
  );
  return mode === 'hold' ? <GestureDetector gesture={pan}>{body}</GestureDetector> : body;
}
