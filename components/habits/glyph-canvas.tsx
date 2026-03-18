import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Path, Group, Skia, type SkPath } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import type { SerializedPath } from '@/types/habit';

type GlyphCanvasProps = {
  width: number;
  height: number;
  strokeColor: string;
  strokeWidth: number;
  eraser: boolean;
  paths: DrawingPath[];
  onPathsChange: (paths: DrawingPath[]) => void;
};

export type DrawingPath = {
  path: SkPath;
  color: string;
  strokeWidth: number;
  isEraser?: boolean;
};

export function serializePaths(paths: DrawingPath[]): SerializedPath[] {
  // Only serialize non-eraser paths that survive after erasing
  // We need to flatten: render all paths (draw + erase) to get final result
  // But for storage, we store both draw and erase paths
  return paths.map((p) => ({
    points: p.path.toSVGString(),
    color: p.isEraser ? '__eraser__' : p.color,
    strokeWidth: p.strokeWidth,
  }));
}

export function deserializePaths(serialized: SerializedPath[]): DrawingPath[] {
  const result: DrawingPath[] = [];
  for (const s of serialized) {
    const path = Skia.Path.MakeFromSVGString(s.points);
    if (!path) continue;
    result.push({
      path,
      color: s.color === '__eraser__' ? '#000000' : s.color,
      strokeWidth: s.strokeWidth,
      isEraser: s.color === '__eraser__',
    });
  }
  return result;
}

export function GlyphCanvas({
  width,
  height,
  strokeColor,
  strokeWidth,
  eraser,
  paths,
  onPathsChange,
}: GlyphCanvasProps) {
  const currentPath = useRef<SkPath | null>(null);
  const [activePath, setActivePath] = useState<SkPath | null>(null);

  const pathsRef = useRef(paths);
  pathsRef.current = paths;
  const strokeColorRef = useRef(strokeColor);
  strokeColorRef.current = strokeColor;
  const strokeWidthRef = useRef(strokeWidth);
  strokeWidthRef.current = strokeWidth;
  const eraserRef = useRef(eraser);
  eraserRef.current = eraser;
  const onPathsChangeRef = useRef(onPathsChange);
  onPathsChangeRef.current = onPathsChange;

  function beginPath(x: number, y: number) {
    const path = Skia.Path.Make();
    path.moveTo(x, y);
    currentPath.current = path;
    setActivePath(path.copy());
  }

  function updatePath(x: number, y: number) {
    if (!currentPath.current) return;
    currentPath.current.lineTo(x, y);
    setActivePath(currentPath.current.copy());
  }

  function endPath() {
    if (currentPath.current) {
      const newPaths = [
        ...pathsRef.current,
        {
          path: currentPath.current,
          color: eraserRef.current ? '#000000' : strokeColorRef.current,
          strokeWidth: strokeWidthRef.current,
          isEraser: eraserRef.current,
        },
      ];
      onPathsChangeRef.current(newPaths);
    }
    currentPath.current = null;
    setActivePath(null);
  }

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      scheduleOnRN(beginPath, e.x, e.y);
    })
    .onUpdate((e) => {
      scheduleOnRN(updatePath, e.x, e.y);
    })
    .onEnd(() => {
      scheduleOnRN(endPath);
    });

  // Split paths into draw and erase
  const drawPaths = paths.filter((p) => !p.isEraser);
  const erasePaths = paths.filter((p) => p.isEraser);

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.container, { width, height }]}>
        <Canvas style={{ width, height }}>
          {/* Layer group: draw paths first, then erase paths punch holes */}
          <Group layer>
            {/* Draw strokes */}
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
            {/* Erase strokes — dstOut removes from what's drawn above */}
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
            {/* Active stroke being drawn */}
            {activePath && !eraser && (
              <Path
                path={activePath}
                color={strokeColor}
                style="stroke"
                strokeWidth={strokeWidth}
                strokeCap="round"
                strokeJoin="round"
              />
            )}
            {/* Active eraser stroke */}
            {activePath && eraser && (
              <Path
                path={activePath}
                color="black"
                style="stroke"
                strokeWidth={strokeWidth}
                strokeCap="round"
                strokeJoin="round"
                blendMode="dstOut"
              />
            )}
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
