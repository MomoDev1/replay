import { useWindowDimensions } from 'react-native';

/** Rail + master/detail layout from this width (iPad portrait is ≥ 744 pt; split view can go below). */
export const TABLET_MIN_WIDTH = 700;

export function useTablet() {
  const { width, height } = useWindowDimensions();
  const tablet = width >= TABLET_MIN_WIDTH;
  return { tablet, landscape: width > height };
}
