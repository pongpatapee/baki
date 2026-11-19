import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { PlateVisual, plateColor } from '@/components/stats/PlateVisual';
import { Button, Card, Chip, Divider, Row, Screen, SectionHeader, Text, TextField } from '@/components/ui';
import { calculatePlates, resolvePlateSetup } from '@/domain/plates';
import { parseDecimal, trimNumber } from '@/domain/units';
import { useSettings, useTheme } from '@/theme/AppProviders';

export default function PlateCalculatorScreen() {
  const t = useTheme();
  const s = useSettings();
  const unit = s.weightUnit;
  const setup = useMemo(() => resolvePlateSetup(s.barWeightKg, s.availablePlatesKg, unit), [s.barWeightKg, s.availablePlatesKg, unit]);
  const [input, setInput] = useState('');
  const [barInput, setBarInput] = useState<string | null>(null);

  const bar = barInput != null ? (parseDecimal(barInput) ?? setup.bar) : setup.bar;
  const target = parseDecimal(input);
  const result = useMemo(() => (target != null ? calculatePlates(target, bar, setup.plates) : null), [target, bar, setup.plates]);
  const step = unit === 'kg' ? 2.5 : 5;
  const bump = (d: number) => {
    const base = target ?? bar;
    setInput(trimNumber(Math.max(0, base + d), 2));
  };

  return (
    <Screen scroll edges={['bottom']}>
      <Stack.Screen options={{ title: 'Plate Calculator' }} />
      <Card style={{ gap: t.spacing(3) }}>
        <TextField
          label={`Target weight (${unit})`}
          value={input}
          onChangeText={setInput}
          keyboardType="decimal-pad"
          placeholder={unit === 'kg' ? '100' : '225'}
          style={{ fontSize: 28, fontWeight: '700', textAlign: 'center' }}
          autoFocus
        />
        <Row gap={2} justify="center">
          {[-2, -1, 1, 2].map((m) => (
            <Chip key={m} label={`${m > 0 ? '+' : '−'}${trimNumber(Math.abs(m * step), 2)}`} onPress={() => bump(m * step)} />
          ))}
        </Row>
        <TextField
          label={`Bar weight (${unit})`}
          value={barInput ?? trimNumber(setup.bar, 2)}
          onChangeText={setBarInput}
          keyboardType="decimal-pad"
        />
      </Card>

      {result ? (
        <>
          <SectionHeader title="Load per side" />
          <Card style={{ gap: t.spacing(3) }}>
            {result.belowBar ? (
              <Text muted>
                The target is lighter than the bar ({trimNumber(bar, 2)} {unit}).
              </Text>
            ) : (
              <>
                <PlateVisual plates={result.perSideList} available={setup.plates} />
                {result.perSide.length === 0 ? (
                  <Text muted>Just the empty bar.</Text>
                ) : (
                  <View>
                    {result.perSide.map((p, i) => (
                      <View key={p.plate}>
                        {i > 0 ? <Divider /> : null}
                        <Row justify="space-between" style={{ paddingVertical: t.spacing(2) }}>
                          <Row gap={2}>
                            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: plateColor(t, p.plate, setup.plates) }} />
                            <Text weight="600">
                              {trimNumber(p.plate, 2)} {unit}
                            </Text>
                          </Row>
                          <Text muted>× {p.count}</Text>
                        </Row>
                      </View>
                    ))}
                  </View>
                )}
                <Divider />
                <Row justify="space-between">
                  <Text muted>Total loaded</Text>
                  <Text weight="700">
                    {trimNumber(result.achieved, 2)} {unit}
                  </Text>
                </Row>
                {result.remainder > 1e-9 ? (
                  <Text variant="label" color={t.colors.warning}>
                    {trimNumber(result.remainder, 2)} {unit} short of the target. That&apos;s the closest your plates allow.
                  </Text>
                ) : null}
              </>
            )}
          </Card>
        </>
      ) : null}

      <SectionHeader title="Available plates" />
      <Card style={{ gap: t.spacing(3) }}>
        <Row wrap gap={2}>
          {setup.plates.map((p) => (
            <Chip key={p} label={`${trimNumber(p, 2)} ${unit}`} color={plateColor(t, p, setup.plates)} selected />
          ))}
        </Row>
        <Text variant="caption" faint>
          Plates are assumed to come in pairs. {setup.isDefault ? 'Using the standard set for your unit.' : ''}
        </Text>
        <Button title="Edit bar & plates" variant="secondary" icon="settings-outline" onPress={() => router.push('/settings')} />
      </Card>
    </Screen>
  );
}
