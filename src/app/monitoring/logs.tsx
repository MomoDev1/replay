import { router } from 'expo-router';
import { FileText, Terminal } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { Button, Mono, s, Segmented, Sheet, SheetHeader } from '@/components/ui';
import { detectLogFiles, detectServices, type LogSource } from '@/lib/monitor';
import { asciiPunct } from '@/lib/text';
import { logSourceFor, setLogSource } from '@/store/monitor';
import { useSession } from '@/store/session';
import { C, mono } from '@/theme';

type Kind = LogSource['kind'];

const CMD_EXAMPLES = ['docker logs --tail 200 <conteneur>', 'pm2 logs --nostream --lines 200', 'docker compose logs --tail 200'];

function Suggestion({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.row, { gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.border }]}>
      <FileText size={14} color={on ? C.accent : C.muted} />
      <Mono style={{ fontSize: 12, flex: 1, color: on ? C.accent : C.text }} numberOfLines={1}>
        {label}
      </Mono>
    </Pressable>
  );
}

export default function LogSourceSheet() {
  const server = useSession()?.server;
  const current = server ? logSourceFor(server.id) : null;
  const [kind, setKind] = useState<Kind>(current?.kind ?? 'journal');
  const [path, setPath] = useState(current?.kind === 'file' ? current.path : '');
  const [unit, setUnit] = useState(current?.kind === 'journal' ? current.unit : '');
  const [cmd, setCmd] = useState(current?.kind === 'cmd' ? current.cmd : '');
  const [files, setFiles] = useState<string[] | null>(null);
  const [services, setServices] = useState<string[] | null>(null);

  useEffect(() => {
    if (kind === 'file' && !files) detectLogFiles(server?.path ?? '').then(setFiles, () => setFiles([]));
    if (kind === 'journal' && !services) detectServices().then(setServices, () => setServices([]));
  }, [kind, files, services, server?.path]);

  const value = asciiPunct(kind === 'file' ? path.trim() : kind === 'cmd' ? cmd.trim() : unit.trim());
  const valid = kind === 'journal' || !!value;

  function save(src: LogSource) {
    if (!server) return;
    setLogSource(server.id, src);
    router.back();
  }

  function submit() {
    if (!valid) return;
    save(kind === 'file' ? { kind, path: value } : kind === 'cmd' ? { kind, cmd: value } : { kind, unit: value });
  }

  const input = { flex: 1, color: C.text, paddingVertical: 9, fontFamily: mono, fontSize: 13 } as const;

  return (
    <Sheet>
      <SheetHeader title="Source des logs" subtitle={<Text style={s.muted}>{server?.name}</Text>} />
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'journal', label: 'Journal' },
          { value: 'file', label: 'Fichier' },
          { value: 'cmd', label: 'Commande' },
        ]}
      />

      {kind === 'journal' && (
        <>
          <Text style={[s.section, { marginTop: 16, marginBottom: 8 }]}>SERVICE SYSTEMD (OPTIONNEL)</Text>
          <View style={[s.row, { backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, gap: 8 }]}>
            <Terminal size={14} color={C.muted} />
            <TextInput value={unit} onChangeText={setUnit} autoCapitalize="none" autoCorrect={false} placeholder="tout le journal" placeholderTextColor={C.dim} style={input} onSubmitEditing={submit} />
          </View>
          <Text style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>Lit `journalctl` et ne récupère que les nouvelles entrées.</Text>
        </>
      )}

      {kind === 'file' && (
        <>
          <Text style={[s.section, { marginTop: 16, marginBottom: 8 }]}>CHEMIN DU FICHIER</Text>
          <View style={[s.row, { backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, gap: 8 }]}>
            <FileText size={14} color={C.muted} />
            <TextInput value={path} onChangeText={setPath} autoCapitalize="none" autoCorrect={false} placeholder="/var/log/nginx/error.log" placeholderTextColor={C.dim} style={input} onSubmitEditing={submit} />
          </View>
          <Text style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>Comme `tail -f` : seules les lignes ajoutées sont téléchargées.</Text>
        </>
      )}

      {kind === 'cmd' && (
        <>
          <Text style={[s.section, { marginTop: 16, marginBottom: 8 }]}>COMMANDE</Text>
          <View style={[s.row, { backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, gap: 8 }]}>
            <Terminal size={14} color={C.muted} />
            <TextInput value={cmd} onChangeText={setCmd} autoCapitalize="none" autoCorrect={false} placeholder="docker logs --tail 200 api" placeholderTextColor={C.dim} style={input} onSubmitEditing={submit} />
          </View>
          <Text style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>Relancée toutes les quelques secondes ; les 200 dernières lignes sont affichées.</Text>
        </>
      )}

      <Button title="Suivre ces logs" style={{ marginTop: 12, opacity: valid ? 1 : 0.5 }} onPress={submit} />

      <View style={{ marginTop: 16 }}>
        {kind === 'journal' && (
          <>
            <Text style={[s.section, { marginBottom: 4 }]}>SERVICES ACTIFS</Text>
            {!services && <ActivityIndicator style={{ marginTop: 12 }} color={C.muted} />}
            {services?.length === 0 && <Text style={[s.muted, { marginTop: 8 }]}>Aucun service systemd détecté.</Text>}
            <Suggestion label="Tout le journal" on={current?.kind === 'journal' && !current.unit} onPress={() => save({ kind: 'journal', unit: '' })} />
            {services?.map((u) => <Suggestion key={u} label={u} on={current?.kind === 'journal' && current.unit === u} onPress={() => save({ kind: 'journal', unit: u })} />)}
          </>
        )}
        {kind === 'file' && (
          <>
            <Text style={[s.section, { marginBottom: 4 }]}>FICHIERS TROUVÉS</Text>
            {!files && <ActivityIndicator style={{ marginTop: 12 }} color={C.muted} />}
            {files?.length === 0 && <Text style={[s.muted, { marginTop: 8 }]}>Aucun fichier de log lisible aux emplacements habituels.</Text>}
            {files?.map((f) => <Suggestion key={f} label={f} on={current?.kind === 'file' && current.path === f} onPress={() => save({ kind: 'file', path: f })} />)}
          </>
        )}
        {kind === 'cmd' && (
          <>
            <Text style={[s.section, { marginBottom: 4 }]}>EXEMPLES</Text>
            {CMD_EXAMPLES.map((c) => (
              <Suggestion key={c} label={c} on={false} onPress={() => setCmd(c)} />
            ))}
          </>
        )}
      </View>
    </Sheet>
  );
}
