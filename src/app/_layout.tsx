import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium, GeistMono_600SemiBold } from '@expo-google-fonts/geist-mono';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LockGate } from '@/components/lock-gate';
import { useTablet } from '@/hooks/use-tablet';
import { DB_NAME, migrate } from '@/lib/db';
import { ServersProvider } from '@/store/servers';
import { SnippetsProvider } from '@/store/snippets';
import { C } from '@/theme';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.accent } };

const sheet = { presentation: 'formSheet', sheetGrabberVisible: true, sheetCornerRadius: 20, contentStyle: { backgroundColor: C.surface } } as const;

export default function RootLayout() {
  const { tablet } = useTablet();
  // Geist is the tablet layout's typeface (phones keep the system font).
  const [fontsLoaded, fontError] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, GeistMono_400Regular, GeistMono_500Medium, GeistMono_600SemiBold });
  if (!fontsLoaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
      <ServersProvider>
      <SnippetsProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
          <Stack.Screen name="(tabs)" />
          {/* Tablets draw the form as a centered card over the current screen. */}
          <Stack.Screen name="server/new" options={tablet ? { presentation: 'transparentModal', animation: 'fade' } : { presentation: 'modal' }} />
          <Stack.Screen name="connect/[id]" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="quick-commands" options={{ ...sheet, sheetAllowedDetents: [0.75] }} />
          <Stack.Screen name="snippet/[id]" options={{ ...sheet, sheetAllowedDetents: [0.6, 0.9] }} />
          <Stack.Screen name="snippet/edit" options={{ ...sheet, sheetAllowedDetents: [0.9] }} />
          <Stack.Screen name="key/import" options={{ ...sheet, sheetAllowedDetents: [0.9] }} />
          <Stack.Screen name="key/[id]" options={{ ...sheet, sheetAllowedDetents: [0.9] }} />
          <Stack.Screen name="git/branch" options={{ ...sheet, sheetAllowedDetents: [0.8] }} />
          <Stack.Screen name="git/revert" options={{ ...sheet, sheetAllowedDetents: [0.65] }} />
          <Stack.Screen name="git/pull" options={{ ...sheet, sheetAllowedDetents: [0.75] }} />
          <Stack.Screen name="git/commit" options={{ ...sheet, sheetAllowedDetents: [0.8] }} />
          <Stack.Screen name="git/stash" options={{ ...sheet, sheetAllowedDetents: [0.7] }} />
          <Stack.Screen name="git/tags" options={{ ...sheet, sheetAllowedDetents: [0.8] }} />
          <Stack.Screen name="git/repo" options={{ ...sheet, sheetAllowedDetents: [0.8] }} />
          <Stack.Screen name="git/accounts" options={{ ...sheet, sheetAllowedDetents: [0.9] }} />
          <Stack.Screen name="git/pr/merge" options={{ ...sheet, sheetAllowedDetents: [0.85] }} />
          <Stack.Screen name="monitoring/logs" options={{ ...sheet, sheetAllowedDetents: [0.85] }} />
          <Stack.Screen name="code/edit" />
          <Stack.Screen name="code/search" options={{ ...sheet, sheetAllowedDetents: [0.9] }} />
          <Stack.Screen name="code/new" options={{ ...sheet, sheetAllowedDetents: [0.5] }} />
        </Stack>
        <LockGate />
      </ThemeProvider>
      </SnippetsProvider>
      </ServersProvider>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}
