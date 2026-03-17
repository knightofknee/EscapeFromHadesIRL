import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type StatsCardProps = {
  label: string;
  value: string | number;
  subtitle?: string;
  color?: string;
};

export function StatsCard({ label, value, subtitle, color }: StatsCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <ThemedText style={[styles.value, color ? { color } : undefined]}>{value}</ThemedText>
      {subtitle ? <ThemedText style={styles.subtitle}>{subtitle}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 100,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: 'center',
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 11,
    opacity: 0.5,
  },
});
