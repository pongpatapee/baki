import { router, useNavigation } from 'expo-router';
import { useCallback, useLayoutEffect } from 'react';
import { FlatList, View } from 'react-native';

import { ExerciseFilterBar } from '@/components/exercises/ExerciseFilterBar';
import { ExerciseListRow } from '@/components/exercises/ExerciseListRow';
import { useExerciseLibrary } from '@/components/exercises/useExerciseLibrary';
import { Button, Divider, EmptyState, IconButton, Loading, Text } from '@/components/ui';
import type { ExerciseRow } from '@/db/schema';
import { useTheme } from '@/theme/AppProviders';

export default function ExercisesTab() {
  const t = useTheme();
  const navigation = useNavigation();
  const lib = useExerciseLibrary();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="add"
          size={26}
          color={t.colors.primary}
          accessibilityLabel="Create custom exercise"
          onPress={() => router.push('/exercise/edit')}
          style={{ marginRight: t.spacing(2) }}
        />
      ),
    });
  }, [navigation, t]);

  const renderItem = useCallback(
    ({ item }: { item: ExerciseRow }) => (
      <ExerciseListRow exercise={item} onPress={() => router.push(`/exercise/${item.id}`)} />
    ),
    [],
  );

  if (!lib.loaded) return <Loading />;
  const filtered = lib.query.trim() !== '' || lib.muscle != null || lib.equipment != null;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ExerciseFilterBar lib={lib} />
      <FlatList
        data={lib.results}
        keyExtractor={(e) => e.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ItemSeparatorComponent={() => <Divider style={{ marginLeft: t.spacing(4) + 40 + t.spacing(3) }} />}
        initialNumToRender={20}
        ListHeaderComponent={
          <Text variant="caption" faint style={{ paddingHorizontal: t.spacing(4), paddingBottom: t.spacing(1) }}>
            {lib.results.length} {lib.results.length === 1 ? 'exercise' : 'exercises'}
          </Text>
        }
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="No exercises found"
            message={filtered ? 'Try a different search or clear the filters.' : undefined}
            action={
              <Button
                title={lib.query.trim() ? `Create "${lib.query.trim()}"` : 'Create Custom Exercise'}
                icon="add"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/exercise/edit', params: lib.query.trim() ? { name: lib.query.trim() } : {} })
                }
              />
            }
          />
        }
        contentContainerStyle={{ paddingBottom: t.spacing(12) }}
      />
    </View>
  );
}
