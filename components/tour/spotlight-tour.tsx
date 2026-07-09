import { useEffect, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import { QuestColors } from '@/constants/theme';
import { useTour, type Rect } from '@/contexts/tour-context-core';

// Spotlight hole padding around the measured target.
const PAD = 8;
// Underworld dim — deep, near-black violet so any tab behind reads as "Hades".
const DIM = 'rgba(8,6,18,0.82)';

/**
 * The overlay. Adapts the bekin8 technique — four absolutely-positioned dim
 * rectangles leaving a clear "hole" over the target, plus a border ring — so
 * there's no SVG mask or Skia dependency. The EFH twist: the Next button is
 * GATED. When the active step has an unmet `gate`, Next is disabled and reads
 * as the instruction ("Plant a habit to continue"); completing the task in
 * the live data flips it on.
 *
 * Visibility is segment-aware: a target step only draws while its screen is
 * showing, so navigating INTO the create flow doesn't dim that screen — the
 * spotlight simply waits, then re-appears (task now done) when you return.
 */
export function SpotlightTour() {
  const { isActive, steps, index, taskState, measureTarget, onNext, onBack, onSkip } = useTour();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();

  const step = steps?.[index] ?? null;
  const total = steps?.length ?? 0;

  // Rect is tagged with the step index it was measured for, so a stale poll
  // result can never bleed into the next beat and we never need a synchronous
  // reset-setState in the effect body (which the React Compiler flags).
  const [measured, setMeasured] = useState<{ index: number; rect: Rect } | null>(null);
  const [calloutAnim] = useState(() => new Animated.Value(0));

  const onScreen = !step?.match || (!!step?.match && step.match(segments));
  const visible = isActive && !!step && onScreen;

  // Entrance animation — replays each time a new beat becomes visible.
  useEffect(() => {
    if (!visible) return;
    calloutAnim.setValue(0);
    const anim = Animated.timing(calloutAnim, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [visible, index, calloutAnim]);

  // Measure + track the target while this step is on its screen. Polls so a
  // rect captured mid-layout settles, and so scroll/animation keep the hole
  // glued to the element. setState happens only inside the async callback,
  // never synchronously in the effect body. Centered beats stay null.
  useEffect(() => {
    if (!visible || !step?.target) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (cancelled) return;
      const r = await measureTarget(step.target!);
      if (!cancelled) {
        if (r && r.width > 0) {
          setMeasured((prev) =>
            prev &&
            prev.index === index &&
            Math.abs(prev.rect.x - r.x) < 0.5 &&
            Math.abs(prev.rect.y - r.y) < 0.5 &&
            Math.abs(prev.rect.width - r.width) < 0.5 &&
            Math.abs(prev.rect.height - r.height) < 0.5
              ? prev
              : { index, rect: r },
          );
        } else {
          // Target unmounted mid-step (e.g. the spotlighted Begin stub became
          // a QuestCard) — drop the stale rect so the step degrades to the
          // centered beat instead of ringing whatever now sits there.
          setMeasured((prev) => (prev && prev.index === index ? null : prev));
        }
      }
      if (!cancelled) timer = setTimeout(poll, 180);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, index, step?.target, measureTarget]);

  if (!visible || !step) return null;

  const measuredRect = measured && measured.index === index ? measured.rect : null;
  // A target scrolled fully off-screen clamps to a zero-area hole, which
  // would render four dim bars covering 100% of the screen with no way
  // through. Treat a degenerate hole as target-lost: the centered layout
  // keeps the callout (and Back/Next) reachable.
  const rect =
    measuredRect &&
    measuredRect.y + measuredRect.height > 0 &&
    measuredRect.y < H &&
    measuredRect.x + measuredRect.width > 0 &&
    measuredRect.x < W
      ? measuredRect
      : null;

  const isLast = index === total - 1;
  const gateOk = !step.gate || step.gate(taskState);
  const showRing = !!step.target && !!rect;

  // Hole geometry — symmetric padding, clamped to the viewport so an off-screen
  // or partially-scrolled target can never produce a negative-size rect.
  const hy = rect ? Math.max(0, rect.y - PAD) : 0;
  const holeBottom = rect ? Math.max(hy, Math.min(H, rect.y + rect.height + PAD)) : 0;
  const hh = holeBottom - hy;
  const hx = rect ? Math.max(0, rect.x - PAD) : 0;
  const holeRight = rect ? Math.max(hx, Math.min(W, rect.x + rect.width + PAD)) : 0;
  const hw = holeRight - hx;

  // Callout slot: target high on screen → callout LOW (and vice-versa) so the
  // card never covers what it points at. Centered beats sit in the upper third.
  const TOP_LIMIT = insets.top + 14;
  let calloutPos: { top?: number; bottom?: number; left: number; right: number };
  if (!rect) {
    calloutPos = { top: Math.max(TOP_LIMIT + 24, H * 0.28), left: 20, right: 20 };
  } else {
    const midY = rect.y + rect.height / 2;
    const useLow =
      step.placement === 'low' ? true : step.placement === 'top' ? false : midY < H * 0.45;
    calloutPos = useLow
      ? { bottom: insets.bottom + 96, left: 20, right: 20 }
      : { top: TOP_LIMIT, left: 20, right: 20 };
  }
  const calloutMaxH = H - insets.top - insets.bottom - 160;

  const ctaLabel = gateOk
    ? step.cta ?? (isLast ? 'Done' : 'Next ›')
    : step.ctaLocked ?? 'Complete the task to continue';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {rect ? (
        <>
          {/* Four dim bars frame a clear hole over the target. */}
          <View style={[styles.dim, { left: 0, top: 0, width: W, height: hy }]} />
          <View
            style={[styles.dim, { left: 0, top: holeBottom, width: W, height: Math.max(0, H - holeBottom) }]}
          />
          <View style={[styles.dim, { left: 0, top: hy, width: hx, height: hh }]} />
          <View
            style={[styles.dim, { left: hx + hw, top: hy, width: Math.max(0, W - (hx + hw)), height: hh }]}
          />
          {/* Non-interactive target → seal the hole so the only way on is Next. */}
          {!step.interactive && (
            <Pressable
              style={{ position: 'absolute', left: hx, top: hy, width: hw, height: hh }}
              onPress={() => {}}
            />
          )}
        </>
      ) : (
        // Centered beat (or measuring): full backdrop that swallows stray taps.
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} onPress={() => {}} />
      )}

      {/* Ember ring around the live target. */}
      {showRing && (
        <View
          pointerEvents="none"
          style={[styles.ring, { left: hx, top: hy, width: hw, height: hh }]}
        />
      )}

      {/* Callout card */}
      <Animated.View
        pointerEvents="auto"
        style={[
          styles.callout,
          calloutPos,
          {
            maxHeight: calloutMaxH,
            opacity: calloutAnim,
            transform: [
              {
                translateY: calloutAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
              },
            ],
          },
        ]}
      >
        <View style={styles.eyebrowRow}>
          {!!step.eyebrow && <Text style={styles.eyebrow}>{step.eyebrow}</Text>}
          {step.gate && gateOk && <Text style={styles.donePill}>✓ DONE</Text>}
        </View>

        <Text style={styles.title}>{step.title}</Text>

        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Text style={styles.body}>{step.body}</Text>

          {!!step.mantras?.length && (
            <View style={styles.mantras}>
              {step.mantras.map((m, i) => (
                <Text key={i} style={styles.mantra}>
                  {`${['Ⅰ', 'Ⅱ', 'Ⅲ'][i] ?? '•'}  ${m}`}
                </Text>
              ))}
            </View>
          )}

          {[step.quote, step.quote2].map((q, i) =>
            q ? (
              <View
                key={i}
                style={[styles.quoteBlock, q.accent ? { borderLeftColor: q.accent } : null]}
              >
                <Text style={styles.quoteText}>“{q.text}”</Text>
                <Text style={[styles.quoteSource, q.accent ? { color: q.accent } : null]}>
                  {q.source}
                </Text>
                {!!q.gloss && <Text style={styles.quoteGloss}>{q.gloss}</Text>}
              </View>
            ) : null,
          )}
        </ScrollView>

        <View style={styles.nav}>
          <View style={styles.navLeft}>
            {index > 0 ? (
              <Pressable onPress={onBack} hitSlop={8}>
                <Text style={styles.backText}>‹ Back</Text>
              </Pressable>
            ) : (
              <Pressable onPress={onSkip} hitSlop={8}>
                <Text style={styles.skipText}>Skip</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.counter}>{`${index + 1} / ${total}`}</Text>

          <Pressable
            onPress={onNext}
            disabled={!gateOk}
            style={[styles.nextBtn, !gateOk && styles.nextBtnDisabled]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !gateOk }}
            accessibilityLabel={ctaLabel}
          >
            <Text style={[styles.nextText, !gateOk && styles.nextTextDisabled]}>{ctaLabel}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: DIM },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 12,
    borderColor: QuestColors.flameHigh,
    shadowColor: QuestColors.flameHigh,
    shadowOpacity: 0.7,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  callout: {
    position: 'absolute',
    backgroundColor: QuestColors.surface,
    borderColor: QuestColors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    color: QuestColors.flameHigh,
  },
  donePill: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: QuestColors.wellness,
  },
  title: {
    marginTop: 8,
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 27,
    color: QuestColors.text,
  },
  bodyScroll: {
    marginTop: 10,
    flexGrow: 0,
  },
  bodyContent: {
    paddingBottom: 2,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: QuestColors.text,
    opacity: 0.92,
  },
  mantras: {
    marginTop: 14,
    gap: 6,
  },
  mantra: {
    fontSize: 15,
    fontWeight: '700',
    color: QuestColors.gold,
    letterSpacing: 0.3,
  },
  quoteBlock: {
    marginTop: 14,
    borderLeftWidth: 2,
    borderLeftColor: QuestColors.flameMid,
    paddingLeft: 12,
  },
  quoteText: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
    color: QuestColors.text,
  },
  quoteSource: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: QuestColors.textDim,
  },
  quoteGloss: {
    marginTop: 8,
    fontSize: 12.5,
    lineHeight: 18,
    color: QuestColors.flameHigh,
    opacity: 0.95,
  },
  nav: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navLeft: {
    minWidth: 56,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: QuestColors.textDim,
  },
  skipText: {
    fontSize: 13,
    color: QuestColors.textDim,
  },
  counter: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: QuestColors.textDim,
    fontVariant: ['tabular-nums'],
  },
  nextBtn: {
    backgroundColor: QuestColors.flameMid,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  nextBtnDisabled: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: QuestColors.border,
  },
  nextText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  nextTextDisabled: {
    color: QuestColors.textDim,
  },
});
