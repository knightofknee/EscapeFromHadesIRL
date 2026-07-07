import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Pixel size of a stored tile icon. 240px covers the largest tile at 3x
 * density; anything bigger only bloats the habit doc the icon is stored in.
 */
export const TILE_ICON_SIZE = 240;

// The icon lives inline in the habit doc (1MB Firestore limit, shared with
// every other field, and the whole doc rides the habits listener). A 240px
// PNG is normally 10–60KB of base64; this cap is a safety net, not a target.
const MAX_DATA_URI_LENGTH = 700_000;

/**
 * Let the user pick a photo and normalize it into a tile icon: square crop
 * (the picker's edit step; center-cropped again here as a fallback), resized
 * down to TILE_ICON_SIZE, returned as a PNG data URI ready to store on the
 * habit doc. Returns null if the user cancels; throws on failure.
 */
export async function pickTileIconImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    exif: false,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset?.uri) throw new Error('No image was returned by the picker.');

  // Render once to read the image's REAL pixel dimensions. The picker's
  // asset.width/height can be 0 or undefined for some Android/iCloud assets;
  // trusting them would skip both the center-crop (0 !== 0 is false) and the
  // resize (0 > 240 is false), storing a full-resolution photo that trips the
  // size cap with a misleading "too complex" error. The rendered ImageRef
  // always exposes accurate dimensions.
  let image = await ImageManipulator.manipulate(asset.uri).renderAsync();
  const side = Math.min(image.width, image.height);
  const needsCrop = image.width !== image.height;
  // Never upscale — a tiny source stays tiny rather than growing blurry.
  const needsResize = side > TILE_ICON_SIZE;

  if (needsCrop || needsResize) {
    const context = ImageManipulator.manipulate(image);
    if (needsCrop) {
      context.crop({
        originX: Math.floor((image.width - side) / 2),
        originY: Math.floor((image.height - side) / 2),
        width: side,
        height: side,
      });
    }
    if (needsResize) {
      context.resize({ width: TILE_ICON_SIZE, height: TILE_ICON_SIZE });
    }
    image = await context.renderAsync();
  }

  const saved = await image.saveAsync({ format: SaveFormat.PNG, base64: true });
  if (!saved.base64) throw new Error('Could not encode the image.');

  const dataUri = `data:image/png;base64,${saved.base64}`;
  if (dataUri.length > MAX_DATA_URI_LENGTH) {
    throw new Error('That image is too complex to store as an icon. Try a simpler one.');
  }
  return dataUri;
}
