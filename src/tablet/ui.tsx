import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alpha, envTone, monoF, sans, T } from '@/tablet/theme';
import type { Env } from '@/theme';

/** Geist text, 15 px, primary colour unless overridden. */
export function Tx({ style, w = 400, mono, ...rest }: TextProps & { w?: 400 | 500 | 600 | 700; mono?: boolean }) {
  return <Text {...rest} style={[{ color: T.text, fontSize: 15 }, mono ? monoF(w) : sans(w), style]} />;
}

/** Screen body next to the rail: the status bar area is padded, everything below is laid out in a row. */
export function TabletScreen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { top, right, bottom } = useSafeAreaInsets();
  return <View style={[{ flex: 1, flexDirection: 'row', backgroundColor: T.bg, paddingTop: top, paddingRight: right, paddingBottom: bottom }, style]}>{children}</View>;
}

/** Monospace upper-case section label (`ACTIVITÉ RÉCENTE`). */
export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Tx mono style={[{ fontSize: 11, letterSpacing: 1.1, color: T.dim }, style]}>
      {children}
    </Tx>
  );
}

const ENV_TEXT: Record<Env, string> = { prod: 'PROD', staging: 'STAGING', dev: 'DEV' };

export function EnvTag({ env, size = 'md', short }: { env: Env; size?: 'sm' | 'md' | 'lg'; short?: boolean }) {
  const c = envTone[env];
  const d = { sm: { fs: 9.5, px: 5, py: 2, r: 4 }, md: { fs: 10, px: 6, py: 3, r: 5 }, lg: { fs: 11, px: 8, py: 4, r: 6 } }[size];
  return (
    <View style={{ paddingHorizontal: d.px, paddingVertical: d.py, borderRadius: d.r, backgroundColor: alpha(c, 0.15) }}>
      <Tx mono w={600} style={{ fontSize: d.fs, letterSpacing: d.fs * 0.08, color: c }}>
        {short && env === 'staging' ? 'STG' : ENV_TEXT[env]}
      </Tx>
    </View>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, flexShrink: 0 }} />;
}

export const card: ViewStyle = { backgroundColor: T.card, borderWidth: 1, borderColor: T.cardLine, borderRadius: 14, overflow: 'hidden' };

/** Row inside a bordered list card (bottom hairline like the design's `border-bottom`). */
export function ListRow({ children, style, onPress, last }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; last?: boolean }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderColor: T.cardLine, backgroundColor: pressed ? T.field : undefined }, style]}>
      {children}
    </Pressable>
  );
}

/** Round `+` button (42 px, accent). */
export function PlusButton({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, backgroundColor: T.blue, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Tx style={{ fontSize: 26, lineHeight: 30, color: T.ink }}>+</Tx>
    </Pressable>
  );
}

/** Accent square with a play triangle, as on the snippet and favourite cards. */
export function PlayButton({ onPress, size = 40, radius = 12, disabled }: { onPress: () => void; size?: number; radius?: number; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel="Coller dans le terminal" style={({ pressed }) => ({ width: size, height: size, borderRadius: radius, backgroundColor: T.blue, alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 })}>
      <View style={{ width: 0, height: 0, marginLeft: 3, borderLeftWidth: 10, borderLeftColor: T.ink, borderTopWidth: 6, borderTopColor: 'transparent', borderBottomWidth: 6, borderBottomColor: 'transparent' }} />
    </Pressable>
  );
}

type BtnKind = 'primary' | 'ghost' | 'outline' | 'danger';

export function Btn({ title, onPress, kind = 'primary', height = 44, radius = 12, style, disabled, icon, textStyle }: { title: string; onPress?: () => void; kind?: BtnKind; height?: number; radius?: number; style?: StyleProp<ViewStyle>; disabled?: boolean; icon?: ReactNode; textStyle?: StyleProp<TextStyle> }) {
  const v = {
    primary: { bg: T.blue, fg: T.ink, bd: 'transparent' },
    ghost: { bg: T.field, fg: T.text, bd: 'transparent' },
    outline: { bg: 'transparent', fg: T.text, bd: T.btnLine },
    danger: { bg: 'transparent', fg: T.red, bd: alpha(T.red, 0.5) },
  }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [{ height, borderRadius: radius, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: v.bg, borderWidth: 1, borderColor: v.bd, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, style]}>
      {icon}
      <Tx w={600} style={[{ fontSize: 14, color: v.fg }, textStyle]} numberOfLines={1}>
        {title}
      </Tx>
    </Pressable>
  );
}

/** Segmented control: dark track, raised active pill. */
export function Seg<V extends string>({ options, value, onChange, height = 40, radius = 11, itemWidth, style, fontSize = 13 }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; height?: number; radius?: number; itemWidth?: number; style?: StyleProp<ViewStyle>; fontSize?: number }) {
  return (
    <View style={[{ height, borderRadius: radius, backgroundColor: T.field, padding: 3, flexDirection: 'row', gap: 3 }, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ flex: itemWidth ? undefined : 1, width: itemWidth, paddingHorizontal: itemWidth ? 0 : 14, borderRadius: radius - 3, backgroundColor: on ? T.segOn : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            <Tx w={600} style={{ fontSize, color: on ? T.text : T.muted }} numberOfLines={1}>
              {o.label}
            </Tx>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * CSS `grid-template-columns: repeat(auto-fit | auto-fill, minmax(min, 1fr))`.
 * auto-fit stretches the items when there are fewer than the columns that fit; auto-fill keeps the empty tracks.
 */
export function Grid({ min, gap = 10, fill, columns, children, style }: { min?: number; gap?: number; fill?: boolean; columns?: number; children: ReactNode[]; style?: StyleProp<ViewStyle> }) {
  const [w, setW] = useState(0);
  const items = children.filter(Boolean);
  const fits = columns ?? Math.max(1, Math.floor((w + gap) / ((min ?? 150) + gap)));
  const cols = fill || columns ? fits : Math.max(1, Math.min(fits, items.length));
  const itemW = w ? (w - gap * (cols - 1)) / cols : 0;
  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={[{ flexDirection: 'row', flexWrap: 'wrap', gap }, style]}>
      {w > 0 &&
        items.map((child, i) => (
          <View key={i} style={{ width: itemW }}>
            {child}
          </View>
        ))}
    </View>
  );
}

/** Thin progress track. */
export function Meter({ pct, color, height = 5 }: { pct: number; color: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: T.chip, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}

/** Vertical divider between master and detail columns. */
export const vline: ViewStyle = { borderRightWidth: 1, borderColor: T.line };

/** Centered empty state used when a pane has nothing to show. */
export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 }}>
      <Tx w={600} style={{ fontSize: 20 }}>
        {title}
      </Tx>
      {!!text && <Tx style={{ fontSize: 14, color: T.muted, textAlign: 'center', maxWidth: 420 }}>{text}</Tx>}
      {action}
    </View>
  );
}

export const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  h1: { fontSize: 28, letterSpacing: -0.56, color: T.text },
});
