import type { BottomTabBarProps } from 'expo-router/tabs';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Plus, Settings } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Dot, Mono } from '@/components/ui';
import { useSession } from '@/store/session';
import { C } from '@/theme';

type Props = BottomTabBarProps & { compact: boolean };

/** Left navigation for tablets, used as the Tabs `tabBar` with `tabBarPosition: 'left'`. */
export function Sidebar({ state, descriptors, emitter, navigateToTab, insets, compact }: Props) {
  const session = useSession();

  return (
    <View style={[st.root, compact && st.rootCompact, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, paddingLeft: insets.left + (compact ? 10 : 14) }]}>
      <View style={[st.brand, compact && { justifyContent: 'center', paddingHorizontal: 0 }]}>
        <Image source={require('../../assets/images/icon.png')} style={st.logo} />
        {!compact && <Text style={st.brandName}>Hop</Text>}
      </View>

      <Pressable
        onPress={() => router.push('/server/new')}
        accessibilityLabel="Nouveau serveur"
        style={({ pressed }) => [st.newBtn, compact && st.newBtnCompact, { opacity: pressed ? 0.8 : 1 }]}>
        <Plus size={18} color="#fff" />
        {!compact && <Text style={st.newLabel}>Nouveau serveur</Text>}
      </Pressable>

      {!compact && <Text style={st.section}>NAVIGATION</Text>}
      <View role="tablist" style={{ gap: 2, marginTop: compact ? 16 : 0 }}>
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;
          const color = focused ? C.accent : C.muted;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Item key={route.key} label={label} compact={compact} focused={focused} onPress={onPress} icon={options.tabBarIcon?.({ focused, color, size: 20 })}>
              {route.name === 'terminal' && session?.open && <Dot color={C.green} size={7} />}
            </Item>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />

      {session && !compact && (
        <Pressable onPress={() => router.navigate('/terminal')} style={st.session}>
          <View style={[st.row, { gap: 8 }]}>
            <Dot color={session.open ? C.green : C.dim} size={8} />
            <Text style={st.sessionTitle} numberOfLines={1}>{session.server.name}</Text>
          </View>
          <Mono style={{ color: C.muted, fontSize: 11 }} numberOfLines={1}>
            {session.server.user}@{session.server.host}
          </Mono>
          <Text style={{ color: session.open ? C.green : C.muted, fontSize: 11 }} numberOfLines={1}>
            {session.open ? `Connecté · ${session.latencyMs} ms` : session.closedReason ?? 'Déconnecté'}
          </Text>
        </Pressable>
      )}

      <Item label="Réglages" compact={compact} focused={false} onPress={() => router.push('/settings')} icon={<Settings size={20} color={C.muted} />} />
    </View>
  );
}

function Item({ label, icon, focused, compact, onPress, children }: { label: string; icon: ReactNode; focused: boolean; compact: boolean; onPress: () => void; children?: ReactNode }) {
  return (
    <Pressable
      role="tab"
      aria-selected={focused}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [st.item, compact && st.itemCompact, focused && st.itemActive, pressed && !focused && { backgroundColor: C.surface2 }]}>
      {icon}
      {!compact && <Text style={[st.itemLabel, focused && { color: C.text, fontWeight: '600' }]}>{label}</Text>}
      {children && <View style={compact ? st.badgeCompact : { marginLeft: 'auto' }}>{children}</View>}
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { width: 248, backgroundColor: C.surface, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border, paddingRight: 14 },
  rootCompact: { width: 76, paddingRight: 10, alignItems: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, marginBottom: 18 },
  logo: { width: 32, height: 32, borderRadius: 8 },
  brandName: { color: C.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.accent, borderRadius: 10, paddingVertical: 11, marginBottom: 22 },
  newBtnCompact: { width: 44, height: 44, alignSelf: 'center', paddingVertical: 0, borderRadius: 22, marginBottom: 0 },
  newLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },
  section: { color: C.dim, fontSize: 11, fontWeight: '600', letterSpacing: 1, paddingHorizontal: 10, marginBottom: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, minHeight: 44, borderRadius: 10 },
  itemCompact: { justifyContent: 'center', paddingHorizontal: 0, width: 52, height: 48, alignSelf: 'center' },
  itemActive: { backgroundColor: C.accentBg },
  itemLabel: { color: C.muted, fontSize: 15 },
  badgeCompact: { position: 'absolute', top: 8, right: 10 },
  session: { backgroundColor: C.surface2, borderRadius: 12, padding: 12, gap: 4, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  sessionTitle: { color: C.text, fontWeight: '600', fontSize: 14, flexShrink: 1 },
});
