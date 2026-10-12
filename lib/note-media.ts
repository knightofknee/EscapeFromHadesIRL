import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Skia, ImageFormat } from '@shopify/react-native-skia';
import { imageSources, mapImages } from '@/lib/note-html';

/**
 * Photos and videos in notes live ONLY on the phone (no cloud storage):
 *
 *   <Documents>/note-media/<uid>/img_<id>.jpg      a photo
 *   <Documents>/note-media/<uid>/vid_<id>.jpg      a video's poster frame
 *   <Documents>/note-media/<uid>/vid_<id>.mp4|mov  the video itself
 *
 * The note body (Firestore) references them by a device-independent URI,
 * `efh-media://<file name>`, which the editor swaps for the real file URL on
 * load and back on save (iOS changes the app's container path across
 * reinstalls, so absolute paths must never be persisted). A phone without a
 * file shows the editor's placeholder until a transfer brings it over
 * (lib/media-transfer.ts). The Documents folder is included in iCloud
 * device backups, so restoring an iPhone carries the files along.
 *
 * `<id>` starts with the creation time in base 36, which the cleanup pass
 * uses to leave freshly added files alone.
 */

export const MEDIA_SCHEME = 'efh-media://';
/** Files the transfer/import recognize as ours. */
export const MEDIA_NAME_RE = /^(img|vid)_[a-z0-9]+\.[a-z0-9]+$/;
const VIDEO_EXTS = ['mp4', 'mov', 'm4v'];
/** Longest edge a stored photo keeps (plenty for a phone screen, ~0.3-0.8 MB). */
const PHOTO_MAX_EDGE = 2048;
const POSTER_MAX_EDGE = 1280;

export function mediaDir(uid: string): Directory {
  return new Directory(Paths.document, 'note-media', uid);
}

