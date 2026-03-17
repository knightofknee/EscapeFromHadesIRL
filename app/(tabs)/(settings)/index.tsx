import { StyleSheet, ScrollView, View, Pressable, Switch, Alert } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import { signOut } from '@/lib/firebase/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppearance } from '@/hooks/use-appearance';

export default function SettingsScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { appearance, setAppearance } = useAppearance();

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/sign-in');
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Account */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Account
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <View style={styles.row}>
            <ThemedText style={styles.label}>Email</ThemedText>
            <ThemedText style={styles.value}>{user?.email ?? 'Not signed in'}</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText style={styles.label}>Provider</ThemedText>
            <ThemedText style={styles.value}>
              {user?.providerData[0]?.providerId === 'google.com'
                ? 'Google'
                : user?.providerData[0]?.providerId === 'apple.com'
                  ? 'Apple'
                  : 'Email'}
            </ThemedText>
          </View>
        </View>

        {/* Appearance */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Appearance
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <Pressable
            style={[styles.row, appearance === 'system' && styles.selectedRow]}
            onPress={() => setAppearance('system')}
          >
            <ThemedText style={styles.label}>System Default</ThemedText>
            {appearance === 'system' && <ThemedText style={{ color: colors.tint }}>✓</ThemedText>}
          </Pressable>
          <Pressable
            style={[styles.row, appearance === 'light' && styles.selectedRow]}
            onPress={() => setAppearance('light')}
          >
            <ThemedText style={styles.label}>Light</ThemedText>
            {appearance === 'light' && <ThemedText style={{ color: colors.tint }}>✓</ThemedText>}
          </Pressable>
          <Pressable
            style={[styles.row, appearance === 'dark' && styles.selectedRow]}
            onPress={() => setAppearance('dark')}
          >
            <ThemedText style={styles.label}>Dark</ThemedText>
            {appearance === 'dark' && <ThemedText style={{ color: colors.tint }}>✓</ThemedText>}
          </Pressable>
        </View>

        {/* Data */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Data
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <Pressable
            style={styles.row}
            onPress={() => router.push('/(tabs)/(habits)/import')}
          >
            <ThemedText style={styles.label}>Import Calendar</ThemedText>
            <ThemedText style={styles.chevron}>›</ThemedText>
          </Pressable>
          <Pressable
            style={styles.row}
            onPress={() => router.push('/(tabs)/(notes)/export')}
          >
            <ThemedText style={styles.label}>Export Notes</ThemedText>
            <ThemedText style={styles.chevron}>›</ThemedText>
          </Pressable>
        </View>

        {/* Sign Out */}
        <Pressable
          style={[styles.signOutButton, { borderColor: '#E74C3C' }]}
          onPress={handleSignOut}
        >
          <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 8 },
  sectionHeader: { fontSize: 13, opacity: 0.5, marginTop: 12, marginLeft: 4, textTransform: 'uppercase' },
  card: { borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.15)',
  },
  selectedRow: { opacity: 1 },
  label: { fontSize: 15 },
  value: { fontSize: 15, opacity: 0.6 },
  chevron: { fontSize: 20, opacity: 0.3, fontWeight: '300' },
  signOutButton: {
    marginTop: 24,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutText: { color: '#E74C3C', fontWeight: '600', fontSize: 16 },
});
