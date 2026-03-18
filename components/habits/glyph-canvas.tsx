import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import type { SerializedPath } from '@/types/habit';

type GlyphCanvasProps = {
  width: number;
  height: number;
  strokeColor: string;
  strokeWidth: number;
  paths: DrawingPath[];
  onPathsChange: (paths: DrawingPath[]) => void;
};

export type DrawingPath = {
  path: SkPath;
  color: string;
  strokeWidth: number;
};

/**
 * Serialize DrawingPath[] → SerializedPath[] for Firestore storage
 */
export function serializePaths(paths: DrawingPath[]): SerializedPath[] {
  return paths.map((p) => ({
    points: p.path.toSVGString(),
    color: p.color,
    strokeWidth: p.strokeWidth,
  }));
}

/**
 * Deserialize SerializedPath[] → DrawingPath[] from Firestore
 */
export function deserializePaths(serialized: SerializedPath[]): DrawingPath[] {
  return serialized
    .map((s) => {
      const path = Skia.Path.MakeFromSVGString(s.points);
      if (!path) return null;
      return { path, color: s.color, strokeWidth: s.strokeWidth };
    })
    .filter((p): p is DrawingPath => p != null);
}

export function GlyphCanvas({
  width,
  height,
  strokeColor,
  strokeWidth,
  paths,
  onPathsChange,
}: GlyphCanvasProps) {
  const currentPath = useRef<SkPath | null>(null);
  const [activePath, setActivePath] = useState<SkPath | null>(null);

  // Use refs for values accessed inside gesture callbacks to avoid stale closures
  const pathsRef = useRef(paths);
  pathsRef.current = paths;
  const strokeColorRef = useRef(strokeColor);
  strokeColorRef.current = strokeColor;
  const strokeWidthRef = useRef(strokeWidth);
  strokeWidthRef.current = strokeWidth;
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
          color: strokeColorRef.current,
          strokeWidth: strokeWidthRef.current,
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

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.container, { width, height }]}>
        <Canvas style={{ width, height }}>
          {/* Completed paths */}
          {paths.map((p, i) => (
            <Path
              key={`path-${i}-${p.color}`}
              path={p.path}
              color={p.color}
              style="stroke"
              strokeWidth={p.strokeWidth}
              strokeCap="round"
              strokeJoin="round"
            />
          ))}
          {/* Active path being drawn */}
          {activePath && (
            <Path
              path={activePath}
              color={strokeColor}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
              strokeJoin="round"
            />
          )}
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
