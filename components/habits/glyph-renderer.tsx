import { useMemo } from 'react';
import { Canvas, Path, Group, Skia } from '@shopify/react-native-skia';
import type { GlyphData } from '@/types/habit';

type GlyphRendererProps = {
  glyph: GlyphData;
  width: number;
  height: number;
  opacity?: number;
};

/**
 * Renders a saved glyph at any size by scaling from the original viewBox.
 * Used inside tiles to show the custom hand-drawn symbol.
 */
export function GlyphRenderer({ glyph, width, height, opacity = 1 }: GlyphRendererProps) {
  const scaledPaths = useMemo(() => {
    if (!glyph.paths.length) return [];

    const sx = width / glyph.viewBox.width;
    const sy = height / glyph.viewBox.height;
    const scale = Math.min(sx, sy);
    const offsetX = (width - glyph.viewBox.width * scale) / 2;
    const offsetY = (height - glyph.viewBox.height * scale) / 2;

    return glyph.paths
      .map((sp) => {
        const path = Skia.Path.MakeFromSVGString(sp.points);
        if (!path) return null;

        const matrix = Skia.Matrix();
        matrix.translate(offsetX, offsetY);
        matrix.scale(scale, scale);
        path.transform(matrix);

        return {
          path,
          color: sp.color,
          strokeWidth: sp.strokeWidth * scale,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);
  }, [glyph, width, height]);

  if (scaledPaths.length === 0) return null;

  return (
    <Canvas style={{ width, height }}>
      <Group opacity={opacity}>
        {scaledPaths.map((p, i) => (
          <Path
            key={`glyph-${i}-${p.color}`}
            path={p.path}
            color={p.color}
            style="stroke"
            strokeWidth={p.strokeWidth}
            strokeCap="round"
            strokeJoin="round"
          />
        ))}
      </Group>
    </Canvas>
  );
}
