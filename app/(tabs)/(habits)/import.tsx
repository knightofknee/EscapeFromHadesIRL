import { useState } from 'react';
import { StyleSheet, ScrollView, View, Pressable, Image, Alert, TextInput, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useHabits } from '@/hooks/use-habits';
import { useAuth } from '@/contexts/auth-context';
import { db, doc, setDoc } from '@/lib/firebase/firestore';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { parseCalendarBlocks, type ParsedCalendar } from '@/lib/ocr/calendar-parser';
import { extractTextFromImage } from '@/lib/ocr/vision-api';
import type { HabitRecord } from '@/types/habit';

type ImportStep = 'capture' | 'processing' | 'review' | 'done';

export default function ImportScreen() {
  const { habits } = useHabits();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { height: winHeight } = useWindowDimensions();
  const previewHeight = Math.round(Math.min(320, Math.max(180, winHeight * 0.28)));

  const [step, setStep] = useState<ImportStep>('capture');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [parsedCalendar, setParsedCalendar] = useState<ParsedCalendar | null>(null);
  const [yearMonth, setYearMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  async function processImage(uri: string) {
    setStep('processing');
    try {
      const blocks = await extractTextFromImage(uri);
      const [yearStr, monthStr] = yearMonth.split('-');
      const parsed = parseCalendarBlocks(blocks, parseInt(yearStr), parseInt(monthStr) - 1);
      setParsedCalendar(parsed);
      setStep('review');
    } catch (e: any) {
      Alert.alert('OCR Error', e.message ?? 'Failed to extract text');
      setStep('capture');
    }
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setImageUri(uri);
      await processImage(uri);
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setImageUri(uri);
      await processImage(uri);
    }
  }

  async function handleImport() {
    if (!user || !parsedCalendar) return;

    const daysWithMarks = parsedCalendar.days.filter((d) => d.marks.length > 0);
    if (daysWithMarks.length === 0) {
      Alert.alert('No data', 'No habit marks detected in the calendar.');
      return;
    }

    let imported = 0;
    for (const day of daysWithMarks) {
      for (const mark of day.marks) {
        const matchedHabit = habits.find(
          (h) =>
            h.abbreviation.toLowerCase() === mark.toLowerCase() ||
            h.name.toLowerCase().startsWith(mark.toLowerCase()),
        );

        if (matchedHabit) {
          const docId = `${matchedHabit.id}_${day.date}`;
          const record: HabitRecord = {
            id: docId,
            habitId: matchedHabit.id,
            userId: user.uid,
            date: day.date,
            value: true,
            recordedAt: Date.now(),
          };
          await setDoc(doc(db, 'records', docId), record, { merge: true });
          imported++;
        }
      }
    }

    Alert.alert('Import Complete', `Imported ${imported} records from ${daysWithMarks.length} days.`);
    setStep('done');
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title">Import Calendar</ThemedText>
        <ThemedText style={styles.description}>
          Photograph a physical calendar to import past habit data. Text recognition runs on-device.
        </ThemedText>

        {/* Month selector */}
        <ThemedText type="defaultSemiBold" style={styles.label}>
          Calendar Month
        </ThemedText>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.tileBorder }]}
          value={yearMonth}
          onChangeText={setYearMonth}
          placeholder="YYYY-MM"
          placeholderTextColor={colors.icon}
        />

        {step === 'capture' && (
          <View style={styles.captureButtons}>
            <Pressable style={[styles.captureButton, { backgroundColor: colors.tint }]} onPress={pickImage}>
              <ThemedText style={styles.captureText}>Choose Photo</ThemedText>
            </Pressable>
            <Pressable style={[styles.captureButton, { backgroundColor: colors.tint }]} onPress={takePhoto}>
              <ThemedText style={styles.captureText}>Take Photo</ThemedText>
            </Pressable>
          </View>
        )}

        {imageUri && (
          <Image source={{ uri: imageUri }} style={[styles.preview, { height: previewHeight }]} resizeMode="contain" />
        )}

        {step === 'processing' && (
          <ThemedText style={styles.statusText}>Recognizing text...</ThemedText>
        )}

        {step === 'review' && parsedCalendar && (
          <View style={styles.reviewSection}>
            <ThemedText type="defaultSemiBold">
              Detected {parsedCalendar.days.filter((d) => d.marks.length > 0).length} days with marks
            </ThemedText>
            <ThemedText style={styles.confidence}>
              Confidence: {Math.round(parsedCalendar.confidence * 100)}%
            </ThemedText>

            {parsedCalendar.days
              .filter((d) => d.marks.length > 0)
              .slice(0, 10)
              .map((day) => (
                <View key={day.date} style={[styles.dayRow, { borderColor: colors.tileBorder }]}>
                  <ThemedText style={styles.dayDate}>{day.date}</ThemedText>
                  <ThemedText style={styles.dayMarks}>{day.marks.join(', ')}</ThemedText>
                </View>
              ))}

            <Pressable style={[styles.importButton, { backgroundColor: colors.tileRecorded }]} onPress={handleImport}>
              <ThemedText style={styles.captureText}>Import Records</ThemedText>
            </Pressable>

            <Pressable style={styles.retryButton} onPress={() => { setStep('capture'); setImageUri(null); setParsedCalendar(null); }}>
              <ThemedText style={[styles.retryText, { color: colors.tint }]}>Try Different Photo</ThemedText>
            </Pressable>
          </View>
        )}

        {step === 'done' && (
          <ThemedText style={styles.statusText}>Import complete! ✅</ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  description: { opacity: 0.6, lineHeight: 20 },
  label: { marginTop: 8 },
  input: { height: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, fontSize: 15 },
  captureButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  captureButton: { flex: 1, height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  captureText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  preview: { width: '100%', borderRadius: 8, marginVertical: 8 },
  statusText: { textAlign: 'center', paddingVertical: 20, opacity: 0.6, fontSize: 16 },
  reviewSection: { gap: 8 },
  confidence: { opacity: 0.5, fontSize: 13 },
  dayRow: { flexDirection: 'row', padding: 8, borderWidth: 1, borderRadius: 6, gap: 8 },
  dayDate: { fontWeight: '600', width: 80 },
  dayMarks: { flex: 1, opacity: 0.7 },
  importButton: { height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  retryButton: { height: 44, justifyContent: 'center', alignItems: 'center' },
  retryText: { fontWeight: '600', fontSize: 15 },
});
