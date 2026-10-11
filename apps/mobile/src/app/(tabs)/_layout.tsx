import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { colors, fonts } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.orange,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.line, minHeight: 60 },
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Ticket', tabBarIcon: icon('ticket') }} />
      <Tabs.Screen name="lineup" options={{ title: 'Lineup', tabBarIcon: icon('musical-notes') }} />
      <Tabs.Screen name="info" options={{ title: 'Info', tabBarIcon: icon('information-circle') }} />
      <Tabs.Screen name="sponsors" options={{ title: 'Sponsors', tabBarIcon: icon('star') }} />
      <Tabs.Screen name="updates" options={{ title: 'Updates', tabBarIcon: icon('notifications') }} />
    </Tabs>
  );
}
