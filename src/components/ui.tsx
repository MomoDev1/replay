import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { C, envColor, mono, type Env } from '@/theme';

export function Mono({ style, children, ...rest }: { style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; selectable?: boolean }) {
  return (
    <Text style={[{ fontFamily: mono, color: C.text, fontSize: 13 }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

export function EnvBadge({ env }: { env: Env }) {
  const color = envColor[env];
  return (
    <View style={[s.badge, { borderColor: color + '55', backgroundColor: color + '22' }]}>
      <Mono style={{ color, fontSize: 10, fontWeight: '700' }}>{env.toUpperCase()}</Mono>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionLabel({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.section}>{children.toUpperCase()}</Text>
      {right}
    </View>
  );
}

type BtnVariant = 'primary' | 'danger' | 'ghost' | 'outlineDanger';

export function Button({ title, onPress, variant = 'primary', icon, style }: { title: string; onPress?: () => void; variant?: BtnVariant; icon?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = {
    primary: { bg: C.accent, fg: '#fff', border: C.accent },
    danger: { bg: C.red, fg: '#fff', border: C.red },
    ghost: { bg: C.surface2, fg: C.text, border: C.border },
    outlineDanger: { bg: C.redBg, fg: C.red, border: C.red },
  }[variant];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.btn, { backgroundColor: v.bg, borderColor: v.border, opacity: pressed ? 0.8 : 1 }, style]}>
      {icon}
      <Text style={{ color: v.fg, fontWeight: '600', fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.seg}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segItem, o.value === value && s.segActive]}>
          <Text style={{ color: o.value === value ? C.text : C.muted, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SheetHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={s.sheetTitle}>{title}</Text>
        {subtitle}
      </View>
      <Pressable onPress={() => router.back()} style={s.close} hitSlop={8}>
        <X size={16} color={C.muted} />
      </Pressable>
    </View>
  );
}

/**
 * Root of every form sheet: the whole sheet scrolls.
 * On iOS, react-native-screens resizes the sheet's ScrollView to the sheet's frame and (on Fabric) pins it to
 * the sheet's top-left corner, so a ScrollView placed under a header or a search field is drawn over them.
 * Making the ScrollView the sheet's root is the only layout it handles correctly: never nest a vertical
 * ScrollView or FlatList inside a sheet, render lists as plain children of `Sheet` instead.
 */
export function Sheet({ children, contentContainerStyle, ...rest }: ScrollViewProps) {
  return (
    <ScrollView
      style={s.sheetRoot}
      contentContainerStyle={[s.sheetContent, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      {...rest}>
      {children}
    </ScrollView>
  );
}

export function Radio({ on }: { on: boolean }) {
  return (
    <View style={[s.radio, on && { borderColor: C.accent }]}>
      {on && <View style={s.radioIn} />}
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  h1: { color: C.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  h2: { color: C.text, fontSize: 20, fontWeight: '700' },
  muted: { color: C.muted, fontSize: 13 },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  card: { backgroundColor: C.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, padding: 14 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 8, paddingHorizontal: 4 },
  section: { color: C.muted, fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  btn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1 },
  seg: { flexDirection: 'row', backgroundColor: C.surface2, borderRadius: 10, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  segActive: { backgroundColor: '#34343C' },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: '700' },
  close: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.dim, alignItems: 'center', justifyContent: 'center' },
  radioIn: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  row: { flexDirection: 'row', alignItems: 'center' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  sheetRoot: { flex: 1, backgroundColor: C.surface },
  sheetContent: { padding: 20, paddingBottom: 40 },
});
