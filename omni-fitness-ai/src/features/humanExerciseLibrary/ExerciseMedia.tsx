import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { BundledMedia } from './types';

const LOAD_TIMEOUT_MS = 8000;

interface LoopProps {
  video: number;
  poster: number;
  onClose: () => void;
}

function Loop({ video, poster, onClose }: LoopProps) {
  const [failed, setFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [shown, setShown] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ready = useRef(false);
  const backgrounded = useRef(false);
  const reduceMotionPaused = useRef(false);

  const player = useVideoPlayer(video, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  const markReady = useCallback(() => {
    if (ready.current) return;
    ready.current = true;
    setShown(true);
  }, []);

  // Playback is *derived* from the two reasons to be paused rather than toggled
  // by each event independently. Toggling meant whichever event fired last won:
  // a pause with no matching resume left the clip frozen on a single frame.
  const syncPlayback = useCallback(() => {
    if (backgrounded.current || reduceMotionPaused.current) player.pause();
    else player.play();
  }, [player]);

  useEffect(() => {
    const status = player.addListener('statusChange', ({ status: next }) => {
      if (next === 'error') setFailed(true);
      else if (next === 'readyToPlay') syncPlayback();
    });

    const background = AppState.addEventListener('change', (state) => {
      // Any non-'active' state pauses the clip, including the transient
      // 'inactive' iOS emits for Control Centre, the notification shade or an
      // incoming call. The flag must be cleared on the way back: it previously
      // latched to true and was never reset, so the resume branch could never
      // run again and the clip stayed frozen for the rest of the session.
      backgrounded.current = state !== 'active';
      syncPlayback();
    });

    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reduceMotionPaused.current = enabled;
      syncPlayback();
    });

    return () => {
      status.remove();
      background.remove();
      motion.remove();
    };
  }, [player, syncPlayback]);

  // Only a genuine player error is treated as unplayable. A slow first prepare
  // is not a device-capability failure, so the timeout reports a load timeout
  // with a working retry instead of permanently condemning a healthy bundled
  // file. Keyed on `attempt` so a retry re-arms the watchdog.
  useEffect(() => {
    const watchdog = setTimeout(() => {
      if (!ready.current) setTimedOut(true);
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(watchdog);
  }, [attempt]);

  return (
    <View>
      <View style={styles.stage}>
        <Image
          source={poster}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          accessibilityLabel="Exercise still image"
          // The poster sits underneath a playing video; keeping it in the
          // accessibility tree made screen readers announce a still image over
          // live motion.
          accessibilityElementsHidden={shown}
          importantForAccessibility={shown ? 'no-hide-descendants' : 'yes'}
        />
        {!failed && (
          <VideoView
            player={player}
            style={[StyleSheet.absoluteFill, { opacity: shown ? 1 : 0 }]}
            contentFit="contain"
            nativeControls
            playsInline
            useExoShutter={false}
            // The poster is revealed only once a frame is actually painted.
            // Previously 'readyToPlay' cleared this flag first, so the poster
            // was hidden while the surface was still blank (transparent
            // AVPlayerLayer on iOS, unshuttered SurfaceView on Android).
            onFirstFrameRender={markReady}
          />
        )}
      </View>
      {failed && (
        <View style={styles.error}>
          <Text style={styles.message}>
            This device could not play the bundled MP4. The still image above remains available.
          </Text>
        </View>
      )}
      {timedOut && !failed && (
        <View style={styles.error}>
          <Text style={styles.message}>
            This is taking longer than expected to load. The still image above is available in the
            meantime.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setTimedOut(false);
              ready.current = false;
              // Re-hide the poster so the retry does not show a stale surface,
              // and bump `attempt` to re-arm the load watchdog.
              setShown(false);
              setAttempt((n) => n + 1);
              player.replace(video);
              syncPlayback();
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      )}
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.button}>
        <Text style={styles.buttonText}>Stop and show still image</Text>
      </Pressable>
    </View>
  );
}

export default function ExerciseMedia({ asset, name }: { asset: BundledMedia; name: string }) {
  const [playing, setPlaying] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    // Register the listener BEFORE querying the current value, and ignore the
    // query result if the listener already reported a fresher value. The old
    // order started the promise first, so a change made in that window was
    // lost entirely and then overwritten by the stale promise value - defeating
    // the reduce-motion behaviour for the session. This matches
    // useMotionPreferences.ts and PressableScale.tsx.
    let preferenceChanged = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (!active) return;
      preferenceChanged = true;
      setReduceMotion(enabled);
      if (enabled) setPlaying(false);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active && !preferenceChanged) setReduceMotion(enabled);
    }).catch(() => { if (active && !preferenceChanged) setReduceMotion(true); });
    return () => { active = false; subscription.remove(); };
  }, []);

  // The parent keys this component by exercise ID and presentation. Changing
  // either unmounts a playing video, preventing hidden simultaneous playback.
  if (playing && asset.video !== null) {
    return <Loop video={asset.video} poster={asset.poster} onClose={() => setPlaying(false)} />;
  }

  return (
    <View>
      <Image
        source={asset.poster}
        style={styles.stage}
        contentFit="contain"
        accessibilityLabel={`${name}, continuous human-mesh exercise demonstration`}
      />
      {asset.kind === 'animation' && asset.video !== null ? (
        <Pressable accessibilityRole="button" onPress={() => setPlaying(true)} style={styles.button}>
          <Text style={styles.buttonText}>{reduceMotion ? 'Play movement explicitly' : 'Play movement'}</Text>
        </Pressable>
      ) : (
        <Text style={styles.hold}>Static hold — no repetition animation is needed.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', aspectRatio: 1, backgroundColor: '#222b27', borderRadius: 14, overflow: 'hidden' },
  button: { backgroundColor: '#e6bc74', paddingVertical: 13, paddingHorizontal: 18, borderRadius: 10, marginTop: 10, alignItems: 'center' },
  buttonText: { color: '#171711', fontWeight: '700', fontSize: 15 },
  hold: { color: '#c6cdcc', fontSize: 14, paddingTop: 12, textAlign: 'center' },
  error: { padding: 18, backgroundColor: '#252b2d', borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: 10 },
  message: { color: '#f2ece0', lineHeight: 23 },
});
