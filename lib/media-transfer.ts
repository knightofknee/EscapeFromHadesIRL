import { Directory, File, Paths } from 'expo-file-system';
import { unzip, zip } from 'react-native-zip-archive';
import { fsPath } from '@/lib/export/file-saver';
import { MEDIA_NAME_RE, isVideoFile, listMedia, mediaDir, mediaFile } from '@/lib/note-media';

/**
 * Phone-to-phone move for note photos/videos (they're stored only on the
 * phone; see lib/note-media.ts). The sending phone packs its media files
 * into one .zip; the receiving phone unpacks it and copies every file it
 * doesn't already have into its own store. Notes reference media by file
 * name, so each photo appears in its note the moment the file lands, no
 * matter whether the notes synced before or after. Importing twice is
 * harmless (existing files are skipped), and the notes .zip export works
 * as an import source too (its media/ folder holds the photos).
 */

const MANIFEST = 'hades-media.json';

export async function createTransferFile(uid: string, includeVideos: boolean): Promise<File> {
  // Posters always go: without one a video's place in the note is blank.
  const files = listMedia(uid).filter((f) => includeVideos || !isVideoFile(f.name));
  const manifest = new File(Paths.cache, MANIFEST);
  if (manifest.exists) manifest.delete();
  manifest.write(
    JSON.stringify({
      app: 'escape-from-hades-irl',
      kind: 'note-media',
      version: 1,
      createdAt: new Date().toISOString(),
      files: files.length,
      videos: includeVideos,
    }),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  const target = new File(Paths.cache, `hades-photos-${stamp}.zip`);
  if (target.exists) target.delete();
  await zip([fsPath(manifest.uri), ...files.map((f) => fsPath(f.uri))], fsPath(target.uri));
  return target;
}

function collect(dir: Directory, out: File[]) {
  for (const entry of dir.list()) {
    if (entry instanceof Directory) collect(entry, out);
    else if (MEDIA_NAME_RE.test(entry.name)) out.push(entry);
  }
}

export async function importTransferFile(uid: string, zipUri: string): Promise<{ added: number; skipped: number }> {
  const tmp = new Directory(Paths.cache, `media-import-${Date.now()}`);
  tmp.create({ intermediates: true, idempotent: true });
  try {
    await unzip(fsPath(zipUri), fsPath(tmp.uri));
    const found: File[] = [];
    collect(tmp, found);
    const dest = mediaDir(uid);
    if (!dest.exists) dest.create({ intermediates: true, idempotent: true });
    let added = 0;
    let skipped = 0;
    for (const f of found) {
      const target = mediaFile(uid, f.name);
      if (target.exists) {
        skipped++;
        continue;
      }
      await f.move(target);
      added++;
    }
    return { added, skipped };
  } finally {
    try {
      tmp.delete();
    } catch {
      /* cache dir; the OS cleans it */
    }
  }
}
