import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { MappingRow } from '@/components/import/MappingRow';
import { ProgressBar } from '@/components/settings/ProgressOverlay';
import { longDate } from '@/components/stats/format';
import { Button, Card, Divider, EmptyState, Row, Screen, SectionHeader, Stat, Text } from '@/components/ui';
import {
  existingImportKeys,
  importHevy,
  type HevyImportResult,
  type HevyMapping,
  type HevyMappingTarget,
} from '@/db/repositories/importExport';
import { libraryExercisesQuery } from '@/db/repositories/stats';
import { ExerciseMatcher, type MatchSuggestion } from '@/import/exerciseMatch';
import {
  HevyFormatError,
  inferEquipment,
  inferExerciseType,
  parseHevyCsv,
  setsByExerciseTitle,
  type HevyParseResult,
} from '@/import/hevyCsv';
import { pickExercises } from '@/stores/exercisePicker';
import { useTheme } from '@/theme/AppProviders';

type Step =
  | { kind: 'pick' }
  | { kind: 'summary' }
  | { kind: 'mapping' }
  | { kind: 'importing'; fraction: number; label: string }
  | { kind: 'done'; result: HevyImportResult }
  | { kind: 'error'; message: string };

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function HevyImportScreen() {
  const t = useTheme();
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<HevyParseResult | null>(null);
  const [alreadyImported, setAlreadyImported] = useState(0);
  const [overrides, setOverrides] = useState<HevyMapping>({});
  const [showWarnings, setShowWarnings] = useState(false);

  const { data: library } = useLiveQuery(libraryExercisesQuery());
  const matcher = useMemo(() => new ExerciseMatcher(library ?? []), [library]);
  const names = useMemo(() => new Map((library ?? []).map((e) => [e.id, e.name])), [library]);
  const setsByTitle = useMemo(() => (parsed ? setsByExerciseTitle(parsed) : new Map()), [parsed]);
  const suggestions = useMemo(() => {
    const out = new Map<string, MatchSuggestion[]>();
    if (!parsed) return out;
    for (const title of parsed.exerciseTitles) out.set(title, matcher.suggest(title, 4));
    return out;
  }, [parsed, matcher]);

  // Automatic mapping (exact name match, else a new custom exercise); user choices override it.
  const auto = useMemo(() => {
    const m: HevyMapping = {};
    const exact = new Set<string>();
    if (!parsed) return { mapping: m, exact };
    for (const title of parsed.exerciseTitles) {
      const hit = matcher.exact(title);
      if (hit) {
        m[title] = { kind: 'existing', exerciseId: hit.id };
        exact.add(title);
      } else {
        m[title] = createTarget(title, setsByTitle.get(title) ?? []);
      }
    }
    return { mapping: m, exact };
  }, [parsed, matcher, setsByTitle]);
  const mapping = useMemo(() => ({ ...auto.mapping, ...overrides }), [auto.mapping, overrides]);
  const exactTitles = auto.exact;

  const pickFile = async () => {
    let res;
    try {
      res = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    } catch (e) {
      Alert.alert('Could not open the file', errorMessage(e));
      return;
    }
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setParsing(true);
    try {
      const text = await new File(asset.uri).text();
      await new Promise((r) => setTimeout(r, 0)); // let the spinner render before parsing
      const result = parseHevyCsv(text);
      if (result.workouts.length === 0) throw new HevyFormatError('No workouts found in this file.');
      const known = await existingImportKeys();
      setAlreadyImported(result.workouts.filter((w) => known.has(w.importKey)).length);
      setFileName(asset.name);
      setOverrides({});
      setParsed(result);
      setStep({ kind: 'summary' });
    } catch (e) {
      Alert.alert(e instanceof HevyFormatError ? 'Not a Hevy export' : 'Could not read the file', errorMessage(e));
    } finally {
      setParsing(false);
    }
  };

  const setTarget = (title: string, target: HevyMappingTarget) => setOverrides((m) => ({ ...m, [title]: target }));

  const [editing, setEditing] = useState<string | null>(null);

  const mappingOptions = (title: string) => {
    const cur = mapping[title];
    const sug = (suggestions.get(title) ?? []).filter((x) => !(cur?.kind === 'existing' && cur.exerciseId === x.id));
    const choose = (target: HevyMappingTarget) => {
      setTarget(title, target);
      setEditing(null);
    };
    return (
      <View style={{ gap: t.spacing(2), paddingBottom: t.spacing(3) }}>
        <Button
          title="Choose from library…"
          icon="search"
          variant="secondary"
          size="sm"
          onPress={() =>
            pickExercises({ multiple: false, title: `Map "${title}"` }, (ids) => {
              if (ids[0]) choose({ kind: 'existing', exerciseId: ids[0] });
            })
          }
        />
        {sug.slice(0, 3).map((x) => (
          <Button
            key={x.id}
            title={x.name}
            icon="swap-horizontal"
            variant="secondary"
            size="sm"
            onPress={() => choose({ kind: 'existing', exerciseId: x.id })}
          />
        ))}
        {cur?.kind !== 'create' ? (
          <Button
            title="Create as custom exercise"
            icon="add"
            variant="secondary"
            size="sm"
            onPress={() => choose(createTarget(title, setsByTitle.get(title) ?? []))}
          />
        ) : null}
        {cur?.kind !== 'skip' ? (
          <Button title="Don't import this exercise" variant="danger" size="sm" onPress={() => choose({ kind: 'skip' })} />
        ) : null}
      </View>
    );
  };

  const runImport = async () => {
    if (!parsed) return;
    setStep({ kind: 'importing', fraction: 0, label: 'Starting…' });
    try {
      const result = await importHevy(parsed, mapping, (fraction, label) => setStep({ kind: 'importing', fraction, label }));
      setStep({ kind: 'done', result });
    } catch (e) {
      setStep({ kind: 'error', message: errorMessage(e) });
    }
  };

  const title = 'Import from Hevy';
  const busy = step.kind === 'importing';

  return (
    <Screen scroll edges={['bottom']}>
      <Stack.Screen options={{ title, gestureEnabled: !busy, headerBackVisible: !busy }} />

      {step.kind === 'pick' ? (
        <View style={{ gap: t.spacing(4) }}>
          <EmptyState
            icon="cloud-download-outline"
            title="Bring your Hevy history"
            message="In Hevy, open Profile → Settings → Export & Import Data → Export Workouts, then save the CSV file to your device."
          />
          <Card style={{ gap: t.spacing(2) }}>
            <Bullet text="Workouts, sets, notes, supersets and set types are imported." />
            <Bullet text="kg and lb exports both work; values are converted automatically." />
            <Bullet text="Re-importing the same file never creates duplicates." />
          </Card>
          <Button title="Choose CSV file" icon="document-outline" size="lg" loading={parsing} onPress={pickFile} />
        </View>
      ) : null}

      {step.kind === 'summary' && parsed ? (
        <View style={{ gap: t.spacing(4) }}>
          <Card style={{ gap: t.spacing(4) }}>
            <Text variant="label" muted numberOfLines={1}>
              {fileName}
            </Text>
            <Row gap={3}>
              <Stat label="Workouts" value={parsed.workouts.length.toLocaleString('en-US')} />
              <Stat label="Sets" value={parsed.totalSets.toLocaleString('en-US')} />
              <Stat label="Exercises" value={String(parsed.exerciseTitles.length)} />
            </Row>
            <Text muted>
              {longDate(parsed.firstStartedAt!)} – {longDate(parsed.lastStartedAt!)}
              {parsed.weightUnit ? ` · weights in ${parsed.weightUnit}` : ''}
            </Text>
            {alreadyImported > 0 ? (
              <Text variant="label" color={t.colors.warning}>
                {alreadyImported === parsed.workouts.length
                  ? 'All of these workouts were already imported. Nothing new will be added.'
                  : `${alreadyImported} workout${alreadyImported === 1 ? ' was' : 's were'} already imported and will be skipped.`}
              </Text>
            ) : null}
          </Card>
          {parsed.warnings.length > 0 ? (
            <Card style={{ gap: t.spacing(2) }}>
              <Row justify="space-between">
                <Row gap={2}>
                  <Ionicons name="warning-outline" size={18} color={t.colors.warning} />
                  <Text weight="600">
                    {parsed.warnings.length} row{parsed.warnings.length === 1 ? '' : 's'} with problems
                  </Text>
                </Row>
                <Button title={showWarnings ? 'Hide' : 'Show'} variant="ghost" size="sm" onPress={() => setShowWarnings((v) => !v)} />
              </Row>
              {showWarnings
                ? parsed.warnings.slice(0, 50).map((w, i) => (
                    <Text key={i} variant="caption" muted>
                      Line {w.line}: {w.message}
                    </Text>
                  ))
                : null}
            </Card>
          ) : null}
          <Button title="Next: match exercises" size="lg" onPress={() => setStep({ kind: 'mapping' })} />
          <Button title="Choose a different file" variant="ghost" onPress={() => setStep({ kind: 'pick' })} />
        </View>
      ) : null}

      {step.kind === 'mapping' && parsed ? (
        <View>
          <MappingSummary mapping={mapping} />
          <SectionHeader title="Exercises" />
          <Card style={{ paddingVertical: t.spacing(1) }}>
            {parsed.exerciseTitles.map((ttl, i) => {
              const target = mapping[ttl];
              if (!target) return null;
              const sug = suggestions.get(ttl)?.[0];
              return (
                <View key={ttl}>
                  {i > 0 ? <Divider /> : null}
                  <MappingRow
                    title={ttl}
                    setCount={setsByTitle.get(ttl)?.length ?? 0}
                    target={target}
                    targetName={target.kind === 'existing' ? names.get(target.exerciseId) : undefined}
                    exact={exactTitles.has(ttl)}
                    suggestion={sug && sug.score >= 0.5 ? sug : undefined}
                    onPress={() => setEditing((cur) => (cur === ttl ? null : ttl))}
                    onAcceptSuggestion={() => sug && setTarget(ttl, { kind: 'existing', exerciseId: sug.id })}
                  />
                  {editing === ttl ? mappingOptions(ttl) : null}
                </View>
              );
            })}
          </Card>
          <View style={{ gap: t.spacing(2), marginTop: t.spacing(4) }}>
            <Button title="Import" icon="download-outline" size="lg" onPress={runImport} />
            <Button title="Back" variant="ghost" onPress={() => setStep({ kind: 'summary' })} />
          </View>
        </View>
      ) : null}

      {step.kind === 'importing' ? (
        <Card style={{ gap: t.spacing(3), marginTop: t.spacing(8) }}>
          <Text variant="heading">Importing…</Text>
          <Text muted>{step.label}</Text>
          <ProgressBar fraction={step.fraction} />
          <Text variant="caption" faint>
            Keep the app open. If anything fails, nothing is changed.
          </Text>
        </Card>
      ) : null}

      {step.kind === 'done' ? (
        <View style={{ gap: t.spacing(4) }}>
          <EmptyState icon="checkmark-circle-outline" title="Import complete" />
          <Card style={{ gap: t.spacing(4) }}>
            <Row gap={3}>
              <Stat label="Workouts added" value={String(step.result.workoutsImported)} />
              <Stat label="Sets added" value={step.result.setsImported.toLocaleString('en-US')} />
            </Row>
            <Row gap={3}>
              <Stat label="New exercises" value={String(step.result.exercisesCreated)} />
              <Stat label="Skipped workouts" value={String(step.result.workoutsSkipped)} />
            </Row>
            <Text variant="caption" faint>
              Skipped workouts were already imported (or had no mapped exercises). Personal records were rebuilt.
            </Text>
          </Card>
          <Button title="View history" size="lg" onPress={() => router.replace('/history')} />
          <Button title="Done" variant="ghost" onPress={() => router.back()} />
        </View>
      ) : null}

      {step.kind === 'error' ? (
        <View style={{ gap: t.spacing(4) }}>
          <EmptyState icon="alert-circle-outline" title="Import failed" message={`${step.message}\n\nNo data was changed.`} />
          <Button title="Back to mapping" onPress={() => setStep({ kind: 'mapping' })} />
        </View>
      ) : null}
    </Screen>
  );
}

