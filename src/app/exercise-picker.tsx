import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseFilterBar } from '@/components/exercises/ExerciseFilterBar';
import { ExerciseListRow } from '@/components/exercises/ExerciseListRow';
import { useExerciseLibrary } from '@/components/exercises/useExerciseLibrary';
import { Button, Divider, EmptyState, Loading, Text } from '@/components/ui';
import type { ExerciseRow } from '@/db/schema';
import { cancelPick, resolvePick, useExercisePicker } from '@/stores/exercisePicker';
import { useTheme } from '@/theme/AppProviders';

export default function ExercisePickerScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // Options are captured once: they belong to the pick request that opened this modal.
  const [options] = useState(() => useExercisePicker.getState().options);
  const multiple = !!options.multiple;
  const lib = useExerciseLibrary(options.excludeIds);
  const [selected, setSelected] = useState<string[]>([]);
  const resolved = useRef(false);
  /** Set when the user goes to create a custom exercise, so the new one gets auto-selected. */
  const createRequestedAt = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (!resolved.current) cancelPick();
    },
    [],
  );

  const finish = useCallback((ids: string[]) => {
    resolved.current = true;
    resolvePick(ids);
    router.back();
  }, []);

  const toggle = useCallback(
    (id: string) => {
      if (!multiple) {
        finish([id]);
        return;
      }
      void Haptics.selectionAsync().catch(() => {});
      setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    },
    [multiple, finish],
  );

  // Auto-select an exercise the user just created from here.
  useEffect(() => {
    const since = createRequestedAt.current;
    if (since == null) return;
    const created = lib.all.find((e) => e.isCustom && e.createdAt >= since);
    if (!created) return;
    createRequestedAt.current = null;
    if (multiple) setSelected((s) => (s.includes(created.id) ? s : [...s, created.id]));
  }, [lib.all, multiple]);

  const createCustom = () => {
    createRequestedAt.current = Date.now();
    const name = lib.query.trim();
    router.push({ pathname: '/exercise/edit', params: name ? { name } : {} });
  };

  const renderItem = useCallback(
    ({ item }: { item: ExerciseRow }) => {
      const order = selected.indexOf(item.id);
      return (
        <ExerciseListRow
          exercise={item}
          selected={order >= 0}
          onPress={() => toggle(item.id)}
          right={multiple ? <SelectionMarker order={order} /> : null}
        />
      );
    },
    [selected, toggle, multiple],
  );

  const title = options.title ?? (multiple ? 'Add Exercises' : 'Select Exercise');
  const n = selected.length;
  const confirm = options.confirmLabel
    ? `${options.confirmLabel}${n > 0 ? ` (${n})` : ''}`
    : n === 0
      ? 'Select exercises'
      : `Add ${n} ${n === 1 ? 'exercise' : 'exercises'}`;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen
        options={{
          title,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
              <Text color={t.colors.primary}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={createCustom} hitSlop={8} accessibilityRole="button" accessibilityLabel="Create custom exercise">
              <Text color={t.colors.primary} weight="600">
                Create
              </Text>
            </Pressable>
          ),
        }}
      />
      {!lib.loaded ? (
        <Loading />
      ) : (
        <>
          <View style={{ paddingTop: t.spacing(3) }}>
            <ExerciseFilterBar lib={lib} />
          </View>
          <FlatList
            data={lib.results}
            extraData={selected}
            keyExtractor={(e) => e.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={20}
            ItemSeparatorComponent={() => <Divider style={{ marginLeft: t.spacing(4) + 40 + t.spacing(3) }} />}
            ListHeaderComponent={
              <Pressable
                onPress={createCustom}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing(3),
                  paddingHorizontal: t.spacing(4),
                  paddingVertical: t.spacing(3),
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: t.colors.primaryMuted,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="add" size={22} color={t.colors.primary} />
                </View>
                <Text color={t.colors.primary} weight="600">
                  {lib.query.trim() ? `Create "${lib.query.trim()}"` : 'Create custom exercise'}
                </Text>
              </Pressable>
            }
            ListEmptyComponent={
              <EmptyState icon="search-outline" title="No exercises found" message="Try a different search or clear the filters." />
            }
            contentContainerStyle={{ paddingBottom: multiple ? 100 + insets.bottom : insets.bottom + t.spacing(6) }}
          />
          {multiple ? (
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                paddingHorizontal: t.spacing(4),
                paddingTop: t.spacing(3),
                paddingBottom: insets.bottom + t.spacing(3),
                backgroundColor: t.colors.background,
                borderTopWidth: 1,
                borderTopColor: t.colors.border,
              }}
            >
              <Button title={confirm} size="lg" disabled={n === 0} onPress={() => finish(selected)} />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function SelectionMarker({ order }: { order: number }) {
  const t = useTheme();
  const on = order >= 0;
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: on ? 0 : 2,
        borderColor: t.colors.border,
        backgroundColor: on ? t.colors.primary : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on ? (
        <Text weight="700" color={t.colors.onPrimary} style={{ fontSize: t.font.size.sm }}>
          {order + 1}
        </Text>
      ) : null}
    </View>
  );
}
