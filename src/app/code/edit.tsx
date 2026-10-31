import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { ChevronLeft, Redo2, Search, Undo2, WrapText } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CodeEditor, { type CodeEditorRef } from '@/components/code-editor';
import { Button, EnvBadge, Mono, s } from '@/components/ui';
import { confirmBiometric } from '@/lib/auth';
import { basename, formatSize, join, MAX_EDIT_BYTES, read, resolveDir, stamp, write, type FileStamp, type LoadedFile } from '@/lib/files';
import { refresh as refreshCode } from '@/store/code';
import { refresh as refreshGit, useGit } from '@/store/git';
import { useSession } from '@/store/session';
import { C } from '@/theme';

const EDITOR_COLORS = { bg: C.bg, surface: C.surface, surface2: C.surface2, border: C.border, text: C.text, muted: C.muted, dim: C.dim, accent: C.accent };

/** Keys missing (or buried) on phone keyboards. `cmd:` entries run an editor command instead of typing. */
const KEYS: [string, string][] = [
  ['Tab', '\t'],
  ['⇤', 'cmd:dedent'],
  ['←', 'cmd:left'],
  ['↑', 'cmd:up'],
  ['↓', 'cmd:down'],
  ['→', 'cmd:right'],
  ['{', '{'],
  ['}', '}'],
  ['(', '('],
  [')', ')'],
  ['[', '['],
  [']', ']'],
  ['<', '<'],
  ['>', '>'],
  ['=', '='],
  [';', ';'],
  [':', ':'],
  ['"', '"'],
  ["'", "'"],
  ['`', '`'],
  ['/', '/'],
  ['\\', '\\'],
  ['|', '|'],
  ['&', '&'],
  ['$', '$'],
  ['_', '_'],
  ['-', '-'],
  ['#', '#'],
];

type Loaded = LoadedFile & { path: string; readOnly: string | null };

