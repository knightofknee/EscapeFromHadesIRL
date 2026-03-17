import { Paths, File, Directory } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function saveAndShareFiles(
  files: { filename: string; content: string }[],
): Promise<void> {
  const exportDir = new Directory(Paths.cache, 'notes-export');

  // Ensure directory exists (clean slate)
  if (exportDir.exists) {
    exportDir.delete();
  }
  exportDir.create();

  // Write all files
  for (const fileData of files) {
    const file = new File(exportDir, fileData.filename);
    file.write(fileData.content);
  }

  // If single file, share directly. If multiple, create combined file
  if (files.length === 1) {
    const file = new File(exportDir, files[0].filename);
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/markdown',
        dialogTitle: 'Export Note',
      });
    }
  } else {
    const combined = files.map((f) => `# ${f.filename}\n\n${f.content}`).join('\n\n---\n\n');
    const combinedFile = new File(exportDir, 'all-notes.md');
    combinedFile.write(combined);
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(combinedFile.uri, {
        mimeType: 'text/markdown',
        dialogTitle: 'Export All Notes',
      });
    }
  }
}
