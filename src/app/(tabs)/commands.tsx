import Snippets from '@/app/snippets';
import { useTablet } from '@/hooks/use-tablet';
import { TabletSnippets } from '@/tablet/snippets';

/** Snippets as a tab: listed in the tablet rail; phones open them from the terminal instead. */
export default function CommandsTab() {
  const { tablet } = useTablet();
  return tablet ? <TabletSnippets /> : <Snippets />;
}
