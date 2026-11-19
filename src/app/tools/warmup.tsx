import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Card, Divider, Row, Screen, SectionHeader, Segmented, Text, TextField } from '@/components/ui';
import { calculatePlates, loadIncrement, resolvePlateSetup } from '@/domain/plates';
import { parseDecimal, trimNumber } from '@/domain/units';
import { generateWarmups } from '@/domain/warmup';
import { useSettings, useTheme } from '@/theme/AppProviders';

type Mode = 'barbell' | 'other';

export default function WarmupCalculatorScreen() {
  const t = useTheme();
  const s = useSettings();
  const unit = s.weightUnit;
  const setup = useMemo(() => resolvePlateSetup(s.barWeightKg, s.availablePlatesKg, unit), [s.barWeightKg, s.availablePlatesKg, unit]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('barbell');

  const working = parseDecimal(input);
  const bar = mode === 'barbell' ? setup.bar : 0;
  const increment = mode === 'barbell' ? loadIncrement(setup.plates) || (unit === 'kg' ? 2.5 : 5) : unit === 'kg' ? 2 : 5;
  const sets = useMemo(
    () => (working != null && working > 0 ? generateWarmups(working, bar, increment) : []),
    [working, bar, increment],
  );

  return (
    <Screen scroll edges={['bottom']}>
      <Stack.Screen options={{ title: 'Warm-up Calculator' }} />
      <Card style={{ gap: t.spacing(3) }}>
        <TextField
          label={`Working weight (${unit})`}
          value={input}
          onChangeText={setInput}
          keyboardType="decimal-pad"
          placeholder={unit === 'kg' ? '100' : '225'}
          style={{ fontSize: 28, fontWeight: '700', textAlign: 'center' }}
          autoFocus
        />
        <Segmented
          options={[
            { value: 'barbell', label: `Barbell (${trimNumber(setup.bar, 2)} ${unit})` },
            { value: 'other', label: 'Dumbbell / machine' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </Card>

      <SectionHeader title="Warm-up sets" />
      <Card style={{ paddingVertical: t.spacing(1) }}>
        {working == null || working <= 0 ? (
          <Text muted style={{ paddingVertical: t.spacing(3) }}>
            Enter your working weight to get a warm-up ramp.
          </Text>
        ) : sets.length === 0 ? (
          <Text muted style={{ paddingVertical: t.spacing(3) }}>
            No warm-up needed for this weight.
          </Text>
        ) : (
          sets.map((w, i) => {
            const plates = mode === 'barbell' ? calculatePlates(w.weight, bar, setup.plates) : null;
            return (
              <View key={w.weight}>
                {i > 0 ? <Divider /> : null}
                <Row justify="space-between" style={{ paddingVertical: t.spacing(3) }} align="flex-start">
                  <View style={{ gap: 2, flex: 1 }}>
                    <Text weight="700">
                      {trimNumber(w.weight, 2)} {unit} × {w.reps}
                    </Text>
                    <Text variant="caption" muted>
                      {w.isBar
                        ? 'Empty bar'
                        : plates && plates.perSideList.length > 0
                          ? `Per side: ${plates.perSideList.map((p) => trimNumber(p, 2)).join(' + ')}`
                          : `${Math.round(w.percent * 100)}% of working weight`}
                    </Text>
                  </View>
                  <Text variant="label" faint>
                    {Math.round(w.percent * 100)}%
                  </Text>
                </Row>
              </View>
            );
          })
        )}
        {working != null && working > 0 ? (
          <>
            <Divider />
            <Row justify="space-between" style={{ paddingVertical: t.spacing(3) }}>
              <Text weight="700" color={t.colors.primary}>
                Working sets
              </Text>
              <Text weight="700" color={t.colors.primary}>
                {trimNumber(working, 2)} {unit}
              </Text>
            </Row>
          </>
        ) : null}
      </Card>
      <Text variant="caption" faint style={{ marginTop: t.spacing(3) }}>
        Ramp: empty bar × 10, 40% × 5, 60% × 3, 80% × 2 — rounded to {trimNumber(increment, 2)} {unit} steps.
      </Text>
    </Screen>
  );
}
