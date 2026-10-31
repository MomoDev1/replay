import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Android form sheets are only shifted up as far as the screen top allows, so with a tall detent
 * the bottom of the sheet (last fields, action button) stays behind the keyboard.
 * Returns the keyboard height on Android so the sheet can pad its scroll content and keep its
 * action inside it; 0 on iOS, where UIKit already resizes the sheet above the keyboard.
 */
export function useSheetKeyboardInset() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
