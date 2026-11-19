import { Ionicons } from '@expo/vector-icons';
import { getDocumentAsync } from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Card, Divider, ListItem, type IconName } from '@/components/ui';
import {
  exportBackup,
  exportSetsCsv,
  inspectBackupUri,
  restoreBackup,
  type ProgressFn,
} from '@/db/repositories/importExport';
import { recomputeAllPersonalRecords } from '@/db/repositories/personalRecords';
import { useTheme } from '@/theme/AppProviders';

import { ProgressOverlay } from './ProgressOverlay';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function DataSection() {
  const t = useTheme();
  const [busy, setBusy] = useState<{ label: string; fraction: number | null } | null>(null);

  const run = async (label: string, task: (progress: ProgressFn) => Promise<void>) => {
    setBusy({ label, fraction: null });
    try {
      await task((fraction, l) => setBusy({ label: l, fraction }));
    } catch (e) {
      Alert.alert('Something went wrong', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const doExportJson = () =>
    run('Preparing backup…', async () => {
      await exportBackup();
    });

  const doExportCsv = () =>
    run('Preparing CSV…', async () => {
      await exportSetsCsv();
    });

  const doRebuild = () =>
    run('Rebuilding personal records…', async () => {
      await recomputeAllPersonalRecords();
      Alert.alert('Done', 'Personal records were rebuilt from your workout history.');
    });

  const doRestore = async () => {
    let picked;
    try {
      picked = await getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
    } catch (e) {
      Alert.alert('Could not open the file', errorMessage(e));
      return;
    }
    if (picked.canceled || !picked.assets[0]) return;
    setBusy({ label: 'Checking backup…', fraction: null });
    let inspected: Awaited<ReturnType<typeof inspectBackupUri>>;
    try {
      inspected = await inspectBackupUri(picked.assets[0].uri);
    } catch (e) {
      setBusy(null);
      Alert.alert('Could not read the file', errorMessage(e));
      return;
    }
    setBusy(null);
    const v = inspected.validation;
    if (!v.ok) {
      Alert.alert('Not a valid backup', v.error);
      return;
    }
    const when = new Date(v.backup.exportedAt).toLocaleString();
    const summary = `Backup from ${when}\n${v.counts.workouts} workouts · ${v.counts.workout_sets} sets · ${v.counts.exercises} exercises · ${v.counts.routines} routines`;
    const restore = () =>
      run('Restoring…', async (progress) => {
        await restoreBackup(inspected.text, progress);
        Alert.alert('Restore complete', 'Your data was replaced with the backup.');
      });
    Alert.alert(
      'Replace all data?',
      `${summary}\n\nRestoring DELETES everything currently in Baki — workouts, routines, custom exercises and settings — and replaces it with this backup. An in-progress workout will be lost.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Are you absolutely sure?', 'This cannot be undone. Consider exporting a backup of your current data first.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Erase & restore', style: 'destructive', onPress: restore },
            ]),
        },
      ],
    );
  };

  const icon = (name: IconName, color = t.colors.primary) => (
    <Ionicons name={name} size={22} color={color} />
  );

  return (
    <View>
      <Card style={{ paddingVertical: t.spacing(1) }}>
        <ListItem
          title="Import from Hevy"
          subtitle="Bring in your workout history (CSV export)"
          left={icon('cloud-download-outline')}
          chevron
          onPress={() => router.push('/import/hevy')}
        />
        <Divider />
        <ListItem
          title="Export backup (JSON)"
          subtitle="Everything, for safekeeping or moving devices"
          left={icon('archive-outline')}
          chevron
          onPress={doExportJson}
        />
        <Divider />
        <ListItem
          title="Export sets (CSV)"
          subtitle="One row per completed set, for spreadsheets"
          left={icon('document-text-outline')}
          chevron
          onPress={doExportCsv}
        />
        <Divider />
        <ListItem
          title="Rebuild personal records"
          subtitle="Recalculate PRs from your full history"
          left={icon('trophy-outline')}
          chevron
          onPress={doRebuild}
        />
        <Divider />
        <ListItem
          title="Restore from backup"
          subtitle="Replaces all current data"
          left={icon('refresh-circle-outline', t.colors.danger)}
          chevron
          onPress={doRestore}
        />
      </Card>
      <ProgressOverlay visible={busy != null} label={busy?.label ?? ''} fraction={busy?.fraction ?? null} />
    </View>
  );
}
