import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, View } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';

import { useSession } from '@/store/session';
import { alpha, T } from '@/tablet/theme';
import { Dot, Tx } from '@/tablet/ui';

/** Glyph and label of each tab, as drawn in the design's rail. */
const ITEMS: Record<string, { g: string; t: string }> = {
  index: { g: '▤', t: 'Serveurs' },
  terminal: { g: '>_', t: 'Terminal' },
  commands: { g: '{ }', t: 'Snippets' },
  code: { g: '</>', t: 'Code' },
  git: { g: '⑂', t: 'Git' },
  deploy: { g: '↑', t: 'Déployer' },
  monitoring: { g: '∿', t: 'Monitoring' },
  preferences: { g: '⚙', t: 'Réglages' },
};

export function HopMark({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 74 Q 50 6 82 74" stroke={T.green} strokeWidth={10} />
      <Polyline points="70,66 82,74 86,60" stroke={T.green} strokeWidth={10} />
    </Svg>
  );
}

/** 88 px navigation rail for tablets, used as the Tabs `tabBar` with `tabBarPosition: 'left'`. */
export function Rail({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const session = useSession();

  const item = (routeKey: string, name: string, focused: boolean) => {
    const it = ITEMS[name];
    if (!it) return null;
    const color = focused ? T.blue : T.dim;
    return (
      <Pressable
        key={routeKey}
        role="tab"
        aria-selected={focused}
        accessibilityLabel={it.t}
        onPress={() => {
          const event = emitter.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(routeKey);
        }}
        style={({ pressed }) => ({ width: 72, height: 62, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: focused ? alpha(T.blue, 0.12) : pressed ? T.field : 'transparent' })}>
        <Tx mono={name !== 'preferences'} w={600} style={{ fontSize: name === 'preferences' ? 17 : 16, lineHeight: 18, color }}>
          {it.g}
        </Tx>
        <Tx w={500} style={{ fontSize: 11, color }}>
          {it.t}
        </Tx>
        {name === 'terminal' && session?.open && (
          <View style={{ position: 'absolute', top: 10, right: 16 }}>
            <Dot color={T.green} size={7} />
          </View>
        )}
      </Pressable>
    );
  };

  const settings = state.routes.find((r) => r.name === 'preferences');

  return (
    <View style={{ width: 88 + insets.left, paddingLeft: insets.left, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 20, alignItems: 'center', gap: 6, backgroundColor: T.rail, borderRightWidth: 1, borderColor: T.line }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: T.bg, borderWidth: 1, borderColor: '#2A2F36', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <HopMark />
      </View>
      {state.routes.map((r, i) => (r.name === 'preferences' ? null : item(r.key, r.name, i === state.index)))}
      <View style={{ flex: 1 }} />
      {settings && item(settings.key, settings.name, state.routes[state.index]?.key === settings.key)}
    </View>
  );
}
