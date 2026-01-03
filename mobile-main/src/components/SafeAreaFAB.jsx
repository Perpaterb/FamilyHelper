/**
 * SafeAreaFAB
 *
 * A FAB wrapper that automatically adds bottom padding to avoid
 * overlapping with the Android navigation bar.
 */

import React from 'react';
import { Platform } from 'react-native';
import { FAB } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * SafeAreaFAB - FAB that respects safe area insets
 *
 * Use this instead of FAB from react-native-paper when placing
 * FABs at the bottom of the screen to avoid navigation bar overlap.
 *
 * @param {Object} props - All standard FAB props plus style
 */
export default function SafeAreaFAB({ style, ...props }) {
  const insets = useSafeAreaInsets();

  // Add bottom inset to avoid navigation bar overlap
  // On Android, add extra padding if there's no safe area detected
  const bottomOffset = Platform.OS === 'android'
    ? Math.max(insets.bottom, 16) // At least 16px on Android
    : insets.bottom;

  // Merge the bottom offset with existing style
  const fabStyle = [
    style,
    {
      bottom: (style?.bottom || 0) + bottomOffset,
    }
  ];

  return <FAB style={fabStyle} {...props} />;
}
