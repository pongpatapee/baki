import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Chip, SearchField } from '@/components/ui';
import { EQUIPMENT, EQUIPMENT_LABELS, MUSCLE_GROUPS, MUSCLE_GROUP_LABELS } from '@/domain/types';
import { useTheme } from '@/theme/AppProviders';

import type { ExerciseLibraryState } from './useExerciseLibrary';

/** Search field plus horizontally scrolling muscle and equipment chip rows. */
export function ExerciseFilterBar({ lib, autoFocus }: { lib: ExerciseLibraryState; autoFocus?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing(2), paddingBottom: t.spacing(2) }}>
      <View style={{ paddingHorizontal: t.spacing(4) }}>
        <SearchField
          value={lib.query}
          onChangeText={lib.setQuery}
          placeholder="Search exercises"
          autoFocus={autoFocus}
          returnKeyType="search"
          autoCapitalize="none"
        />
      </View>
      <ChipRow>
        <Chip label="All Muscles" selected={lib.muscle == null} onPress={() => lib.setMuscle(null)} />
        {MUSCLE_GROUPS.map((m) => (
          <Chip
            key={m}
            label={MUSCLE_GROUP_LABELS[m]}
            selected={lib.muscle === m}
            onPress={() => lib.setMuscle(lib.muscle === m ? null : m)}
          />
        ))}
      </ChipRow>
      <ChipRow>
        <Chip label="All Equipment" selected={lib.equipment == null} onPress={() => lib.setEquipment(null)} />
        {EQUIPMENT.map((e) => (
          <Chip
            key={e}
            label={EQUIPMENT_LABELS[e]}
            selected={lib.equipment === e}
            onPress={() => lib.setEquipment(lib.equipment === e ? null : e)}
          />
        ))}
      </ChipRow>
    </View>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: t.spacing(2), paddingHorizontal: t.spacing(4) }}
    >
      {children}
    </ScrollView>
  );
}
