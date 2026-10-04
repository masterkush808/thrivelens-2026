import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text, Card } from "@/components/ui";
import { E1rmChart } from "@/components/strength/E1rmChart";
import {
  ExerciseProgress,
  SessionDetail,
  StrengthSummary,
  getExerciseProgress,
  getRecentSessionDetails,
  getStrengthSummary,
  getTrackedExerciseOptions,
} from "@/data/workoutRepository";
import {
  VOLUME_EXPLANATION,
  formatPercent,
  formatVolume,
  percentChange,
} from "@/data/workoutMetrics";

function shortDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-center border-b border-border/40 py-2">
      <Text variant="bodySmall" className="text-text-secondary flex-1">
        {label}
      </Text>
      <Text variant="bodySmall" className="text-text-primary font-semibold">
        {value}
      </Text>
    </View>
  );
}

function Overview({ summary, rangeLabel }: { summary: StrengthSummary; rangeLabel: string }) {
  const delta = formatPercent(percentChange(summary.volumeKg, summary.previousVolumeKg));

  return (
    <Card variant="elevated">
      <View className="flex-row flex-wrap mb-1">
        <View className="w-[50%] py-2">
          <Text variant="caption" className="text-text-tertiary">
            Workouts
          </Text>
          <Text variant="stat" className="text-primary">
            {summary.workouts}
          </Text>
        </View>
        <View className="w-[50%] py-2">
          <Text variant="caption" className="text-text-tertiary">
            Exercises
          </Text>
          <Text variant="stat" className="text-primary">
            {summary.exercises}
          </Text>
        </View>
        <View className="w-[50%] py-2">
          <Text variant="caption" className="text-text-tertiary">
            Sets
          </Text>
          <Text variant="stat" className="text-text-primary">
            {summary.sets}
          </Text>
        </View>
        <View className="w-[50%] py-2">
          <Text variant="caption" className="text-text-tertiary">
            Personal records
          </Text>
          <Text variant="stat" className="text-success">
            {summary.personalRecords}
          </Text>
        </View>
      </View>

      <View className="border-t border-border mt-2 pt-3">
        <View className="flex-row items-baseline gap-2">
          <Text variant="caption" className="text-text-tertiary flex-1">
            Training volume · {rangeLabel}
          </Text>
          {delta && (
            <Text
              variant="caption"
              className={summary.volumeKg >= summary.previousVolumeKg ? "text-success" : "text-warning"}
            >
              {delta} vs previous
            </Text>
          )}
        </View>
        <Text variant="statLarge" className="text-primary mt-1">
          {formatVolume(summary.volumeKg)}
        </Text>
        <Text variant="caption" className="text-text-tertiary mt-2 leading-4">
          {VOLUME_EXPLANATION}
        </Text>
      </View>
    </Card>
  );
}

