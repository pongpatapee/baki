import { Ionicons } from '@expo/vector-icons';
import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';

import { ActiveWorkoutBar } from '@/components/ActiveWorkoutBar';
import type { IconName } from '@/components/ui';
import { useTheme } from '@/theme/AppProviders';

const TABS: { name: string; title: string; icon: IconName; iconFocused: IconName }[] = [
  { name: 'index', title: 'Workout', icon: 'barbell-outline', iconFocused: 'barbell' },
  { name: 'history', title: 'History', icon: 'time-outline', iconFocused: 'time' },
  { name: 'exercises', title: 'Exercises', icon: 'list-outline', iconFocused: 'list' },
  { name: 'stats', title: 'Stats', icon: 'stats-chart-outline', iconFocused: 'stats-chart' },
  { name: 'settings', title: 'Settings', icon: 'settings-outline', iconFocused: 'settings' },
];

export default function TabLayout() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: t.colors.background },
          headerTintColor: t.colors.text,
          headerTitleStyle: { fontWeight: '700', fontSize: 20 },
          headerShadowVisible: false,
          headerTitleAlign: 'left',
          sceneStyle: { backgroundColor: t.colors.background },
          tabBarStyle: { backgroundColor: t.colors.surface, borderTopColor: t.colors.border },
          tabBarActiveTintColor: t.colors.primary,
          tabBarInactiveTintColor: t.colors.textFaint,
        }}
        tabBar={(props) => (
          <View>
            <ActiveWorkoutBar />
            <BottomTabBar {...props} />
          </View>
        )}
      >
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? tab.iconFocused : tab.icon} size={size} color={color as string} />
              ),
            }}
          />
        ))}
      </Tabs>
    </View>
  );
}