function ensureDir(uid: string): Directory {
  const dir = mediaDir(uid);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function mediaFile(uid: string, name: string): File {
  return new File(mediaDir(uid), name);
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Creation time encoded in a media file name, or 0 if unparseable. */
export function mediaCreatedAt(name: string): number {
  const m = name.match(/^(?:img|vid)_([a-z0-9]{8})/);
  if (!m) return 0;
  const t = parseInt(m[1], 36);
  return Number.isFinite(t) ? t : 0;
}

/** "img_x.jpg" → "img_x". Videos and their posters share a base. */
export function mediaBase(name: string): string {
  const dot = name.indexOf('.');
  return dot < 0 ? name : name.slice(0, dot);
}

export function isVideoPoster(name: string): boolean {
  return name.startsWith('vid_') && name.endsWith('.jpg');
}

/** A stored video file (not its poster frame). */
export function isVideoFile(name: string): boolean {
  return name.startsWith('vid_') && VIDEO_EXTS.includes(name.slice(name.lastIndexOf('.') + 1));
}

/** The video file behind a poster name, if it's on this phone. */
export function videoFileFor(uid: string, posterName: string): File | null {
  const base = mediaBase(posterName);
  for (const ext of VIDEO_EXTS) {
    const f = mediaFile(uid, `${base}.${ext}`);
    if (f.exists) return f;
  }
  return null;
}

export type StoredMedia = { name: string; width: number; height: number };

/** Copy a picked or pasted photo into the note store, downscaled. */
export async function importPhoto(uid: string, uri: string, mime?: string): Promise<StoredMedia> {
  const dir = ensureDir(uid);
  const id = newId();
  // GIFs keep their bytes (re-encoding would drop the animation frames).
  if (mime === 'image/gif' || /\.gif$/i.test(uri)) {
    const name = `img_${id}.gif`;
    await new File(uri).copy(new File(dir, name));
    const probe = await ImageManipulator.manipulate(uri).renderAsync();
    return { name, width: probe.width, height: probe.height };
  }
  const png = mime === 'image/png' || /\.png$/i.test(uri);
  const first = await ImageManipulator.manipulate(uri).renderAsync();
  let image = first;
  if (Math.max(first.width, first.height) > PHOTO_MAX_EDGE) {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize(first.width >= first.height ? { width: PHOTO_MAX_EDGE } : { height: PHOTO_MAX_EDGE });
    image = await ctx.renderAsync();
  }
  // Re-encoding also drops EXIF (including GPS location).
  const saved = await image.saveAsync({ format: png ? SaveFormat.PNG : SaveFormat.JPEG, compress: 0.82 });
  const name = `img_${id}.${png ? 'png' : 'jpg'}`;
  await new File(saved.uri).move(new File(dir, name));
  return { name, width: saved.width, height: saved.height };
}

/**
 * Copy a picked video into the note store and make its poster frame (the
 * image the editor shows inline) with a play badge baked in, so a video
 * reads as a video right in the note.
 */
export async function importVideo(uid: string, uri: string): Promise<StoredMedia> {
  const dir = ensureDir(uid);
  const id = newId();
  const extMatch = uri.match(/\.([a-z0-9]+)(?:\?|$)/i);
  const ext = extMatch && VIDEO_EXTS.includes(extMatch[1].toLowerCase()) ? extMatch[1].toLowerCase() : 'mp4';
  const base = `vid_${id}`;
  await new File(uri).copy(new File(dir, `${base}.${ext}`));

  const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time: 500, quality: 0.85 });
  let frame = await ImageManipulator.manipulate(thumb.uri).renderAsync();
  if (Math.max(frame.width, frame.height) > POSTER_MAX_EDGE) {
    const ctx = ImageManipulator.manipulate(thumb.uri);
    ctx.resize(frame.width >= frame.height ? { width: POSTER_MAX_EDGE } : { height: POSTER_MAX_EDGE });
    frame = await ctx.renderAsync();
  }
  const plain = await frame.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const posterName = `${base}.jpg`;
  const poster = new File(dir, posterName);
  try {
    const bytes = await drawPlayBadge(plain.uri, plain.width, plain.height);
    poster.write(bytes);
    new File(plain.uri).delete();
  } catch (e) {
    console.warn('[note-media] play badge failed, using the plain frame', e);
    await new File(plain.uri).move(poster);
  }
  try {
    new File(thumb.uri).delete();
  } catch {
    /* cache file; the OS cleans it */
  }
  return { name: posterName, width: plain.width, height: plain.height };
}

async function drawPlayBadge(uri: string, w: number, h: number): Promise<Uint8Array> {
  const data = await Skia.Data.fromURI(uri);
  const img = Skia.Image.MakeImageFromEncoded(data);
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (!img || !surface) throw new Error('skia unavailable');
  const canvas = surface.getCanvas();
  canvas.drawImage(img, 0, 0);
  const r = Math.max(28, Math.min(w, h) * 0.12);
  const cx = w / 2;
  const cy = h / 2;
  const disc = Skia.Paint();
  disc.setAntiAlias(true);
  disc.setColor(Skia.Color('rgba(0,0,0,0.55)'));
  canvas.drawCircle(cx, cy, r, disc);
  const tri = Skia.Path.Make();
  tri.moveTo(cx - r * 0.32, cy - r * 0.45);
  tri.lineTo(cx + r * 0.52, cy);
  tri.lineTo(cx - r * 0.32, cy + r * 0.45);
  tri.close();
  const white = Skia.Paint();
  white.setAntiAlias(true);
  white.setColor(Skia.Color('white'));
  canvas.drawPath(tri, white);
  surface.flush();
  return surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, 88);
}

// ---------------------------------------------------------------------------
// HTML <-> device paths
// ---------------------------------------------------------------------------

/** Display box for an inline image: full editor width, capped height. */
export function fitImage(width: number, height: number, maxWidth: number, maxHeight = 520) {
  if (!(width > 0) || !(height > 0)) return { width: Math.round(maxWidth), height: Math.round(maxWidth * 0.66) };
  let w = maxWidth;
  let h = (height / width) * w;
  if (h > maxHeight) {
    h = maxHeight;
    w = (width / height) * h;
  }
  return { width: Math.round(w), height: Math.round(h) };
}

