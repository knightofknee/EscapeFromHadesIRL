import { Paths, File, Directory } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { zip } from 'react-native-zip-archive';

/** A file:// URI as the filesystem path the zip library expects. */
export function fsPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

/**
 * Write the exported note(s) and share them. One note shares as its .md;
 * several are combined into all-notes.md. When `media` is given (photos in
 * rich notes), the Markdown links them as media/<name> and everything is
 * shared as one .zip so the links resolve when it's unpacked.
 */
export async function saveAndShareFiles(
  files: { filename: string; content: string }[],
  media: File[] = [],
): Promise<void> {
  const exportDir = new Directory(Paths.cache, 'notes-export');

  // Ensure directory exists (clean slate)
  if (exportDir.exists) {
    exportDir.delete();
  }
  exportDir.create();

  let mdFile: File;
  if (files.length === 1) {
    mdFile = new File(exportDir, files[0].filename);
    mdFile.write(files[0].content);
  } else {
    const combined = files.map((f) => `# ${f.filename}\n\n${f.content}`).join('\n\n---\n\n');
    mdFile = new File(exportDir, 'all-notes.md');
    mdFile.write(combined);
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) return;

  if (media.length === 0) {
    await Sharing.shareAsync(mdFile.uri, {
      mimeType: 'text/markdown',
      dialogTitle: files.length === 1 ? 'Export Note' : 'Export All Notes',
    });
    return;
  }

  const mediaDir = new Directory(exportDir, 'media');
  mediaDir.create();
  for (const f of media) {
    await f.copy(new File(mediaDir, f.name));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const zipFile = new File(Paths.cache, `notes-export-${stamp}.zip`);
  if (zipFile.exists) zipFile.delete();
  await zip(fsPath(exportDir.uri), fsPath(zipFile.uri));
  await Sharing.shareAsync(zipFile.uri, {
    mimeType: 'application/zip',
    UTI: 'public.zip-archive',
    dialogTitle: 'Export Notes',
  });
}
