import { useRef } from 'react';
import { DeviceActivitySelectionSheetView } from 'react-native-device-activity';
import type { PhoneFreeSelectionSheetProps } from '@/components/habits/phone-free-selection-sheet';

/**
 * Apple's app picker (FamilyActivityPicker) in a native sheet. Mounting the
 * view presents the sheet; Cancel/Done fire onDismissRequest. The token is
 * an opaque base64 FamilyActivitySelection that only means something to
 * this device's Screen Time; we store it and hand it to the monitor.
 *
 * For "phone use" to mean the whole phone the user has to tick every
 * category. Apple gives no select-all for apps, so the header text says so.
 */
export function PhoneFreeSelectionSheet({ visible, onClose }: PhoneFreeSelectionSheetProps) {
  const tokenRef = useRef<string | null>(null);
  const countRef = useRef(0);
  if (!visible) return null;
  return (
    <DeviceActivitySelectionSheetView
      style={{ width: 0, height: 0 }}
      familyActivitySelection={null}
      headerText="Tick every category so all phone use counts."
      footerText="Nothing is blocked. This only measures when the phone is in use overnight."
      onSelectionChange={(e) => {
        const { familyActivitySelection, applicationCount, categoryCount, webDomainCount } =
          e.nativeEvent;
        tokenRef.current = familyActivitySelection ?? null;
        countRef.current = (applicationCount ?? 0) + (categoryCount ?? 0) + (webDomainCount ?? 0);
      }}
      onDismissRequest={() => {
        const token = countRef.current > 0 ? tokenRef.current : null;
        tokenRef.current = null;
        countRef.current = 0;
        onClose(token);
      }}
    />
  );
}