function Progression({
  options,
  selectedId,
  onSelect,
  progress,
}: {
  options: { id: string; name: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  progress: ExerciseProgress | null;
}) {
  if (options.length === 0) {
    return (
      <Card variant="elevated">
        <Text variant="body" className="text-text-primary font-semibold">
          No strength data yet
        </Text>
        <Text variant="bodySmall" className="text-text-secondary mt-2">
          Log a workout and this becomes an exercise-by-exercise progression view.
        </Text>
      </Card>
    );
  }

  return (
    <Card variant="elevated">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
      >
        {options.map((option) => {
          const active = option.id === selectedId;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(option.id)}
              className={`px-3 py-2 rounded-full border ${
                active ? "bg-primary border-primary" : "bg-surface-highlight border-border"
              }`}
            >
              <Text
                variant="caption"
                className={active ? "text-text-inverse font-semibold" : "text-text-secondary"}
              >
                {option.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {progress && (
        <View>
          <View className="mb-1">
            <MetricRow
              label="Best weight"
              value={progress.bestWeightKg !== null ? `${progress.bestWeightKg} kg` : "—"}
            />
            <MetricRow label="Best reps" value={progress.bestReps > 0 ? `${progress.bestReps}` : "—"} />
            <MetricRow
              label="Estimated 1RM"
              value={progress.bestE1rm !== null ? `${Math.round(progress.bestE1rm)} kg` : "—"}
            />
            <MetricRow
              label="Best set"
              value={
                progress.bestSetVolumeKg > 0
                  ? `${Math.round(progress.bestSetVolumeKg).toLocaleString()} kg`
                  : "—"
              }
            />
            <MetricRow label="Sessions" value={`${progress.sessions}`} />
            <MetricRow label="Personal records" value={`${progress.personalRecords}`} />
          </View>

          {progress.history.length > 0 ? (
            <View className="mt-3">
              <Text variant="caption" className="text-text-tertiary mb-1">
                Estimated 1RM over time
              </Text>
              <E1rmChart points={progress.history} />
            </View>
          ) : (
            <Text variant="bodySmall" className="text-text-secondary mt-3">
              Log a weighted set of this exercise to start tracking estimated 1RM.
            </Text>
          )}
        </View>
      )}
    </Card>
  );
}

function SessionCard({
  session,
  expanded,
  onToggle,
}: {
  session: SessionDetail;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <View className="border border-border rounded-xxl bg-surface-elevated overflow-hidden">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        className="p-4 active:opacity-80"
      >
        <View className="flex-row items-center justify-between">
          <Text variant="bodySmall" className="text-text-primary font-semibold flex-1">
            {shortDate(session.performedAt)} · {session.title}
          </Text>
          <Text variant="caption" className="text-primary ml-2">
            {expanded ? "Hide" : "Show"}
          </Text>
        </View>
        <Text variant="caption" className="text-text-tertiary mt-1">
          {session.exerciseCount} {session.exerciseCount === 1 ? "exercise" : "exercises"} ·{" "}
          {session.totalSets} sets · {formatVolume(session.volumeKg)}
        </Text>
      </Pressable>

      {expanded && (
        <View className="px-4 pb-4">
          {session.exercises.map((row, index) => (
            <View
              key={`${row.exerciseId}-${index}`}
              className="border-t border-border/40 py-2"
            >
              <View className="flex-row justify-between items-center">
                <Text variant="bodySmall" className="text-text-primary font-semibold flex-1">
                  {row.name}
                </Text>
                {row.e1rm !== null && (
                  <Text variant="caption" className="text-success ml-2">
                    e1RM {Math.round(row.e1rm)} kg
                  </Text>
                )}
              </View>
              <Text variant="caption" className="text-text-tertiary mt-1">
                {row.weightKg !== null && row.weightKg > 0
                  ? `${row.weightKg} kg × ${row.reps > 0 ? row.reps : "—"} · ${row.sets} ${
                      row.sets === 1 ? "set" : "sets"
                    }`
                  : `Bodyweight · ${row.sets} ${row.sets === 1 ? "set" : "sets"}`}
                {row.volumeKg > 0 ? ` · ${formatVolume(row.volumeKg)}` : ""}
              </Text>
            </View>
          ))}
          <View className="border-t border-border mt-1 pt-2 flex-row justify-between">
            <Text variant="caption" className="text-text-tertiary">
              Session volume
            </Text>
            <Text variant="bodySmall" className="text-primary font-semibold">
              {formatVolume(session.volumeKg)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

export function StrengthSection({ rangeLabel }: { rangeLabel: string }) {
  const [summary, setSummary] = useState<StrengthSummary | null>(null);
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progressFor, setProgressFor] = useState<{
    id: string;
    data: ExerciseProgress | null;
  } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const rangeMs = rangeLabel === "7D" ? 7 : rangeLabel === "30D" ? 30 : 90;

  const load = useCallback(async () => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - rangeMs);

    const [nextSummary, nextSessions, nextOptions] = await Promise.all([
      getStrengthSummary(since.getTime()),
      getRecentSessionDetails(5),
      getTrackedExerciseOptions(),
    ]);

    setSummary(nextSummary);
    setSessions(nextSessions);
    setOptions(nextOptions);
    setSelectedId((current) => current ?? nextOptions[0]?.id ?? null);
    setLoaded(true);
  }, [rangeMs]);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch {}
    })();
  }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    (async () => {
      try {
        const next = await getExerciseProgress(selectedId);
        if (active) setProgressFor({ id: selectedId, data: next });
      } catch {
        if (active) setProgressFor({ id: selectedId, data: null });
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedId]);

  const progress = progressFor && progressFor.id === selectedId ? progressFor.data : null;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } catch {
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return (
    <View className="gap-4">
      <View>
        <Text variant="h3" className="mb-1">
          Strength Progress
        </Text>
        <Text variant="bodySmall" className="text-text-secondary">
          {rangeLabel === "7D" ? "This week" : `Last ${rangeLabel}`} ·{" "}
          {loaded ? "pull down or tap refresh to update" : "loading"}
        </Text>
      </View>

      {summary ? (
        <Overview summary={summary} rangeLabel={rangeLabel === "7D" ? "this week" : `last ${rangeLabel}`} />
      ) : (
        <Card variant="elevated">
          <Text variant="body" className="text-text-primary font-semibold">
            Loading strength data
          </Text>
        </Card>
      )}

      <View>
        <Text variant="h3" className="mb-1">
          Strength Progression
        </Text>
        <Text variant="bodySmall" className="text-text-secondary mb-3">
          Am I getting stronger? Pick an exercise.
        </Text>
        <Progression
          options={options}
          selectedId={selectedId}
          onSelect={setSelectedId}
          progress={progress}
        />
      </View>

      <View>
        <Text variant="h3" className="mb-3">
          Recent Workouts
        </Text>
        {sessions.length === 0 ? (
          <Card variant="elevated">
            <Text variant="bodySmall" className="text-text-secondary">
              No workouts logged yet. Log one from the Workout tab.
            </Text>
          </Card>
        ) : (
          <View className="gap-3">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                expanded={expandedId === session.id}
                onToggle={() =>
                  setExpandedId((current) => (current === session.id ? null : session.id))
                }
              />
            ))}
          </View>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onRefresh}
        className="border border-border rounded-xxl py-3 items-center active:opacity-80"
      >
        <Text variant="caption" className="text-primary">
          {refreshing ? "Refreshing…" : "Refresh strength data"}
        </Text>
      </Pressable>
    </View>
  );
}
