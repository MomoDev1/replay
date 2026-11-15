import { Tabs } from 'expo-router';
import { Activity, CodeXml, GitBranch, Server, SquareTerminal } from 'lucide-react-native';

import { Sidebar } from '@/components/sidebar';
import { useTablet } from '@/hooks/use-tablet';
import { C } from '@/theme';

export default function TabsLayout() {
  const { tablet, compact } = useTablet();
  return (
    <Tabs
      tabBar={tablet ? (props) => <Sidebar {...props} compact={compact} /> : undefined}
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
      <Tabs.Screen name="code" options={{ title: 'Code', tabBarIcon: ({ color }) => <CodeXml size={20} color={color} /> }} />
      <Tabs.Screen name="git" options={{ title: 'Git', tabBarIcon: ({ color }) => <GitBranch size={20} color={color} /> }} />
      <Tabs.Screen name="monitoring" options={{ title: 'Monitoring', tabBarIcon: ({ color }) => <Activity size={20} color={color} /> }} />
    </Tabs>
  );
}
