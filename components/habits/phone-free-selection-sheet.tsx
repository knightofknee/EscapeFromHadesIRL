// Non-iOS fallback (Metro resolves phone-free-selection-sheet.ios.tsx on
// iOS). Android needs no app selection: Usage Access covers the whole phone.
// tsc type-checks against THIS file; keep the props in lockstep.

export type PhoneFreeSelectionSheetProps = {
  visible: boolean;
  /** Called when the sheet closes. `token` is the saved selection, or null
   *  when the user cancelled / picked nothing. */
  onClose: (token: string | null) => void;
};

export function PhoneFreeSelectionSheet(_props: PhoneFreeSelectionSheetProps) {
  return null;
}
