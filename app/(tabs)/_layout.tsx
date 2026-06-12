import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        // Tabs stay mounted when blurred; without freeze, every record write
        // re-renders all four tab trees (e.g. a habit tap recomputing quest
        // scores and stats charts in the background).
        freezeOnBlur: true,
      }}>
      <Tabs.Screen
        name="(habits)"
        options={{
          title: 'Habits',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="checkmark.square.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="(notes)"
        options={{
          title: 'Notes',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="doc.text.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="(quests)"
        options={{
          title: 'Quests',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 20, fontWeight: '900', lineHeight: 28 }}>W</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="(settings)"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
