import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/** Holo-card foil hues, cycled twice so the drifting band never shows an edge. */
export const HOLO_COLORS = ['#FF5FCF', '#8A7CFF', '#4FE3FF', '#7CFFB2', '#FFE45C', '#FF8A5C'] as const;
const BAND = [...HOLO_COLORS, ...HOLO_COLORS, HOLO_COLORS[0]] as const;

/**
 * Every motion here is eased timing, never a spring (the user finds bounce
 * nauseating). Loops ping-pong on a sine ease so they never snap.
 */
const DRIFT = Easing.inOut(Easing.sin);

type Props = {
  /** 'tile' keeps the habit's face readable; 'card' is the full foil. */
  variant: 'tile' | 'card';
  /** Bump to play a bright sweep across the foil (the per-day celebration). */
  flashKey?: number;
  /** Card only: finger position over the card, 0..1 each axis, or -1 when not touched. */
  pointerX?: SharedValue<number>;
  pointerY?: SharedValue<number>;
};

/**
 * The holographic-card treatment: a static rainbow wash, a rainbow band that
 * slowly drifts across, and a periodic glare sweep. An overlay only
 * (pointerEvents none, absolute fill), so whatever it sits on keeps its
 * layout and colors underneath.
 */
export function HoloFoil({ variant, flashKey = 0, pointerX, pointerY }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  const card = variant === 'card';
  const drift = useSharedValue(0);
  const glare = useSharedValue(0);
  const flash = useSharedValue(0);

  useEffect(() => {
    drift.set(withRepeat(withTiming(1, { duration: card ? 5200 : 6400, easing: DRIFT }), -1, true));
    glare.set(
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withDelay(card ? 1800 : 3600, withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.cubic) })),
        ),
        -1,
      ),
    );
    return () => {
      cancelAnimation(drift);
      cancelAnimation(glare);
    };
  }, [card, drift, glare]);

  useEffect(() => {
    if (!flashKey) return;
    flash.set(0);
    flash.set(withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [flashKey, flash]);

  const { w, h } = size;
  const washOpacity = card ? 0.2 : 0.13;
  const bandOpacity = card ? 0.32 : 0.2;

  const bandStyle = useAnimatedStyle(() => ({
    opacity: bandOpacity + interpolate(flash.value, [0, 0.2, 1], [0, 0.35, 0]),
    transform: [{ translateX: interpolate(drift.value, [0, 1], [-w * 2, 0]) }],
  }));

  const glareStyle = useAnimatedStyle(() => {
    const p = flash.value > 0 && flash.value < 1 ? flash.value : glare.value;
    const strong = flash.value > 0 && flash.value < 1;
    return {
      opacity: strong ? interpolate(p, [0, 0.15, 1], [0, 0.95, 0]) : interpolate(p, [0, 0.2, 0.8, 1], [0, 0.6, 0.6, 0]),
      transform: [{ translateX: interpolate(p, [0, 1], [-w * 0.8, w * 1.3]) }, { rotate: '22deg' }],
    };
  });

  // Card: a soft light that follows the finger (the tilt-the-card glint).
  const spotStyle = useAnimatedStyle(() => {
    const px = pointerX?.value ?? -1;
    const py = pointerY?.value ?? -1;
    const on = px >= 0 && py >= 0;
    return {
      opacity: withTiming(on ? 0.55 : 0, { duration: 220 }),
      transform: [
        { translateX: (on ? px : 0.5) * w - w * 0.6 },
        { translateY: (on ? py : 0.5) * h - w * 0.6 },
      ],
    };
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {w > 0 && (
        <>
          <LinearGradient
            colors={HOLO_COLORS}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { opacity: washOpacity }]}
          />
          <Animated.View style={[styles.band, { width: w * 3, height: h }, bandStyle]}>
            <LinearGradient colors={BAND} start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <Animated.View style={[styles.glare, { width: Math.max(24, w * 0.32), height: h * 2.2, top: -h * 0.6 }, glareStyle]}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          {card && pointerX && (
            <Animated.View
              style={[
                styles.spot,
                {
                  width: w * 1.2,
                  height: w * 1.2,
                  borderRadius: w * 0.6,
                  experimental_backgroundImage:
                    'radial-gradient(circle, rgba(255,255,255,0.75) 0%, rgba(255,240,255,0.25) 35%, rgba(255,255,255,0) 70%)',
                },
                spotStyle,
              ]}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  glare: {
    position: 'absolute',
    left: 0,
  },
  spot: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
