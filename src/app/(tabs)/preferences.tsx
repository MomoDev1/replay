import Settings from '@/app/settings';
import { useTablet } from '@/hooks/use-tablet';
import { TabletSettings } from '@/tablet/settings';

/** Settings as a tab: listed in the tablet rail; phones open them from the servers screen instead. */
export default function PreferencesTab() {
  const { tablet } = useTablet();
  return tablet ? <TabletSettings /> : <Settings />;
}
