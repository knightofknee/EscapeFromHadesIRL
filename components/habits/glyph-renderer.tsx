import { useMemo } from 'react';
import { Canvas, Path, Group, Skia } from '@shopify/react-native-skia';
import type { GlyphData } from '@/types/habit';

type GlyphRendererProps = {
  glyph: GlyphData;
  width: number;
  height: number;
  opacity?: number;
};

export function GlyphRenderer({ glyph, width, height, opacity = 1 }: GlyphRendererProps) {
  const { drawPaths, erasePaths } = useMemo(() => {
    if (!glyph.paths.length) return { drawPaths: [], erasePaths: [] };

    const sx = width / glyph.viewBox.width;
    const sy = height / glyph.viewBox.height;
    const scale = Math.min(sx, sy);
    const offsetX = (width - glyph.viewBox.width * scale) / 2;
    const offsetY = (height - glyph.viewBox.height * scale) / 2;

    const draw: { path: any; color: string; strokeWidth: number }[] = [];
    const erase: { path: any; strokeWidth: number }[] = [];

    for (const sp of glyph.paths) {
      const path = Skia.Path.MakeFromSVGString(sp.points);
      if (!path) continue;

      const matrix = Skia.Matrix();
      matrix.translate(offsetX, offsetY);
      matrix.scale(scale, scale);
      path.transform(matrix);

      const isEraser = sp.color === '__eraser__';
      if (isEraser) {
        erase.push({ path, strokeWidth: sp.strokeWidth * scale });
      } else {
        draw.push({ path, color: sp.color, strokeWidth: sp.strokeWidth * scale });
      }
    }

    return { drawPaths: draw, erasePaths: erase };
  }, [glyph, width, height]);

  if (drawPaths.length === 0 && erasePaths.length === 0) return null;

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Group opacity={opacity} layer>
        {drawPaths.map((p, i) => (
          <Path
            key={`draw-${i}`}
            path={p.path}
            color={p.color}
            style="stroke"
            strokeWidth={p.strokeWidth}
            strokeCap="round"
            strokeJoin="round"
          />
        ))}
        {erasePaths.map((p, i) => (
          <Path
            key={`erase-${i}`}
            path={p.path}
            color="black"
            style="stroke"
            strokeWidth={p.strokeWidth}
            strokeCap="round"
            strokeJoin="round"
            blendMode="dstOut"
          />
        ))}
      </Group>
    </Canvas>
  );
}
