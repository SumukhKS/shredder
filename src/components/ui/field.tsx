import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Fonts, Radius, Space } from '@/constants/theme';

import { AppText } from './text';
import { useColors } from './theme';

interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  suffix?: string;
  /** Extra control at the end of the box, e.g. a show-password toggle. */
  right?: React.ReactNode;
  ref?: React.ComponentProps<typeof TextInput>['ref'];
}

export function Field({ label, hint, error, suffix, right, style, onFocus, onBlur, ...rest }: FieldProps) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: Space.xs }}>
      {label ? (
        <AppText variant="smallBold" color="textMuted">
          {label}
        </AppText>
      ) : null}
      <View style={[styles.box, { backgroundColor: c.surface, borderColor: error ? c.danger : focused ? c.primary : c.border }]}>
        <TextInput
          placeholderTextColor={c.textMuted}
          style={[styles.input, { color: c.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object), style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {suffix ? (
          <AppText variant="smallBold" color="textMuted">
            {suffix}
          </AppText>
        ) : null}
        {right}
      </View>
      {error ? (
        <AppText variant="small" color="danger">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" color="textMuted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: Radius.row,
    paddingHorizontal: Space.lg,
    minHeight: 50,
    gap: Space.sm,
  },
  input: { flex: 1, minWidth: 0, fontFamily: Fonts.body, fontSize: 16, paddingVertical: Space.md },
});