/** The <img> tag the editor gets for a stored item (absolute file URL). */
export function editorImageTag(uid: string, m: StoredMedia, maxWidth: number): string {
  const box = fitImage(m.width, m.height, maxWidth);
  return `<img src="${mediaFile(uid, m.name).uri}" width="${box.width}" height="${box.height}"/>`;
}

/** The stored media name an <img src> points at (either form), or null. */
export function nameFromSrc(src: string): string | null {
  if (src.startsWith(MEDIA_SCHEME)) return src.slice(MEDIA_SCHEME.length);
  const i = src.indexOf('/note-media/');
  if (i < 0) return null;
  const name = decodeURIComponent(src.slice(src.lastIndexOf('/') + 1));
  return MEDIA_NAME_RE.test(name) ? name : null;
}

/** Stored HTML → editor HTML: real file URLs, sized for this screen. */
export function toEditorHtml(html: string, uid: string, maxWidth: number): string {
  return mapImages(html, (a) => {
    const name = nameFromSrc(a.src ?? '');
    const box = fitImage(Number(a.width), Number(a.height), maxWidth);
    return {
      ...a,
      src: name ? mediaFile(uid, name).uri : (a.src ?? ''),
      width: String(box.width),
      height: String(box.height),
    };
  });
}

/** Editor HTML → stored HTML: device paths become efh-media:// names. */
export function toStorageHtml(html: string): string {
  return mapImages(html, (a) => {
    const name = nameFromSrc(a.src ?? '');
    return name ? { ...a, src: `${MEDIA_SCHEME}${name}` } : a;
  });
}

/** Media file names an (editor or stored) HTML body references. */
export function mediaNamesIn(html: string): string[] {
  const out: string[] = [];
  for (const src of imageSources(html)) {
    const name = nameFromSrc(src);
    if (name) out.push(name);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

export function listMedia(uid: string): File[] {
  const dir = mediaDir(uid);
  if (!dir.exists) return [];
  return dir.list().filter((e): e is File => e instanceof File && MEDIA_NAME_RE.test(e.name));
}

export function mediaStats(uid: string): { photos: number; videos: number; photoBytes: number; videoBytes: number } {
  let photos = 0;
  let videos = 0;
  let photoBytes = 0;
  let videoBytes = 0;
  for (const f of listMedia(uid)) {
    const size = f.size ?? 0;
    const ext = f.name.slice(f.name.lastIndexOf('.') + 1);
    if (f.name.startsWith('vid_') && VIDEO_EXTS.includes(ext)) {
      videos++;
      videoBytes += size;
    } else {
      if (f.name.startsWith('img_')) photos++;
      photoBytes += size;
    }
  }
  return { photos, videos, photoBytes, videoBytes };
}

/** Grace period before an unreferenced file may be removed: covers notes
 *  still in their save debounce and notes edited on another phone whose
 *  sync hasn't arrived yet. */
const ORPHAN_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Delete media no note references. `bodies` must be EVERY note body the
 * user has (a partial list would delete live photos), so callers pass the
 * result of a complete one-shot fetch and skip the sweep on any error.
 */
export function sweepOrphans(uid: string, bodies: string[], now = Date.now()): number {
  const keep = new Set<string>();
  for (const body of bodies) for (const name of mediaNamesIn(body)) keep.add(mediaBase(name));
  let removed = 0;
  for (const f of listMedia(uid)) {
    if (keep.has(mediaBase(f.name))) continue;
    const born = mediaCreatedAt(f.name);
    if (!born || now - born < ORPHAN_GRACE_MS) continue;
    try {
      f.delete();
      removed++;
    } catch (e) {
      console.warn('[note-media] sweep: delete failed', f.name, e);
    }
  }
  return removed;
}

/** Account deletion: remove every stored photo and video for this user. */
export function deleteAllMedia(uid: string): void {
  const dir = mediaDir(uid);
  if (dir.exists) dir.delete();
}
