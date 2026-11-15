import { useWindowDimensions } from 'react-native';

/** Sidebar layout from this width (iPad portrait is ≥ 744 pt). */
export const TABLET_MIN_WIDTH = 700;
/** Below this width the sidebar collapses to an icon rail. */
const FULL_SIDEBAR_MIN_WIDTH = 900;

export function useTablet() {
  const { width } = useWindowDimensions();
  const tablet = width >= TABLET_MIN_WIDTH;
  return { tablet, compact: tablet && width < FULL_SIDEBAR_MIN_WIDTH };
}
