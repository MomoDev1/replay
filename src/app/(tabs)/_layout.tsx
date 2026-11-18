import { Tabs } from 'expo-router';
import { Activity, CodeXml, GitBranch, Server, SquareTerminal } from 'lucide-react-native';

import { useTablet } from '@/hooks/use-tablet';
import { Rail } from '@/tablet/rail';
import { C } from '@/theme';

export default function TabsLayout() {
  const { tablet } = useTablet();
  // Snippets, deploy and settings get a rail entry on tablets; phones keep reaching them from their own screens.
  const tabletOnly = tablet ? {} : { href: null };
  return (
    <Tabs
      tabBar={tablet ? (props) => <Rail {...props} /> : undefined}
      screenOptions={{
        headerShown: false,
        tabBarPosition: tablet ? 'left' : 'bottom',
        tabBarHideOnKeyboard: !tablet,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.border },
        tabBarLabelStyle: { fontSize: 10 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Serveurs', tabBarIcon: ({ color }) => <Server size={20} color={color} /> }} />
      <Tabs.Screen name="terminal" options={{ title: 'Terminal', tabBarIcon: ({ color }) => <SquareTerminal size={20} color={color} /> }} />
      <Tabs.Screen name="commands" options={{ title: 'Snippets', ...tabletOnly }} />
      <Tabs.Screen name="code" options={{ title: 'Code', tabBarIcon: ({ color }) => <CodeXml size={20} color={color} /> }} />
      <Tabs.Screen name="git" options={{ title: 'Git', tabBarIcon: ({ color }) => <GitBranch size={20} color={color} /> }} />
      <Tabs.Screen name="deploy" options={{ title: 'Déployer', ...tabletOnly }} />
      <Tabs.Screen name="monitoring" options={{ title: 'Monitoring', tabBarIcon: ({ color }) => <Activity size={20} color={color} /> }} />
      <Tabs.Screen name="preferences" options={{ title: 'Réglages', ...tabletOnly }} />
    </Tabs>
  );
}
