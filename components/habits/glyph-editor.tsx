import { useState, useCallback } from 'react';
import { StyleSheet, View, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { TILE_COLORS } from '@/constants/grid';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  GlyphCanvas,
  serializePaths,
  deserializePaths,
  type DrawingPath,
} from './glyph-canvas';
import type { GlyphData } from '@/types/habit';

type GlyphEditorProps = {
  initialGlyph?: GlyphData;
  habitColor: string;
  onSave: (glyph: GlyphData) => void;
  onCancel: () => void;
};

const STROKE_WIDTHS = [4, 8, 14, 22, 32, 44];

export function GlyphEditor({ initialGlyph, habitColor, onSave, onCancel }: GlyphEditorProps) {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const canvasSize = Math.min(windowWidth - 48, 320);

  const [paths, setPaths] = useState<DrawingPath[]>(() =>
    initialGlyph ? deserializePaths(initialGlyph.paths) : [],
  );
  const [strokeColor, setStrokeColor] = useState(habitColor);
  const [strokeWidth, setStrokeWidth] = useState(14);
  const [isEraser, setIsEraser] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const handleUndo = useCallback(() => {
    setPaths((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setPaths([]);
  }, []);

  const handleSave = useCallback(() => {
    if (paths.length === 0) {
      onSave({ paths: [], viewBox: { width: canvasSize, height: canvasSize } });
      return;
    }
    // Save all paths in order (draw + erase). The rendering order handles
    // the visual correctly: eraser strokes use blendMode="dstOut" to punch
    // holes, and any strokes drawn after erasing appear on top naturally.
    onSave({
      paths: serializePaths(paths),
      viewBox: { width: canvasSize, height: canvasSize },
    });
  }, [paths, canvasSize, onSave]);

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onCancel} style={styles.headerButton}>
          <ThemedText style={[styles.headerButtonText, { color: colors.tint }]}>Cancel</ThemedText>
        </Pressable>
        <ThemedText type="defaultSemiBold" style={styles.headerTitle}>
          Draw Symbol
        </ThemedText>
        <Pressable onPress={handleSave} style={styles.headerButton}>
          <ThemedText style={[styles.headerButtonText, { color: colors.tint }]}>Save</ThemedText>
        </Pressable>
      </View>

      <ThemedText style={styles.hint}>
        Draw the symbol that will appear on your tile when recorded
      </ThemedText>

      {/* Canvas */}
      <View
        style={[
          styles.canvasWrapper,
          {
            width: canvasSize,
            height: canvasSize,
            backgroundColor: colors.tileBackground,
            borderColor: colors.tileBorder,
          },
        ]}
      >
        <GlyphCanvas
          width={canvasSize}
          height={canvasSize}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          eraser={isEraser}
          paths={paths}
          onPathsChange={setPaths}
        />
      </View>

      {/* Toolbar — scrollable for smaller screens */}
      <ScrollView style={styles.toolbarScroll} contentContainerStyle={styles.toolbar}>
        {/* Stroke width */}
        <View style={styles.toolSection}>
          <ThemedText style={styles.toolLabel}>Size</ThemedText>
          <View style={styles.toolRow}>
            {STROKE_WIDTHS.map((sw) => (
              <Pressable
                key={sw}
                style={[
                  styles.strokeButton,
                  {
                    borderColor: strokeWidth === sw ? colors.tint : colors.tileBorder,
                    backgroundColor: strokeWidth === sw ? `${colors.tint}20` : 'transparent',
                  },
                ]}
                onPress={() => setStrokeWidth(sw)}
              >
                <View
                  style={[
                    styles.strokePreview,
                    {
                      width: sw,
                      height: sw,
                      borderRadius: sw / 2,
                      backgroundColor: isEraser ? colors.icon : strokeColor,
                    },
                  ]}
                />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Color & Eraser — same row */}
        <View style={styles.colorEraserRow}>
          <View style={styles.toolSection}>
            <ThemedText style={styles.toolLabel}>Color</ThemedText>
            <Pressable
              style={[
                styles.colorToggle,
                { backgroundColor: strokeColor, opacity: isEraser ? 0.4 : 1 },
              ]}
              onPress={() => {
                setIsEraser(false);
                setShowColorPicker(!showColorPicker);
              }}
            />
          </View>

          <View style={styles.toolSection}>
            <ThemedText style={styles.toolLabel}>Eraser</ThemedText>
            <Pressable
              style={[
                styles.eraserButton,
                {
                  borderColor: isEraser ? colors.tint : colors.tileBorder,
                  backgroundColor: isEraser ? `${colors.tint}20` : 'transparent',
                },
              ]}
              onPress={() => {
                setIsEraser(!isEraser);
                setShowColorPicker(false);
              }}
            >
              <View style={styles.eraserIcon}>
                <View style={[styles.eraserTop, { backgroundColor: colors.text }]} />
                <View style={[styles.eraserBottom, { backgroundColor: isEraser ? colors.tint : colors.icon }]} />
              </View>
            </Pressable>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.toolSection}>
          <View style={styles.toolRow}>
            <Pressable
              style={[styles.actionButton, { borderColor: colors.tileBorder }]}
              onPress={handleUndo}
              disabled={paths.length === 0}
            >
              <ThemedText style={[styles.actionText, paths.length === 0 && { opacity: 0.3 }]}>
                Undo
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.actionButton, { borderColor: colors.tileBorder }]}
              onPress={handleClear}
              disabled={paths.length === 0}
            >
              <ThemedText style={[styles.actionText, paths.length === 0 && { opacity: 0.3 }]}>
                Clear
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Color picker inline */}
        {showColorPicker && (
          <View style={[styles.colorPickerInline, { borderColor: colors.tileBorder }]}>
            <View style={styles.colorGrid}>
              {TILE_COLORS.map((c) => (
                <Pressable
                  key={c}
                  style={[
                    styles.colorSwatch,
                    {
                      backgroundColor: c,
                      borderWidth: strokeColor === c ? 3 : 0,
                      borderColor: colors.text,
                    },
                  ]}
                  onPress={() => {
                    setStrokeColor(c);
                    setShowColorPicker(false);
                  }}
                />
              ))}
              <Pressable
                style={[
                  styles.colorSwatch,
                  {
                    backgroundColor: '#FFFFFF',
                    borderWidth: strokeColor === '#FFFFFF' ? 3 : 1,
                    borderColor: strokeColor === '#FFFFFF' ? colors.text : colors.tileBorder,
                  },
                ]}
                onPress={() => {
                  setStrokeColor('#FFFFFF');
                  setShowColorPicker(false);
                }}
              />
              <Pressable
                style={[
                  styles.colorSwatch,
                  {
                    backgroundColor: '#000000',
                    borderWidth: strokeColor === '#000000' ? 3 : 0,
                    borderColor: colors.text,
                  },
                ]}
                onPress={() => {
                  setStrokeColor('#000000');
                  setShowColorPicker(false);
                }}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    padding: 8,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 17,
  },
  hint: {
    fontSize: 13,
    opacity: 0.5,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  canvasWrapper: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  toolbarScroll: {
    flex: 1,
    width: '100%',
  },
  toolbar: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 16,
  },
  toolSection: {
    gap: 6,
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.5,
    textTransform: 'uppercase',
  },
  toolRow: {
    flexDirection: 'row',
    gap: 8,
  },
  strokeButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  strokePreview: {},
  colorEraserRow: {
    flexDirection: 'row',
    gap: 24,
  },
  colorToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  eraserButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eraserIcon: {
    alignItems: 'center',
  },
  eraserTop: {
    width: 12,
    height: 8,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  eraserBottom: {
    width: 16,
    height: 6,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  colorPickerInline: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
});