export default function EditFile() {
  const params = useLocalSearchParams<{ path: string; base?: string; line?: string }>();
  const session = useSession();
  const server = session?.server;
  const gitLoaded = !!useGit();
  const editor = useRef<CodeEditorRef>(null);
  const ready = useRef(false);
  const [file, setFile] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [cursor, setCursor] = useState<[number, number]>([1, 1]);
  const [decodeError, setDecodeError] = useState(false);
  const stampRef = useRef<FileStamp | null>(null);
  const prodOk = useRef(false);

  const name = basename(params.path ?? '');

  useEffect(() => {
    let live = true;
    (async () => {
      // `base` lets the Git screens pass a repo-relative path.
      const path = params.path.startsWith('/') ? params.path : join(await resolveDir(params.base ?? '~'), params.path);
      const f = await read(path);
      const readOnly = f.binary ? 'Fichier binaire' : f.stamp.size > MAX_EDIT_BYTES ? `Fichier volumineux (${formatSize(f.stamp.size)})` : null;
      return { ...f, path, readOnly };
    })().then(
      (f) => {
        if (!live) return;
        stampRef.current = f.stamp;
        setFile(f);
        if (ready.current && !f.binary) editor.current?.load(f.b64, name, !!f.readOnly, Number(params.line) || 1);
      },
      (e) => live && setError((e as Error).message),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.path, params.base]);

  usePreventRemove(dirty, ({ repeat }) => {
    Alert.alert('Modifications non enregistrées', `Quitter ${name} sans enregistrer ?`, [
      { text: 'Rester', style: 'cancel' },
      {
        text: 'Quitter sans enregistrer',
        style: 'destructive',
        onPress: () => {
          setDirty(false);
          repeat();
        },
      },
    ]);
  });

  async function doWrite(b64: string) {
    const file = latest.current.file;
    if (!file) return;
    setSaving(true);
    try {
      stampRef.current = await write(file.path, b64);
      editor.current?.markSaved();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshCode();
      if (gitLoaded) refreshGit();
    } catch (e) {
      Alert.alert('Enregistrement impossible', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // The editor calls back through the WebView bridge: read live values from a ref, not a stale render.
  const latest = useRef({ file, decodeError, saving, open: !!session?.open });
  useEffect(() => {
    latest.current = { file, decodeError, saving, open: !!session?.open };
  });

  async function onSave(b64: string) {
    const { file, decodeError, saving, open } = latest.current;
    if (!file || file.readOnly || decodeError || saving || !open) return;
    if (server?.env === 'prod' && !prodOk.current) {
      if (!(await confirmBiometric(`Modifier ${name} sur ${server.name}`))) return;
      prodOk.current = true;
    }
    // Someone (a deploy, git pull, another editor) changed the file since it was opened.
    let current: FileStamp | null = null;
    try {
      current = await stamp(file.path);
    } catch {
      // Deleted meanwhile: writing recreates it.
    }
    const known = stampRef.current;
    if (current && known && (current.mtime !== known.mtime || current.size !== known.size)) {
      Alert.alert('Fichier modifié sur le serveur', `${name} a changé depuis son ouverture. L’écraser avec ta version ?`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Écraser', style: 'destructive', onPress: () => doWrite(b64) },
      ]);
      return;
    }
    doWrite(b64);
  }

  function key(seq: string) {
    if (seq.startsWith('cmd:')) editor.current?.command(seq.slice(4));
    else editor.current?.insert(seq);
  }

  const editable = !!file && !file.readOnly && !decodeError && !!session?.open;
  const status = !session?.open ? 'Session fermée' : file?.readOnly ? `${file.readOnly} · lecture seule` : decodeError ? 'Encodage non UTF-8 · lecture seule' : null;

  return (
    // Not inside the tabs: the bottom edge keeps the key bar off the iPhone home indicator. The keyboard
    // avoider below still lines up with the keyboard, its frame being measured from this view's top.
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <View style={[s.row, { paddingHorizontal: 12, paddingVertical: 8, gap: 10 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={22} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={[s.row, { gap: 6 }]}>
            <Mono style={{ fontWeight: '700', fontSize: 15, flexShrink: 1 }} numberOfLines={1}>
              {name}
            </Mono>
            {dirty && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.orange }} />}
            {server && <EnvBadge env={server.env} />}
          </View>
          <Mono style={{ fontSize: 10, color: C.muted }} numberOfLines={1}>
            {file?.path ?? params.path}
          </Mono>
        </View>
        <IconBtn onPress={() => editor.current?.command('search')}>
          <Search size={16} color={C.text} />
        </IconBtn>
        <IconBtn
          active={wrap}
          onPress={() => {
            editor.current?.setWrap(!wrap);
            setWrap(!wrap);
          }}>
          <WrapText size={16} color={wrap ? '#fff' : C.text} />
        </IconBtn>
        <Pressable
          onPress={() => editor.current?.save()}
          disabled={!editable || !dirty || saving}
          style={{ backgroundColor: editable && dirty ? C.accent : C.surface2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, minWidth: 92, alignItems: 'center' }}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: editable && dirty ? '#fff' : C.dim, fontSize: 13, fontWeight: '600' }}>Enregistrer</Text>}
        </Pressable>
      </View>

      {status && (
        <View style={{ marginHorizontal: 12, marginBottom: 6, padding: 8, borderRadius: 8, backgroundColor: C.orangeBg }}>
          <Text style={{ color: C.orange, fontSize: 12 }}>{status}</Text>
        </View>
      )}

      {error ? (
        <View style={{ padding: 24, gap: 16 }}>
          <Mono style={{ color: C.red, fontSize: 13 }}>{error}</Mono>
          <Button title="Retour" variant="ghost" onPress={() => router.back()} />
        </View>
      ) : file?.binary ? (
        <View style={{ padding: 24 }}>
          <Text style={s.muted}>
            {name} est un fichier binaire ({formatSize(file.stamp.size)}) : il ne peut pas être affiché dans l’éditeur.
          </Text>
        </View>
      ) : (
        // Android is edge-to-edge: the window no longer resizes for the keyboard, so pad on both platforms
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <View style={{ flex: 1 }}>
            <CodeEditor
              ref={editor}
              colors={EDITOR_COLORS}
              dom={{ style: { flex: 1, backgroundColor: C.bg }, scrollEnabled: false, hideKeyboardAccessoryView: true }}
              onReady={async () => {
                ready.current = true;
                if (file && !file.binary) editor.current?.load(file.b64, name, !!file.readOnly, Number(params.line) || 1);
              }}
              onDirty={async (d) => setDirty(d)}
              onSave={onSave}
              onCursor={async (line, col) => setCursor([line, col])}
              onDecodeError={async () => setDecodeError(true)}
            />
            {!file && (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
                <ActivityIndicator color={C.muted} />
              </View>
            )}
          </View>

          <View style={[s.row, { justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 4, backgroundColor: C.surface, borderTopWidth: 1, borderColor: C.border }]}>
            <Mono style={{ fontSize: 10, color: C.muted }}>
              Ln {cursor[0]}, Col {cursor[1]}
            </Mono>
            <Mono style={{ fontSize: 10, color: C.muted }}>{file ? formatSize(file.stamp.size) : ''}</Mono>
          </View>
          {editable && (
            <View style={[s.row, { backgroundColor: C.surface }]}>
              <Pressable onPress={() => editor.current?.command('undo')} style={{ paddingHorizontal: 12, paddingVertical: 9 }}>
                <Undo2 size={16} color={C.text} />
              </Pressable>
              <Pressable onPress={() => editor.current?.command('redo')} style={{ paddingHorizontal: 8, paddingVertical: 9 }}>
                <Redo2 size={16} color={C.text} />
              </Pressable>
              <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, padding: 8, paddingLeft: 4 }}>
                {KEYS.map(([label, seq]) => (
                  <Pressable key={label} onPress={() => key(seq)} style={{ minWidth: 34, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 7, borderRadius: 6, backgroundColor: C.surface2 }}>
                    <Mono style={{ fontSize: 13 }}>{label}</Mono>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function IconBtn({ children, active, onPress }: { children: ReactNode; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} style={{ backgroundColor: active ? C.accent : C.surface2, borderRadius: 8, padding: 7 }}>
      {children}
    </Pressable>
  );
}
