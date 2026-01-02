/**
 * CustomNavigationHeader
 *
 * Custom navigation header to replace React Navigation's auto-generated header.
 * Fixes issues with:
 * - Inconsistent icon positioning
 * - Touch target misalignment
 * - Button stuck in pressed state
 * - Text flashing before icons appear
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from 'react-native-paper';

/**
 * @typedef {Object} HeaderButton
 * @property {string} icon - Material icon name
 * @property {Function} onPress - Button press handler
 * @property {React.ReactNode} [badge] - Optional badge component to display on button
 */

/**
 * @typedef {Object} CustomNavigationHeaderProps
 * @property {string} title - Header title text
 * @property {Function} [onBack] - Back button handler (if not provided, back button is hidden)
 * @property {HeaderButton[]} [leftButtons] - Array of buttons to show on left (after back button)
 * @property {HeaderButton[]} [rightButtons] - Array of buttons to show on right
 * @property {React.ReactNode} [customTitle] - Custom title component (overrides title text)
 */

/**
 * CustomNavigationHeader Component
 *
 * @param {CustomNavigationHeaderProps} props
 * @returns {JSX.Element}
 */
export default function CustomNavigationHeader({
  title,
  onBack,
  leftButtons = [],
  rightButtons = [],
  customTitle,
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header content */}
      <View style={styles.header}>
        {/* Left side: Back button + custom left buttons */}
        <View style={styles.leftContainer}>
          {onBack && (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backButton}
              activeOpacity={0.6}
            >
              <IconButton
                icon="arrow-left"
                iconColor="#fff"
                size={24}
                style={styles.iconButton}
              />
            </TouchableOpacity>
          )}

          {leftButtons.map((button, index) => (
            <View key={index} style={styles.buttonWrapper}>
              <TouchableOpacity
                onPress={button.onPress}
                style={styles.headerButton}
                activeOpacity={0.6}
              >
                <IconButton
                  icon={button.icon}
                  iconColor="#fff"
                  size={24}
                  style={styles.iconButton}
                />
              </TouchableOpacity>
              {button.badge}
            </View>
          ))}
        </View>

        {/* Center: Title */}
        <View style={styles.titleContainer}>
          {customTitle || (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          )}
        </View>

        {/* Right side: Custom right buttons */}
        <View style={styles.rightContainer}>
          {rightButtons.map((button, index) => (
            <View key={index} style={styles.buttonWrapper}>
              <TouchableOpacity
                onPress={button.onPress}
                style={styles.headerButton}
                activeOpacity={0.6}
              >
                <IconButton
                  icon={button.icon}
                  iconColor="#fff"
                  size={24}
                  style={styles.iconButton}
                />
              </TouchableOpacity>
              {button.badge}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const HEADER_HEIGHT = 60;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#6200ee',
  },
  header: {
    height: HEADER_HEIGHT,
    backgroundColor: '#6200ee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  titleContainer: {
    flex: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  backButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonWrapper: {
    position: 'relative',
  },
  iconButton: {
    margin: 0,
    padding: 0,
  },
});