function createTarget(title: string, sets: Parameters<typeof inferExerciseType>[0]): HevyMappingTarget {
  const exerciseType = inferExerciseType(sets);
  return { kind: 'create', name: title, exerciseType, equipment: inferEquipment(title, exerciseType), primaryMuscle: 'other' };
}

function MappingSummary({ mapping }: { mapping: HevyMapping }) {
  const t = useTheme();
  const values = Object.values(mapping);
  const matched = values.filter((v) => v.kind === 'existing').length;
  const created = values.filter((v) => v.kind === 'create').length;
  const skipped = values.filter((v) => v.kind === 'skip').length;
  return (
    <Card style={{ gap: t.spacing(2) }}>
      <Row gap={3}>
        <Stat label="Matched" value={String(matched)} />
        <Stat label="New custom" value={String(created)} />
        <Stat label="Skipped" value={String(skipped)} />
      </Row>
      <Text variant="caption" faint>
        Tap an exercise to change where its history goes. New custom exercises get their type from the data; you can
        edit their muscles later.
      </Text>
    </Card>
  );
}

function Bullet({ text }: { text: string }) {
  const t = useTheme();
  return (
    <Row gap={2} align="flex-start">
      <Ionicons name="checkmark" size={16} color={t.colors.success} style={{ marginTop: 2 }} />
      <Text muted style={{ flex: 1 }}>
        {text}
      </Text>
    </Row>
  );
}
