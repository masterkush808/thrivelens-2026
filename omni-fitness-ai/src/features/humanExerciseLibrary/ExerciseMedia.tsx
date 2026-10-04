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
  const [shown, setShown] = useState(false);
  const ready = useRef(false);

  const player = useVideoPlayer(video, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  const markReady = useCallback(() => {
    if (ready.current) return;
    ready.current = true;
    setShown(true);
    player.play();
  }, [player]);

  useEffect(() => {
    const status = player.addListener('statusChange', ({ status: next }) => {
      if (next === 'error') setFailed(true);
      else if (next === 'readyToPlay') markReady();
    });

    const watchdog = setTimeout(() => {
      if (!ready.current) setFailed(true);
    }, LOAD_TIMEOUT_MS);

    const background = AppState.addEventListener('change', (state) => {
      if (state !== 'active') player.pause();
    });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (enabled) player.pause();
    });

    return () => {
      clearTimeout(watchdog);
      status.remove();
      background.remove();
      motion.remove();
    };
  }, [player, markReady]);

  return (
    <View>
      <View style={styles.stage}>
        <Image
          source={poster}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          accessibilityLabel="Exercise still image"
        />
        {!failed && (
          <VideoView
            player={player}
            style={[StyleSheet.absoluteFill, { opacity: shown ? 1 : 0 }]}
            contentFit="contain"
            nativeControls
            playsInline
            useExoShutter={false}
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
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    }).catch(() => { if (active) setReduceMotion(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled);
      if (enabled) setPlaying(false);
    });
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
