import { uuid } from 'expo';
import { useSQLiteContext } from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { listSnippets } from '@/lib/db';
import type { Snippet, SnippetInput } from '@/lib/types';

const HISTORY_KEY = 'snippets.history';
const MAX_HISTORY = 20;

type Store = {
  snippets: Snippet[];
  save: (input: SnippetInput, id?: string) => Promise<string>;
  remove: (id: string) => Promise<void>;
  toggleFav: (id: string) => Promise<void>;
  markUsed: (id: string, vars: Record<string, string>) => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function SnippetsProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [snippets, setSnippets] = useState<Snippet[]>([]);

  const reload = useCallback(async () => setSnippets(await listSnippets(db)), [db]);

  useEffect(() => {
    let live = true;
    listSnippets(db).then((sn) => live && setSnippets(sn));
    return () => {
      live = false;
    };
  }, [db]);

  const store = useMemo<Store>(
    () => ({
      snippets,
      async save(input, id) {
        const sid = id ?? uuid.v4();
        if (id) await db.runAsync('UPDATE snippets SET server_id = ?, title = ?, cmd = ?, fav = ? WHERE id = ?', input.serverId, input.title, input.cmd, input.fav ? 1 : 0, sid);
        else await db.runAsync('INSERT INTO snippets (id, server_id, title, cmd, fav, created_at) VALUES (?, ?, ?, ?, ?, ?)', sid, input.serverId, input.title, input.cmd, input.fav ? 1 : 0, Date.now());
        await reload();
        return sid;
      },
      async remove(id) {
        await db.runAsync('DELETE FROM snippets WHERE id = ?', id);
        await reload();
      },
      async toggleFav(id) {
        await db.runAsync('UPDATE snippets SET fav = 1 - fav WHERE id = ?', id);
        await reload();
      },
      async markUsed(id, vars) {
        await db.runAsync('UPDATE snippets SET last_vars = ?, last_used_at = ? WHERE id = ?', JSON.stringify(vars), Date.now(), id);
        await reload();
      },
    }),
    [db, snippets, reload],
  );

  return <Ctx value={store}>{children}</Ctx>;
}

export function useSnippets() {
  const s = use(Ctx);
  if (!s) throw new Error('useSnippets must be used inside <SnippetsProvider>');
  return s;
}

/** Snippets available on a server: its own plus the global ones. */
export function useServerSnippets(serverId: string | undefined) {
  const { snippets } = useSnippets();
  return useMemo(() => snippets.filter((sn) => sn.serverId === null || sn.serverId === serverId), [snippets, serverId]);
}

export function getHistory(): string[] {
  try {
    return JSON.parse(Storage.getItemSync(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function pushHistory(cmd: string) {
  const next = [cmd, ...getHistory().filter((c) => c !== cmd)].slice(0, MAX_HISTORY);
  Storage.setItemSync(HISTORY_KEY, JSON.stringify(next));
}
