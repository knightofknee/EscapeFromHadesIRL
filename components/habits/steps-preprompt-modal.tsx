import { Platform } from 'react-native';
import { PermissionPrePromptModal } from '@/components/permission-preprompt-modal';
import { requestStepsPermission } from '@/lib/steps-health';
import { requestStepsSync } from '@/hooks/use-steps-backfill';

const HEALTH_STORE = Platform.OS === 'android' ? 'Health Connect' : 'Apple Health';

/**
 * Steps flavor of the standard permission pre-prompt, shown at the moment a
 * steps habit is created (tile editor or starter setup). Whether it appears
 * at all is gated on the platform's real permission state
 * (getStepsPermissionRequestStatus) at the call sites.
 */
export function StepsPrePromptModal({
  visible,
  onClose,
}: {
  visible: boolean;
  /** Called when the flow ends. */
  onClose: () => void;
}) {
  return (
    <PermissionPrePromptModal
      visible={visible}
      title="Count steps automatically?"
      body={`This habit can fill itself in from your phone's step count. For that, the app needs read access to steps in ${HEALTH_STORE}. Steps are the only thing it reads, and your health data never leaves your device.`}
      onProceed={async () => {
        await requestStepsPermission();
        // Fill the tile now — the sync that ran at habit creation found no
        // permission and won't re-run until foreground.
        requestStepsSync();
      }}
      onClose={onClose}
    />
  );
}
