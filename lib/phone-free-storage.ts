import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PhoneFreeNight } from '@/lib/phone-free';

/**
 * Local persistence for phone-free nights. Nights live on the device for
 * now (not Firestore): the data sources only keep a few days of history
 * (Android) or overwrite every night (iOS), so each night is snapshotted
 * here as soon as the app sees it, and the week view reads from here.
 * uid-scoped so two accounts on one phone never see each other's nights.
 */

const NIGHTS_PREFIX = 'phoneFree:nights:v1:';
/** iOS only: the Screen Time selection token the monitor measures against.
 *  Device-level (not per uid): it describes this phone, not an account. */
const IOS_SELECTION_KEY = 'phoneFree:iosSelection:v1';

export type NightsByDate = Record<string, PhoneFreeNight>;

export async function loadNights(uid: string): Promise<NightsByDate> {
  try {
    const raw = await AsyncStorage.getItem(NIGHTS_PREFIX + uid);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as NightsByDate) : {};
  } catch (e) {
    console.error('loadNights failed:', e);
    return {};
  }
}

export async function saveNights(uid: string, nights: NightsByDate): Promise<void> {
  try {
    await AsyncStorage.setItem(NIGHTS_PREFIX + uid, JSON.stringify(nights));
  } catch (e) {
    console.error('saveNights failed:', e);
  }
}

export async function loadIosSelection(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(IOS_SELECTION_KEY);
  } catch (e) {
    console.error('loadIosSelection failed:', e);
    return null;
  }
}

export async function saveIosSelection(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(IOS_SELECTION_KEY, token);
  } catch (e) {
    console.error('saveIosSelection failed:', e);
  }
}
