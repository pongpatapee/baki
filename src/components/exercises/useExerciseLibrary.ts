import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo, useState } from 'react';

import { exercisesQuery } from '@/db/repositories/exercises';
import type { ExerciseRow } from '@/db/schema';
import { filterExercises } from '@/domain/exerciseSearch';
import type { Equipment, MuscleGroup } from '@/domain/types';

export interface ExerciseLibraryState {
  all: ExerciseRow[];
  results: ExerciseRow[];
  query: string;
  setQuery: (q: string) => void;
  muscle: MuscleGroup | null;
  setMuscle: (m: MuscleGroup | null) => void;
  equipment: Equipment | null;
  setEquipment: (e: Equipment | null) => void;
  loaded: boolean;
}

/** Live list of visible exercises plus search/filter state. */
export function useExerciseLibrary(excludeIds?: readonly string[]): ExerciseLibraryState {
  const { data, updatedAt } = useLiveQuery(exercisesQuery());
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const excludeKey = excludeIds?.join(',') ?? '';

  const all = useMemo(() => {
    const ex = new Set(excludeKey ? excludeKey.split(',') : []);
    return ex.size ? data.filter((e) => !ex.has(e.id)) : data;
  }, [data, excludeKey]);
  const results = useMemo(() => filterExercises(all, { query, muscle, equipment }), [all, query, muscle, equipment]);

  return { all, results, query, setQuery, muscle, setMuscle, equipment, setEquipment, loaded: updatedAt != null };
}
