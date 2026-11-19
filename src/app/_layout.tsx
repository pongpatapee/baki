import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading, Text } from '@/components/ui';
import { db } from '@/db/client';
import migrations from '@/db/migrations';
import { seedIfNeeded } from '@/db/seed';
import { AppProviders, useTheme } from '@/theme/AppProviders';

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);
  const [seeded, setSeeded] = useState(false);
  const [seedError, setSeedError] = useState<Error | null>(null);

  useEffect(() => {
    if (!success) return;
    seedIfNeeded()
      .then(() => setSeeded(true))
      .catch((e: unknown) => setSeedError(e instanceof Error ? e : new Error(String(e))));
  }, [success]);

  const fatal = error ?? seedError;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          {fatal ? <FatalError error={fatal} /> : !success || !seeded ? <Loading /> : <RootStack />}
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootStack() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.colors.background },
          headerTintColor: t.colors.text,
          headerTitleStyle: { fontWeight: '600' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.colors.background },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="workout/active" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="exercise-picker" options={{ presentation: 'modal', title: 'Select Exercises' }} />
        <Stack.Screen name="exercise/edit" options={{ presentation: 'modal', title: 'Exercise' }} />
        <Stack.Screen
          name="workout/summary/[id]"
          options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen name="routine/edit" options={{ presentation: 'fullScreenModal', title: 'Routine' }} />
      </Stack>
    </>
  );
}

function FatalError({ error }: { error: Error }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: t.colors.background, gap: 12 }}>
      <Text variant="title">Something went wrong</Text>
      <Text muted>The database could not be opened. Your data has not been modified.</Text>
      <Text variant="caption" faint selectable>
        {error.message}
      </Text>
    </View>
  );
}
