import { Ionicons } from '@expo/vector-icons';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { Card, Divider, ListItem } from '@/components/ui';
import { useTheme } from '@/theme/AppProviders';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Expo Go (store client) reports its own update state, and dev builds load JS from Metro, so the
// EAS Update details only mean something in a release build.
const updatesActive =
  Updates.isEnabled && !__DEV__ && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

const formatDate = (d: Date) =>
  d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Over-the-air update status: which JS bundle is running (the one built into the app, or an
 * `npm run update` from EAS Update) plus a manual "check now" that downloads and applies right away.
 */
export function AppUpdateSection() {
  const t = useTheme();
  const { currentlyRunning, isChecking, isDownloading, isRestarting } = Updates.useUpdates();
  const [status, setStatus] = useState<string | null>(null);

  if (!updatesActive) {
    return (
      <Card style={{ paddingVertical: t.spacing(1) }}>
        <ListItem
          title="Over-the-air updates"
          subtitle="Off in development (Expo Go / dev client)"
          left={<Ionicons name="cloud-offline-outline" size={22} color={t.colors.textMuted} />}
        />
      </Card>
    );
  }

  const busy = isChecking || isDownloading || isRestarting;

  const checkNow = async () => {
    setStatus(null);
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        setStatus('You are on the latest update');
        return;
      }
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew || fetched.isRollBackToEmbedded) {
        await Updates.reloadAsync();
      } else {
        setStatus('You are on the latest update');
      }
    } catch (e) {
      setStatus(`Update check failed: ${errorMessage(e)}`);
    }
  };

  const running = currentlyRunning.isEmbeddedLaunch
    ? 'Built-in (no update applied yet)'
    : `Update ${currentlyRunning.updateId?.slice(0, 8) ?? '?'}${
        currentlyRunning.createdAt ? ` · ${formatDate(currentlyRunning.createdAt)}` : ''
      }`;

  const checkSubtitle = isRestarting
    ? 'Restarting…'
    : isDownloading
      ? 'Downloading update…'
      : isChecking
        ? 'Checking…'
        : (status ?? 'Download and apply the newest update now');

  return (
    <Card style={{ paddingVertical: t.spacing(1) }}>
      <ListItem
        title="Running"
        subtitle={running}
        left={<Ionicons name="code-download-outline" size={22} color={t.colors.primary} />}
      />
      <Divider />
      <ListItem
        title="Channel"
        subtitle={`${currentlyRunning.channel || 'none'} · runtime ${currentlyRunning.runtimeVersion?.slice(0, 8) ?? '?'}`}
        left={<Ionicons name="git-branch-outline" size={22} color={t.colors.text} />}
      />
      <Divider />
      <ListItem
        title="Check for updates"
        subtitle={checkSubtitle}
        left={<Ionicons name="refresh" size={22} color={t.colors.text} />}
        right={busy ? <ActivityIndicator color={t.colors.primary} /> : undefined}
        onPress={busy ? undefined : checkNow}
      />
    </Card>
  );
}
