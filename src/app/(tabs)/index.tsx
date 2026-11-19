import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { afterSheet, useActionSheet, type SheetOption } from '@/components/routines/ActionSheet';
import { usePrompt } from '@/components/routines/PromptModal';
import { RoutineCard } from '@/components/routines/RoutineCard';
import { startRoutineSafely, startWorkoutSafely } from '@/components/routines/startRoutine';
import { Button, Card, EmptyState, IconButton, Row, Screen, SectionHeader, Text } from '@/components/ui';
import {
  createFolder,
  deleteFolder,
  deleteRoutine,
  duplicateRoutine,
  foldersQuery,
  moveRoutineToFolder,
  renameFolder,
  reorderFolders,
  reorderRoutines,
  routineExercisePreviewQuery,
  routinesQuery,
} from '@/db/repositories/routines';
import type { RoutineFolderRow, RoutineRow } from '@/db/schema';
import { moveItem } from '@/domain/routineEdit';
import { useTheme } from '@/theme/AppProviders';

const UNFILED = '__unfiled__';

export default function WorkoutTab() {
  const t = useTheme();
  const sheet = useActionSheet();
  const prompt = usePrompt();
  const { data: folders } = useLiveQuery(foldersQuery());
  const { data: routines, updatedAt: routinesLoaded } = useLiveQuery(routinesQuery());
  const { data: previewRows } = useLiveQuery(routineExercisePreviewQuery());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const previews = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of previewRows) {
      const list = map.get(r.routineId) ?? [];
      list.push(r.name);
      map.set(r.routineId, list);
    }
    return map;
  }, [previewRows]);

  const byFolder = useMemo(() => {
    const live = new Set(folders.map((f) => f.id));
    const map = new Map<string, RoutineRow[]>();
    for (const r of routines) {
      const key = r.folderId && live.has(r.folderId) ? r.folderId : UNFILED;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return map;
  }, [folders, routines]);

  const toggle = (key: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const newRoutine = (folderId?: string) =>
    router.push({ pathname: '/routine/edit', params: folderId ? { folderId } : {} });

  const newFolder = () =>
    prompt.show({
      title: 'New Folder',
      placeholder: 'Folder name',
      confirmLabel: 'Create',
      onSubmit: (name) => void createFolder(name),
    });

  const openRoutine = useCallback((id: string) => router.push(`/routine/${id}`), []);
  const startRoutine = useCallback((id: string) => void startRoutineSafely(id), []);

  const chooseFolder = useCallback(
    (routine: RoutineRow) => {
      const options: SheetOption[] = [
        ...folders.map((f) => ({
          label: f.name,
          icon: 'folder-outline' as const,
          selected: routine.folderId === f.id,
          onPress: () => void moveRoutineToFolder(routine.id, f.id),
        })),
        {
          label: 'No Folder',
          icon: 'file-tray-outline',
          selected: routine.folderId == null,
          onPress: () => void moveRoutineToFolder(routine.id, null),
        },
        {
          label: 'New Folder…',
          icon: 'add',
          onPress: () =>
            afterSheet(() =>
              prompt.show({
                title: 'New Folder',
              placeholder: 'Folder name',
              confirmLabel: 'Create',
                onSubmit: (name) =>
                  void createFolder(name).then((folderId) => moveRoutineToFolder(routine.id, folderId)),
              }),
            ),
        },
      ];
      afterSheet(() => sheet.show({ title: `Move "${routine.name}" to`, options }));
    },
    [folders, prompt, sheet],
  );

  const routineMenu = useCallback(
    (routine: RoutineRow) => {
      const siblings = byFolder.get(routine.folderId && folders.some((f) => f.id === routine.folderId) ? routine.folderId : UNFILED) ?? [];
      const idx = siblings.findIndex((r) => r.id === routine.id);
      const reorder = (delta: -1 | 1) =>
        void reorderRoutines(moveItem(siblings, idx, idx + delta).map((r) => r.id));
      sheet.show({
        title: routine.name,
        options: [
          {
            label: 'Edit Routine',
            icon: 'create-outline',
            onPress: () => router.push({ pathname: '/routine/edit', params: { id: routine.id } }),
          },
          { label: 'Duplicate', icon: 'copy-outline', onPress: () => void duplicateRoutine(routine.id) },
          { label: 'Move to Folder…', icon: 'folder-open-outline', onPress: () => chooseFolder(routine) },
          ...(idx > 0 ? [{ label: 'Move Up', icon: 'arrow-up' as const, onPress: () => reorder(-1) }] : []),
          ...(idx >= 0 && idx < siblings.length - 1
            ? [{ label: 'Move Down', icon: 'arrow-down' as const, onPress: () => reorder(1) }]
            : []),
          {
            label: 'Delete Routine',
            icon: 'trash-outline',
            destructive: true,
            onPress: () =>
              Alert.alert(`Delete "${routine.name}"?`, 'Workouts you logged from this routine are kept.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => void deleteRoutine(routine.id) },
              ]),
          },
        ],
      });
    },
    [byFolder, folders, sheet, chooseFolder],
  );

  const folderMenu = (folder: RoutineFolderRow, index: number) => {
    const reorder = (delta: -1 | 1) => void reorderFolders(moveItem(folders, index, index + delta).map((f) => f.id));
    const count = byFolder.get(folder.id)?.length ?? 0;
    sheet.show({
      title: folder.name,
      options: [
        { label: 'Add Routine', icon: 'add', onPress: () => newRoutine(folder.id) },
        {
          label: 'Rename Folder',
          icon: 'pencil',
          onPress: () =>
            afterSheet(() =>
              prompt.show({
                title: 'Rename Folder',
                initialValue: folder.name,
                placeholder: 'Folder name',
                onSubmit: (name) => void renameFolder(folder.id, name),
              }),
            ),
        },
        ...(index > 0 ? [{ label: 'Move Up', icon: 'arrow-up' as const, onPress: () => reorder(-1) }] : []),
        ...(index < folders.length - 1 ? [{ label: 'Move Down', icon: 'arrow-down' as const, onPress: () => reorder(1) }] : []),
        {
          label: 'Delete Folder',
          icon: 'trash-outline',
          destructive: true,
          onPress: () =>
            Alert.alert(
              `Delete "${folder.name}"?`,
              count > 0
                ? `The ${count} ${count === 1 ? 'routine' : 'routines'} inside will be kept and moved out of the folder.`
                : undefined,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => void deleteFolder(folder.id) },
              ],
            ),
        },
      ],
    });
  };

  const renderRoutines = (list: RoutineRow[]) => (
    <View style={{ gap: t.spacing(3) }}>
      {list.map((r) => (
        <RoutineCard
          key={r.id}
          routine={r}
          exerciseNames={previews.get(r.id) ?? []}
          onOpen={openRoutine}
          onStart={startRoutine}
          onMenu={routineMenu}
        />
      ))}
    </View>
  );

  const unfiled = byFolder.get(UNFILED) ?? [];
  const hasAnything = routines.length > 0 || folders.length > 0;

  return (
    <Screen scroll>
      <SectionHeader title="Quick Start" />
      <Button title="Start Empty Workout" icon="add" size="lg" onPress={() => void startWorkoutSafely()} />

      <SectionHeader title="Routines" />
      <Row gap={3}>
        <Button
          title="New Routine"
          icon="clipboard-outline"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => newRoutine()}
        />
        <Button title="New Folder" icon="folder-outline" variant="secondary" style={{ flex: 1 }} onPress={newFolder} />
      </Row>

      {routinesLoaded != null && !hasAnything ? (
        <Card style={{ marginTop: t.spacing(4) }}>
          <EmptyState
            icon="clipboard-outline"
            title="No routines yet"
            message="Save your go-to workouts as routines and start them with one tap."
            action={<Button title="Create Your First Routine" icon="add" onPress={() => newRoutine()} />}
          />
        </Card>
      ) : null}

      {folders.map((f, i) => {
        const list = byFolder.get(f.id) ?? [];
        const open = !collapsed.has(f.id);
        return (
          <View key={f.id}>
            <FolderHeader
              name={f.name}
              count={list.length}
              open={open}
              onToggle={() => toggle(f.id)}
              onMenu={() => folderMenu(f, i)}
            />
            {open ? (
              list.length > 0 ? (
                renderRoutines(list)
              ) : (
                <Pressable onPress={() => newRoutine(f.id)} style={{ paddingVertical: t.spacing(3) }}>
                  <Text muted>
                    Empty folder. <Text color={t.colors.primary}>Add a routine</Text>
                  </Text>
                </Pressable>
              )
            ) : null}
          </View>
        );
      })}

      {unfiled.length > 0 ? (
        <View>
          <FolderHeader
            name={folders.length > 0 ? 'Other Routines' : 'My Routines'}
            count={unfiled.length}
            open={!collapsed.has(UNFILED)}
            onToggle={() => toggle(UNFILED)}
          />
          {!collapsed.has(UNFILED) ? renderRoutines(unfiled) : null}
        </View>
      ) : null}

      {sheet.element}
      {prompt.element}
    </Screen>
  );
}

function FolderHeader({
  name,
  count,
  open,
  onToggle,
  onMenu,
}: {
  name: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onMenu?: () => void;
}) {
  const t = useTheme();
  return (
    <Row style={{ marginTop: t.spacing(5), marginBottom: t.spacing(2) }}>
      <Pressable
        onPress={onToggle}
        onLongPress={onMenu}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}
      >
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={t.colors.textMuted} />
        <Text variant="label" muted numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.8, flexShrink: 1 }}>
          {name}
        </Text>
        <Text variant="label" faint>
          ({count})
        </Text>
      </Pressable>
      {onMenu ? (
        <IconButton icon="ellipsis-horizontal" size={18} color={t.colors.textMuted} accessibilityLabel={`Options for folder ${name}`} onPress={onMenu} />
      ) : null}
    </Row>
  );
}
