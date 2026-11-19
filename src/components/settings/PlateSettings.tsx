import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Row, Text, TextField } from '@/components/ui';
import { setSetting } from '@/db/repositories/settings';
import { DEFAULT_KG_BAR, DEFAULT_KG_PLATES, plateSetupToKg, resolvePlateSetup } from '@/domain/plates';
import { parseDecimal, trimNumber } from '@/domain/units';
import { useSettings, useTheme } from '@/theme/AppProviders';

/** Edits the plate calculator's bar weight and plate list, in the user's unit. */
export function PlateSettings() {
  const t = useTheme();
  const s = useSettings();
  const unit = s.weightUnit;
  const setup = useMemo(() => resolvePlateSetup(s.barWeightKg, s.availablePlatesKg, unit), [s.barWeightKg, s.availablePlatesKg, unit]);
  const [barText, setBarText] = useState<string | null>(null);
  const [newPlate, setNewPlate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async (bar: number, plates: number[]) => {
    const kg = plateSetupToKg(bar, plates, unit);
    await setSetting('barWeightKg', kg.barWeightKg);
    await setSetting('availablePlatesKg', kg.availablePlatesKg);
  };

  const commitBar = async () => {
    if (barText == null) return;
    const v = parseDecimal(barText);
    setBarText(null);
    if (v == null || v < 0 || v > 1000) return;
    await save(v, setup.plates);
  };

  const addPlate = async () => {
    const v = parseDecimal(newPlate);
    if (v == null || v <= 0 || v > 100) {
      setError('Enter a plate weight between 0 and 100.');
      return;
    }
    setError(null);
    setNewPlate('');
    await save(setup.bar, [...setup.plates, v]);
  };

  const removePlate = async (p: number) => {
    await save(
      setup.bar,
      setup.plates.filter((x) => Math.abs(x - p) > 1e-9),
    );
  };

  const reset = async () => {
    setBarText(null);
    await setSetting('barWeightKg', DEFAULT_KG_BAR);
    await setSetting('availablePlatesKg', DEFAULT_KG_PLATES);
  };

  return (
    <View style={{ gap: t.spacing(3), paddingVertical: t.spacing(3) }}>
      <TextField
        label={`Bar weight (${unit})`}
        value={barText ?? trimNumber(setup.bar, 2)}
        onChangeText={setBarText}
        onEndEditing={commitBar}
        onSubmitEditing={commitBar}
        keyboardType="decimal-pad"
        returnKeyType="done"
      />
      <Text variant="label" muted>
        Plates (per pair, {unit})
      </Text>
      <Row wrap gap={2}>
        {setup.plates.map((p) => (
          <Pressable
            key={p}
            onPress={() => removePlate(p)}
            accessibilityLabel={`Remove ${trimNumber(p, 2)} ${unit} plate`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingVertical: 6,
              paddingLeft: 12,
              paddingRight: 8,
              borderRadius: t.radius.pill,
              backgroundColor: t.colors.surfaceAlt,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text variant="label">{trimNumber(p, 2)}</Text>
            <Ionicons name="close" size={14} color={t.colors.textFaint} />
          </Pressable>
        ))}
      </Row>
      <Row gap={2} align="flex-start">
        <TextField
          containerStyle={{ flex: 1 }}
          value={newPlate}
          onChangeText={setNewPlate}
          placeholder={`Add plate (${unit})`}
          keyboardType="decimal-pad"
          onSubmitEditing={addPlate}
          error={error}
        />
        <Button title="Add" variant="secondary" onPress={addPlate} />
      </Row>
      <Row justify="space-between">
        <Text variant="caption" faint style={{ flex: 1 }}>
          {setup.isDefault ? `Standard ${unit} set.` : 'Custom set.'} Tap a plate to remove it.
        </Text>
        {!setup.isDefault ? <Button title="Reset" variant="ghost" size="sm" onPress={reset} /> : null}
      </Row>
    </View>
  );
}
