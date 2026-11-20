import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { openURL } from 'expo-linking';
import type { ReactNode } from 'react';
import { ScrollView, Switch, View } from 'react-native';

import { AppUpdateSection } from '@/components/settings/AppUpdateSection';
import { DataSection } from '@/components/settings/DataSection';
import { PlateSettings } from '@/components/settings/PlateSettings';
import { Card, Chip, Divider, ListItem, Row, Screen, SectionHeader, Segmented, Text } from '@/components/ui';
import { setSetting, type ThemePreference } from '@/db/repositories/settings';
import type { DistanceUnit, WeightUnit } from '@/domain/types';
import { formatDuration } from '@/domain/units';
import { useSettings, useTheme } from '@/theme/AppProviders';

const REPO_URL = 'https://github.com/pongpatapee/baki';
const REST_OPTIONS = [0, 30, 60, 90, 120, 150, 180, 240, 300];

export default function SettingsTab() {
  const t = useTheme();
  const s = useSettings();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen scroll>
      <SectionHeader title="Units" />
      <Card style={{ gap: t.spacing(4) }}>
        <SettingRow label="Weight">
          <View style={{ width: 140 }}>
            <Segmented<WeightUnit>
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'lb', label: 'lb' },
              ]}
              value={s.weightUnit}
              onChange={(v) => setSetting('weightUnit', v)}
            />
          </View>
        </SettingRow>
        <SettingRow label="Distance">
          <View style={{ width: 140 }}>
            <Segmented<DistanceUnit>
              options={[
                { value: 'km', label: 'km' },
                { value: 'mi', label: 'mi' },
              ]}
              value={s.distanceUnit}
              onChange={(v) => setSetting('distanceUnit', v)}
            />
          </View>
        </SettingRow>
      </Card>

      <SectionHeader title="Workout" />
      <Card style={{ gap: t.spacing(3) }}>
        <Text weight="500">Default rest timer</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing(2) }}>
          {REST_OPTIONS.map((sec) => (
            <Chip
              key={sec}
              label={sec === 0 ? 'Off' : formatDuration(sec)}
              selected={s.defaultRestSeconds === sec}
              onPress={() => setSetting('defaultRestSeconds', sec)}
            />
          ))}
        </ScrollView>
        <Divider />
        <SettingRow label="Keep screen awake" caption="During an active workout">
          <Switch
            value={s.keepAwake}
            onValueChange={(v) => setSetting('keepAwake', v)}
            trackColor={{ true: t.colors.primary, false: t.colors.surfaceAlt }}
            thumbColor={t.colors.onPrimary}
            ios_backgroundColor={t.colors.surfaceAlt}
          />
        </SettingRow>
      </Card>

      <SectionHeader title="Appearance" />
      <Card>
        <Segmented<ThemePreference>
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={s.theme}
          onChange={(v) => setSetting('theme', v)}
        />
      </Card>

      <SectionHeader title="Plate calculator" />
      <Card style={{ paddingVertical: 0 }}>
        <PlateSettings />
      </Card>

      <SectionHeader title="Data" />
      <DataSection />

      <SectionHeader title="App updates" />
      <AppUpdateSection />

      <SectionHeader title="About" />
      <Card style={{ paddingVertical: t.spacing(1) }}>
        <ListItem
          title="Baki"
          subtitle={`Version ${version}`}
          left={<Ionicons name="barbell" size={22} color={t.colors.primary} />}
        />
        <Divider />
        <ListItem
          title="Source code"
          subtitle="github.com/pongpatapee/baki"
          left={<Ionicons name="logo-github" size={22} color={t.colors.text} />}
          right={<Ionicons name="open-outline" size={18} color={t.colors.textFaint} />}
          onPress={() => openURL(REPO_URL)}
        />
      </Card>
      <Text variant="caption" faint align="center" style={{ marginTop: t.spacing(4) }}>
        Your data stays on this device. Export a backup regularly.
      </Text>
    </Screen>
  );
}

function SettingRow({ label, caption, children }: { label: string; caption?: string; children: ReactNode }) {
  return (
    <Row justify="space-between">
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="500">{label}</Text>
        {caption ? (
          <Text variant="caption" muted>
            {caption}
          </Text>
        ) : null}
      </View>
      {children}
    </Row>
  );
}
