import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { getCreds, onCredsChange, type PrState, type ReviewState } from '@/lib/forge';
import { C } from '@/theme';

export const prStateColor: Record<PrState, string> = { open: C.green, merged: C.purple, closed: C.red };

export function useHasCreds(forge: 'github' | 'bitbucket' | undefined) {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    if (!forge) return;
    const check = () => getCreds(forge).then((c) => setHas(!!c));
    check();
    return onCredsChange(check);
  }, [forge]);
  return has;
}

export const prStateLabel: Record<PrState, string> = { open: 'Ouverte', merged: 'Fusionnée', closed: 'Fermée' };

const reviewMeta: Record<ReviewState, { label: string; color: string }> = {
  approved: { label: 'Approuvé', color: C.green },
  changes: { label: 'Changements demandés', color: C.orange },
  commented: { label: 'Commenté', color: C.muted },
  pending: { label: 'En attente', color: C.dim },
};

export function ReviewBadge({ state, name }: { state: ReviewState; name?: string }) {
  const m = reviewMeta[state];
  return (
    <View style={{ borderWidth: 1, borderColor: m.color + '55', backgroundColor: m.color + '1A', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ color: m.color, fontSize: 11, fontWeight: '600' }}>{name ? `${name} · ${m.label}` : m.label}</Text>
    </View>
  );
}
