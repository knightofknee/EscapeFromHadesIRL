import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import { PermissionPrePromptModal } from '@/components/permission-preprompt-modal';
import { PhoneFreeSelectionSheet } from '@/components/habits/phone-free-selection-sheet';
import { requestPhoneFreeSync } from '@/hooks/use-phone-free-nights';
import {
  getPhoneFreeStatus,
  requestPhoneFreePermission,
  savePhoneFreeSelection,
} from '@/lib/phone-free-source';

const BODY =
  Platform.OS === 'ios'
    ? 'This habit fills itself in from how long your phone stayed untouched overnight. For that, the app needs Screen Time access, and then you pick which apps count. Nothing is blocked, and nothing leaves your phone.'
    : 'This habit fills itself in from how long your phone stayed locked overnight. For that, the app needs usage access, which you turn on in Settings. Nothing leaves your phone.';

/**
 * Phone-free flavor of the standard permission pre-prompt, shown the moment
 * a phone-free habit is picked in the editor. On iOS the system sheet is
 * followed by Apple's app picker, opened once the pre-prompt has closed so
 * the native sheet isn't presented from inside a dismissing modal.
 */
export function PhoneFreePrePromptModal({
  visible,
  onClose,
}: {
  visible: boolean;
  /** Called when the pre-prompt flow ends (the app picker may still follow). */
  onClose: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const wantPickerRef = useRef(false);

  return (
    <>
      <PermissionPrePromptModal
        visible={visible}
        title="Measure phone-free nights?"
        body={BODY}
        onProceed={async () => {
          await requestPhoneFreePermission();
          const status = await getPhoneFreeStatus();
          if (status === 'needs-selection') wantPickerRef.current = true;
          else requestPhoneFreeSync();
        }}
        onClose={() => {
          onClose();
          if (wantPickerRef.current) {
            wantPickerRef.current = false;
            setTimeout(() => setPickerOpen(true), 400);
          }
        }}
      />
      <PhoneFreeSelectionSheet
        visible={pickerOpen}
        onClose={(token) => {
          setPickerOpen(false);
          if (!token) return;
          void savePhoneFreeSelection(token).then(() => requestPhoneFreeSync());
        }}
      />
    </>
  );
}
