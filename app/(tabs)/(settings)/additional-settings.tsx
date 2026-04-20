import { StyleSheet, ScrollView, View, Pressable, Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BackButton } from '@/components/ui/back-button';
import { useAuth } from '@/contexts/auth-context';
import { signOut } from '@/lib/firebase/auth';
import { deleteAccountAndData } from '@/lib/firebase/account-deletion';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const PRIVACY_POLICY_URL = 'https://www.waldgrave.com/escapefromhadesirl/privacy';
const TERMS_OF_SERVICE_URL = 'https://www.waldgrave.com/escapefromhadesirl/terms';

export default function AdditionalSettingsScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            try {
              await deleteAccountAndData(user);
              await signOut();
              router.replace('/(auth)/sign-in');
            } catch (error: any) {
              if (error?.code === 'auth/requires-recent-login') {
                Alert.alert(
                  'Session Expired',
                  'For security, please sign out and sign back in before deleting your account.',
                );
              } else {
                Alert.alert('Error', 'Failed to delete account. Please try again.');
              }
            }
          },
        },
      ],
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <BackButton />
        </View>
      </SafeAreaView>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Legal */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Legal
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <Pressable
            style={styles.row}
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
          >
            <ThemedText style={styles.label}>Privacy Policy</ThemedText>
            <ThemedText style={styles.chevron}>›</ThemedText>
          </Pressable>
          <Pressable
            style={styles.row}
            onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}
          >
            <ThemedText style={styles.label}>Terms of Service</ThemedText>
            <ThemedText style={styles.chevron}>›</ThemedText>
          </Pressable>
        </View>

        {/* Danger Zone */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Danger Zone
        </ThemedText>
        <Pressable
          style={[styles.deleteButton, { borderColor: '#E74C3C' }]}
          onPress={handleDeleteAccount}
        >
          <ThemedText style={styles.deleteText}>Delete Account</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
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
  label: { fontSize: 15 },
  chevron: { fontSize: 20, opacity: 0.3, fontWeight: '300' },
  deleteButton: {
    marginTop: 24,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteText: { color: '#E74C3C', fontWeight: '600', fontSize: 16 },
});
