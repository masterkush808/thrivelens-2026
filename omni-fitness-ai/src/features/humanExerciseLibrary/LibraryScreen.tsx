import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import catalogue from './catalogue.generated.json';
import { ASSETS } from './assets.generated';
import ExerciseMedia from './ExerciseMedia';
import type { LibraryExercise, Presentation } from './types';

function PresentationToggle({
  presentation,
  onChange,
}: {
  presentation: Presentation;
  onChange: (value: Presentation) => void;
}) {
  return (
    <View style={styles.picker}>
      {(['male', 'female'] as const).map((value) => (
        <Pressable
          key={value}
          accessibilityRole="button"
          accessibilityState={{ selected: presentation === value }}
          accessibilityLabel={`${value} presentation`}
          onPress={() => onChange(value)}
          style={[styles.choice, presentation === value && styles.choiceActive]}
        >
          <Text style={[styles.choiceText, presentation === value && styles.choiceTextActive]}>
            {value === 'male' ? 'Male' : 'Female'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const EXERCISES = catalogue.exercises as LibraryExercise[];
const CATEGORIES = catalogue.bodyParts;

export default function HumanExerciseLibraryScreen() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<Presentation>('male');
  const [selected, setSelected] = useState<LibraryExercise | null>(null);
  useFocusEffect(useCallback(() => () => { setSelected(null); }, []));
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return EXERCISES.filter((exercise) =>
      (!category || exercise.bodyPart === category) &&
      (!text || `${exercise.name} ${exercise.equipment} ${exercise.bodyPart} ${exercise.demonstrationVariant}`.toLowerCase().includes(text)),
    );
  }, [query, category]);
  const categoryName = (id: string) => CATEGORIES.find((entry) => entry.id === id)?.name ?? id;
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/workout');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={goBack} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Exercise Library</Text>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(exercise) => exercise.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={(
          <View>
            <Text style={styles.eyebrow}>EXERCISE LIBRARY</Text>
            <Text style={styles.intro}>43 exercises · 9 categories · offline media</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.search}
              placeholder="Search exercise or equipment"
              placeholderTextColor="#acb7b8"
              accessibilityLabel="Search exercises"
              autoCorrect={false}
            />
            <PresentationToggle presentation={presentation} onChange={setPresentation} />
            <Text style={styles.helper}>Character appearance changes; exercise access does not.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {[{ id: '', name: 'All' }, ...CATEGORIES].map((entry) => (
                <Pressable
                  key={entry.id || 'all'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: (category ?? '') === entry.id }}
                  onPress={() => setCategory(entry.id || null)}
                  style={[styles.chip, (category ?? '') === entry.id && styles.chipActive]}
                >
                  <Text style={styles.chipText}>{entry.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.count}>{filtered.length} exercises</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No matching exercise. Clear the search or choose All.</Text>}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => setSelected(item)} style={styles.card}>
            <Image source={ASSETS[item.id][presentation].poster} style={styles.thumbnail} contentFit="contain" accessibilityLabel={`${item.name} illustration`} />
            <View style={styles.cardText}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.subtitle}>{categoryName(item.bodyPart)} · {item.equipment}</Text>
              <Text style={styles.small}>{item.media[presentation].kind === 'hold' ? 'Rendered hold' : 'Rendered movement'} · {item.level}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        )}
        ListFooterComponent={(
          <Text style={styles.notice}>
            Human-shaped demonstrations. They are not motion capture or professional technique certification. Have a qualified fitness professional review demonstrations before public coaching use.
          </Text>
        )}
      />
      <Modal visible={selected !== null} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setSelected(null)}>
        <SafeAreaView style={styles.screen}>
          {selected && (
            <ScrollView contentContainerStyle={styles.detail}>
              <Pressable accessibilityRole="button" onPress={() => setSelected(null)} style={styles.close}>
                <Text style={styles.backText}>‹ Exercise Library</Text>
              </Pressable>
              <Text style={styles.detailTitle}>{selected.name}</Text>
              <PresentationToggle presentation={presentation} onChange={setPresentation} />
              <ExerciseMedia
                key={`${selected.id}:${presentation}`}
                asset={ASSETS[selected.id][presentation]}
                name={selected.name}
              />
              <View style={styles.table}>
                {[
                  ['Category', categoryName(selected.bodyPart)],
                  ['Equipment', selected.equipment],
                  ['Shown variation', selected.demonstrationVariant],
                  ['Side shown', selected.sideDemonstrated],
                  ['Mechanics', selected.mechanics],
                ].map(([label, value]) => (
                  <View key={label} style={styles.tableRow}>
                    <Text style={styles.label}>{label}</Text>
                    <Text style={styles.value}>{value}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.sectionTitle}>What this illustration shows</Text>
              <Text style={styles.body}>{selected.illustrationSummary}</Text>
              <Text style={styles.notice}>
                Continuous, originally sculpted human figure. Highlighted areas are broad visual emphasis, not measured muscle activation. Playback speed and pictured weights are not training recommendations. Technique has not been professionally certified.
              </Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111719' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#354044' },
  back: { paddingVertical: 8, paddingRight: 20 }, backText: { color: '#e6bc74', fontSize: 16, fontWeight: '600' },
  title: { color: '#f6f0e7', fontSize: 23, fontWeight: '700', flex: 1 },
  list: { padding: 18, paddingBottom: 40 },
  eyebrow: { color: '#e6bc74', fontSize: 12, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  intro: { color: '#bac5c7', fontSize: 15, marginBottom: 16 },
  search: { color: '#f6f0e7', borderWidth: 1, borderColor: '#455259', backgroundColor: '#1d282d', borderRadius: 12, padding: 14, fontSize: 16 },
  picker: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 8 },
  choice: { flex: 1, borderWidth: 1, borderColor: '#536167', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  choiceActive: { borderColor: '#e6bc74', backgroundColor: '#e6bc74' },
  choiceText: { color: '#d8dfdf', fontWeight: '600', fontSize: 13 }, choiceTextActive: { color: '#182023' },
  helper: { color: '#a9b6b8', fontSize: 12, marginBottom: 10, lineHeight: 18 },
  filters: { gap: 8, paddingVertical: 10 },
  chip: { borderWidth: 1, borderColor: '#46555c', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive: { backgroundColor: '#364850', borderColor: '#e6bc74' }, chipText: { color: '#f2ece3', fontSize: 13 },
  count: { color: '#b8c3c5', marginVertical: 12, fontSize: 13 },
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#34474f', borderRadius: 15, backgroundColor: '#1b262b', padding: 10, marginBottom: 10 },
  thumbnail: { width: 86, height: 86, borderRadius: 10, backgroundColor: '#222b27' }, cardText: { flex: 1, paddingHorizontal: 12 },
  name: { color: '#f6f0e7', fontSize: 16, fontWeight: '700', lineHeight: 22 },
  subtitle: { color: '#c2cecf', fontSize: 12, marginTop: 5 }, small: { color: '#a6b5b8', fontSize: 11, marginTop: 5 },
  arrow: { color: '#e6bc74', fontSize: 26, paddingHorizontal: 4 },
  empty: { color: '#c4d0d1', paddingVertical: 30, lineHeight: 22 },
  notice: { color: '#b1bfc2', fontSize: 12, lineHeight: 19, marginTop: 18, padding: 14, borderWidth: 1, borderColor: '#435158', borderRadius: 10 },
  detail: { padding: 20, paddingBottom: 45 }, close: { alignSelf: 'flex-start', paddingVertical: 10 },
  detailTitle: { color: '#f6f0e7', fontSize: 27, fontWeight: '700', marginTop: 12, lineHeight: 34 },
  table: { borderWidth: 1, borderColor: '#435158', borderRadius: 10, marginTop: 20, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: '#344047', gap: 12 },
  label: { color: '#aebfc3', fontSize: 13, width: 104 }, value: { color: '#edf0eb', fontSize: 13, flex: 1, lineHeight: 20 },
  sectionTitle: { color: '#e6bc74', marginTop: 23, fontSize: 17, fontWeight: '700' },
  body: { color: '#d0d8d9', fontSize: 15, lineHeight: 24, marginTop: 10 },
});
