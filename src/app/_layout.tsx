import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DB_NAME, migrate } from '@/lib/db';
import { ServersProvider } from '@/store/servers';
import { C } from '@/theme';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.accent } };

const sheet = { presentation: 'formSheet', sheetGrabberVisible: true, sheetCornerRadius: 20, contentStyle: { backgroundColor: C.surface } } as const;

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
      <ServersProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="server/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="connect/[id]" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="quick-commands" options={{ ...sheet, sheetAllowedDetents: [0.75] }} />
          <Stack.Screen name="snippet/[id]" options={{ ...sheet, sheetAllowedDetents: [0.6] }} />
          <Stack.Screen name="key/import" options={{ ...sheet, sheetAllowedDetents: [0.9] }} />
          <Stack.Screen name="git/branch" options={{ ...sheet, sheetAllowedDetents: [0.8] }} />
          <Stack.Screen name="git/revert" options={{ ...sheet, sheetAllowedDetents: [0.65] }} />
          <Stack.Screen name="git/pull" options={{ ...sheet, sheetAllowedDetents: [0.75] }} />
          <Stack.Screen name="deploy/confirm" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="deploy/progress" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        </Stack>
      </ThemeProvider>
      </ServersProvider>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}
