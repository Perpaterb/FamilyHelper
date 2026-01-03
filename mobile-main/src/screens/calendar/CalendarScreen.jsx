/**
 * Calendar Screen
 *
 * Displays calendar with Month and Day views.
 * Day view implements externally-controlled infinite grid with probe highlight.
 *
 * PERFORMANCE: Uses react-native-reanimated for 60fps animations on UI thread.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDecay,
  withSpring,
  withTiming,
  runOnJS,
  useAnimatedReaction,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import API from '../../services/api';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';
import DateTimeSelector, { formatDateByType } from '../../components/DateTimeSelector';
import CalendarLayersModal from '../../components/CalendarLayersModal';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;

const HEADER_W = 50;
const HEADER_H = 40;
const CELL_H = 40;
const HIGHLIGHT_MS = 400;

// Helper functions
function hourLabel(hr24) {
  let h = ((hr24 % 24) + 24) % 24;
  let hour = h % 12 === 0 ? 12 : h % 12;
  let ampm = h < 12 ? 'am' : 'pm';
  return `${hour}${ampm}`;
}

function dateLabel(dayIdx, includeYear = false) {
  let baseDate = new Date(2023, 9, 31);
  let date = new Date(baseDate);
  date.setDate(baseDate.getDate() + dayIdx);
  let d = date.getDate();
  let month = date.toLocaleString('default', { month: 'long' });
  let suffix =
    d % 10 === 1 && d !== 11 ? 'st' :
    d % 10 === 2 && d !== 12 ? 'nd' :
    d % 10 === 3 && d !== 13 ? 'rd' : 'th';
  let yearSuffix = includeYear ? ` ${String(date.getFullYear()).slice(-2)}` : '';
  return `${d}${suffix} ${month}${yearSuffix}`;
}

function getSizes() {
  const { width, height } = Dimensions.get('window');
  const cellW = (width - HEADER_W) / 1.6;
  const headerCellW = width / 3;
  const padL = cellW * 2;
  const padT = CELL_H * 2;
  const gridW = width - HEADER_W;
  const gridH = height - HEADER_H;
  return { width, height, cellW, headerCellW, padL, padT, gridW, gridH };
}

// Convert target hour (0-23) and day offset to scroll floats
function getXYFloatForProbeTarget(targetHour, targetDay) {
  const { cellW, padL, padT, gridW, gridH } = getSizes();
  const redLineX = HEADER_W + 0.5 * cellW;
  const probeScreenY = HEADER_H + gridH / 2.5 + CELL_H / 2;
  const probeYInGrid = (probeScreenY - HEADER_H) / CELL_H;
  const probeXInGrid = (redLineX - HEADER_W) / cellW;

  // Calculate scroll floats with probe offsets
  const rawScrollXFloat = targetDay - probeXInGrid + padL / cellW + 0.0001;
  const rawScrollYFloat = targetHour - probeYInGrid + padT / CELL_H + 0.0001;

  // Round to nearest integer to ensure cells align properly (snap expects integer values)
  const alignedScrollXFloat = Math.round(rawScrollXFloat);
  const alignedScrollYFloat = Math.round(rawScrollYFloat);

  return {
    scrollYFloat: alignedScrollYFloat,
    scrollXFloat: alignedScrollXFloat,
  };
}

/**
 * Get event color based on layer preferences.
 * Uses first visible attendee's customColor, or their defaultColor/iconColor.
 * For imported events, uses the calendar's color.
 * @param {Object} event - The event object
 * @param {Array} layerPreferences - User's layer preferences
 * @returns {string} - Hex color string
 */
function getEventColor(event, layerPreferences) {
  const defaultColor = '#2196f3'; // Blue fallback

  // If this is an imported event, use its pre-calculated color
  if (event.isImported && event._importedColor) {
    return event._importedColor;
  }

  // If no layer preferences, use default
  if (!layerPreferences || layerPreferences.length === 0) {
    return defaultColor;
  }

  // Check attendees for color
  if (event.attendees && event.attendees.length > 0) {
    for (const attendee of event.attendees) {
      const layer = layerPreferences.find(l => l.memberLayerId === attendee.groupMemberId);
      // If layer is visible (or no preference exists), use its color
      if (!layer || layer.isVisible) {
        if (layer?.customColor) {
          return layer.customColor;
        }
        // Use attendee's iconColor if available
        if (attendee.member?.iconColor) {
          return attendee.member.iconColor;
        }
        if (layer?.defaultColor) {
          return layer.defaultColor;
        }
      }
    }
  }

  return defaultColor;
}

/**
 * Get lighter version of a color (for event background)
 * @param {string} hex - Hex color string
 * @returns {string} - Lighter hex color
 */
function getLighterColor(hex) {
  // Remove # if present
  hex = hex.replace('#', '');

  // Parse RGB values
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  // Lighten by mixing with white (0.85 = 85% lighter)
  r = Math.round(r + (255 - r) * 0.85);
  g = Math.round(g + (255 - g) * 0.85);
  b = Math.round(b + (255 - b) * 0.85);

  // Convert back to hex
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * InfiniteGrid - Externally controlled infinite scrolling grid
 * PERFORMANCE: Uses react-native-reanimated for 60fps UI thread animations
 */
function InfiniteGrid({ externalXYFloat, onXYFloatChange, events, navigation, groupId, layerPreferences }) {
  // Reanimated shared values for smooth UI thread animations
  const scrollYFloat = useSharedValue(externalXYFloat.scrollYFloat);
  const scrollXFloat = useSharedValue(externalXYFloat.scrollXFloat);

  // Context for gesture - stores starting position
  const scrollStartY = useSharedValue(0);
  const scrollStartX = useSharedValue(0);

  // Track animation completion - using shared values for worklet access
  const xAnimDone = useSharedValue(true);
  const yAnimDone = useSharedValue(true);

  // Track settled position as shared values (for animated event transform)
  const settledXRef = useSharedValue(externalXYFloat.scrollXFloat);
  const settledYRef = useSharedValue(externalXYFloat.scrollYFloat);

  // Track settled position for React state (only updates when animation stops)
  const [settledPosition, setSettledPosition] = useState({
    scrollYFloat: externalXYFloat.scrollYFloat,
    scrollXFloat: externalXYFloat.scrollXFloat,
  });

  // Highlight animation
  const highlightOpacity = useSharedValue(0);
  const [highlightCell, setHighlightCell] = useState({ probeRow: 0, probeCol: 0 });

  // Probe day for header X - updated by probe, used by date bar
  const [probeDayState, setProbeDayState] = useState(0);

  // Sync external changes to shared values
  useEffect(() => {
    scrollYFloat.value = externalXYFloat.scrollYFloat;
    scrollXFloat.value = externalXYFloat.scrollXFloat;
    settledXRef.value = externalXYFloat.scrollXFloat;
    settledYRef.value = externalXYFloat.scrollYFloat;
    setSettledPosition({
      scrollYFloat: externalXYFloat.scrollYFloat,
      scrollXFloat: externalXYFloat.scrollXFloat,
    });
  }, [externalXYFloat.scrollYFloat, externalXYFloat.scrollXFloat]);

  // Callback to update React state when animation settles
  const onAnimationComplete = useCallback((x, y) => {
    const newPosition = { scrollXFloat: x, scrollYFloat: y };
    setSettledPosition(newPosition);
    onXYFloatChange(newPosition);
  }, [onXYFloatChange]);

  // Get sizes for calculations - cached in useMemo for React renders
  const sizes = useMemo(() => getSizes(), []);
  const { cellW, headerCellW, padL, padT, gridW, gridH, width: winW, height: winH } = sizes;

  // Store sizes in shared values for UI thread access (worklets can't call getSizes)
  const cellWShared = useSharedValue(cellW);
  const headerCellWShared = useSharedValue(headerCellW);
  const padLShared = useSharedValue(padL);
  const padTShared = useSharedValue(padT);
  const gridWShared = useSharedValue(gridW);
  const gridHShared = useSharedValue(gridH);
  const winWShared = useSharedValue(winW);

  // Gesture handler for grid drag - runs on UI thread
  const panGesture = useMemo(() => Gesture.Pan()
    .onStart(() => {
      // Save current position when gesture starts
      scrollStartX.value = scrollXFloat.value;
      scrollStartY.value = scrollYFloat.value;
    })
    .onUpdate((event) => {
      // Update scroll position based on drag - runs on UI thread
      scrollYFloat.value = scrollStartY.value - event.translationY / CELL_H;
      scrollXFloat.value = scrollStartX.value - event.translationX / cellW;
    })
    .onEnd((event) => {
      // Reset animation tracking
      xAnimDone.value = false;
      yAnimDone.value = false;

      // Calculate snap targets with momentum factored in
      const targetX = scrollXFloat.value + (-event.velocityX / cellW) * 0.3;
      const targetY = scrollYFloat.value + (-event.velocityY / CELL_H) * 0.3;
      const snappedX = Math.round(targetX);
      const snappedY = Math.round(targetY);

      // Animate X to snapped position
      scrollXFloat.value = withSpring(snappedX, {
        damping: 50,
        stiffness: 300,
        velocity: -event.velocityX / cellW,
      }, (finished) => {
        if (finished) {
          xAnimDone.value = true;
          // Check if both animations are done
          if (yAnimDone.value) {
            // Update settled refs for event positioning
            settledXRef.value = scrollXFloat.value;
            settledYRef.value = scrollYFloat.value;
            runOnJS(onAnimationComplete)(scrollXFloat.value, scrollYFloat.value);
          }
        }
      });

      // Animate Y to snapped position (same approach as X)
      scrollYFloat.value = withSpring(snappedY, {
        damping: 50,
        stiffness: 300,
        velocity: -event.velocityY / CELL_H,
      }, (finished) => {
        if (finished) {
          yAnimDone.value = true;
          // Check if both animations are done
          if (xAnimDone.value) {
            // Update settled refs for event positioning
            settledXRef.value = scrollXFloat.value;
            settledYRef.value = scrollYFloat.value;
            runOnJS(onAnimationComplete)(scrollXFloat.value, scrollYFloat.value);
          }
        }
      });
    }), [cellW, onAnimationComplete]);

  // Watch for probe cell changes and trigger highlight
  useAnimatedReaction(
    () => {
      // Use shared values instead of getSizes() - worklets can't call JS functions
      const cw = cellWShared.value;
      const pL = padLShared.value;
      const pT = padTShared.value;
      const gH = gridHShared.value;
      const redLineX = HEADER_W + 0.5 * cw;
      const probeScreenY = HEADER_H + gH / 2.5 + CELL_H / 2;
      const probeXInGrid = (redLineX - HEADER_W) / cw;
      const probeYInGrid = (probeScreenY - HEADER_H) / CELL_H;
      const probeCol = Math.floor(scrollXFloat.value + probeXInGrid - pL / cw);
      const probeRow = Math.floor(scrollYFloat.value + probeYInGrid - pT / CELL_H);
      // Calculate probeDay (col + day offset from hour overflow)
      const probeDayOffset = Math.floor(probeRow / 24);
      const probeDay = probeCol + probeDayOffset;
      return { probeCol, probeRow, probeDay };
    },
    (current, previous) => {
      if (previous && (current.probeCol !== previous.probeCol || current.probeRow !== previous.probeRow)) {
        highlightOpacity.value = 1;
        highlightOpacity.value = withTiming(0, { duration: HIGHLIGHT_MS });
        runOnJS(setHighlightCell)({ probeRow: current.probeRow, probeCol: current.probeCol });
      }
      // Update probeDay state when day changes (for header X)
      if (!previous || current.probeDay !== previous.probeDay) {
        runOnJS(setProbeDayState)(current.probeDay);
      }
    },
    [cellWShared, padLShared, padTShared, gridHShared]
  );

  // Animated style for highlight cell
  const highlightStyle = useAnimatedStyle(() => ({
    opacity: highlightOpacity.value,
  }));

  // Animated style for grid container - transforms entire grid on UI thread
  const gridAnimatedStyle = useAnimatedStyle(() => {
    // Use shared value instead of getSizes() - worklets can't call JS functions
    const cw = cellWShared.value;
    const offsetX = (scrollXFloat.value - Math.floor(scrollXFloat.value)) * cw;
    const offsetY = (scrollYFloat.value - Math.floor(scrollYFloat.value)) * CELL_H;
    return {
      transform: [
        { translateX: -offsetX },
        // +5 pixels to shift grid up so cell center aligns with probe dot
        { translateY: -offsetY + 5 },
      ],
    };
  });

  // Animated style for event container - moves events with scroll
  // Events are positioned relative to settledPosition, so we need to animate
  // the difference between current scroll and settled scroll
  const eventAnimatedStyle = useAnimatedStyle(() => {
    // Use shared value instead of getSizes() - worklets can't call JS functions
    const cw = cellWShared.value;
    // Calculate how far we've scrolled from the settled position
    const deltaX = (scrollXFloat.value - settledXRef.value) * cw;
    const deltaY = (scrollYFloat.value - settledYRef.value) * CELL_H;
    return {
      transform: [
        { translateX: -deltaX },
        { translateY: -deltaY },
      ],
    };
  });

  // Animated style for header X (dates) - moves with horizontal scroll
  // Positions the date labels so the detected day aligns with probe screen position (redLineX)
  const headerXAnimatedStyle = useAnimatedStyle(() => {
    // Use shared values instead of getSizes() - worklets can't call JS functions
    const cw = cellWShared.value;
    const hcw = headerCellWShared.value;
    const pL = padLShared.value;
    const pT = padTShared.value;
    const gH = gridHShared.value;
    const redLineX = HEADER_W + 0.5 * cw;
    const probeScreenY = HEADER_H + gH / 2.5 + CELL_H / 2;
    const probeXInGrid = (redLineX - HEADER_W) / cw;
    const probeYInGrid = (probeScreenY - HEADER_H) / CELL_H;

    // Calculate exact probe position (same formula as the animated reaction)
    const probeColExact = scrollXFloat.value + probeXInGrid - pL / cw;
    const probeRowExact = scrollYFloat.value + probeYInGrid - pT / CELL_H;

    // Calculate the continuous day position
    // probeDay = probeCol + probeRow / 24 (continuous, not floored)
    // Subtract 0.5 (12 hours) offset to align date bar with probe detection
    const probeDayExact = probeColExact + probeRowExact / 24 - 0.5;

    // Cells are positioned at left = dayIdx * headerCellW (absolute position)
    // We need to position the container so that probeDayExact aligns with redLineX
    // Day N is at position N * headerCellW
    // probeDayExact should appear at redLineX
    // So: probeDayExact * headerCellW - offsetX = redLineX
    // offsetX = probeDayExact * headerCellW - redLineX
    const probeDayPosition = probeDayExact * hcw;
    const offsetX = probeDayPosition - redLineX;


    return {
      transform: [{ translateX: -offsetX }],
    };
  });


  // Animated style for header Y (hours) - infinite scroll using modulo
  // Uses scrollYFloat directly (same source as grid) for perfect sync
  const headerYAnimatedStyle = useAnimatedStyle(() => {
    // Use modulo 24 to create infinite cycling effect
    // scrollYFloat represents row position, we want to cycle every 24 rows
    // Subtract 1 hour offset to align with probe detection
    const cyclePosition = (((scrollYFloat.value - 1) % 24) + 24) % 24; // Always positive 0-24
    const offsetY = cyclePosition * CELL_H;
    return {
      // +5 pixels to match grid offset and align with probe dot
      transform: [{ translateY: -offsetY + 5 }],
    };
  });

  // Use sizes from useMemo for rendering calculations (React state, not shared values)
  // (sizes already extracted above: cellW, headerCellW, padL, padT, gridW, gridH, winW, winH)

  // Use settledPosition for React render (shared values can't be read synchronously)
  const renderScrollX = settledPosition.scrollXFloat;
  const renderScrollY = settledPosition.scrollYFloat;

  const redLineX = HEADER_W + 0.5 * cellW;
  const probeScreenY = HEADER_H + gridH / 2.5 + CELL_H / 2;
  const firstCol = Math.floor(renderScrollX - Math.ceil(padL / cellW));
  const firstRow = Math.floor(renderScrollY - Math.ceil(padT / CELL_H)) - 1; // Start 1 row higher to eliminate top gap
  const visibleCols = Math.ceil(gridW / cellW) + 4;
  const visibleRows = Math.ceil(gridH / CELL_H) + 4;

  // Precise probe cell calculation (using settled position for React render)
  const probeXInGrid = (redLineX - HEADER_W) / cellW;
  const probeYInGrid = (probeScreenY - HEADER_H) / CELL_H;
  const probeCol = Math.floor(renderScrollX + probeXInGrid - padL / cellW);
  const probeRow = Math.floor(renderScrollY + probeYInGrid - padT / CELL_H);

  // Note: Highlight animation is handled by useAnimatedReaction above (Reanimated)

  // Header X (date) cells - uses probeDayState from probe (updated without full re-render)
  const probeHour24 = ((probeRow % 24) + 24) % 24;
  const probeDayOffset = Math.floor(probeRow / 24);
  const probeDay = probeCol + probeDayOffset;

  const headerW = winW;

  // Header X cells - render 20 cells in each direction from master time (probeDay)
  // These cells are positioned absolutely and only re-render when settledPosition changes
  // (which happens when animation completes via onAnimationComplete callback)
  const CELLS_EACH_DIRECTION = 20;
  const totalHeaderCells = CELLS_EACH_DIRECTION * 2 + 1; // 20 left + current + 20 right = 41 cells

  let headerXcells = [];
  for (let i = -CELLS_EACH_DIRECTION; i <= CELLS_EACH_DIRECTION; i++) {
    const dayIdx = probeDay + i;
    // Position each cell based on its DAY INDEX (absolute position)
    // The animation transform will shift the container to align with probe
    const left = dayIdx * headerCellW;
    headerXcells.push(
      <View
        key={`day_${dayIdx}`}
        style={{
          position: 'absolute',
          left: left,
          width: headerCellW,
          height: HEADER_H,
          borderWidth: 1,
          borderColor: '#ddd',
          backgroundColor: '#f8f9fa',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Text numberOfLines={1} style={{ color: '#495057', fontWeight: '500' }}>
          {dateLabel(dayIdx)}
        </Text>
      </View>
    );
  }

  // Main grid cells - rendered at fixed positions, container transforms for animation
  let cells = [];
  for (let dx = 0; dx < visibleCols; ++dx) {
    for (let dy = 0; dy < visibleRows; ++dy) {
      let rowIdx = firstRow + dy;
      let colIdx = firstCol + dx;
      let hour24 = ((rowIdx % 24) + 24) % 24;
      let dayShift = Math.floor(rowIdx / 24);
      let cellDayCol = colIdx + dayShift;
      // Fixed positions - container handles the transform offset
      let left = dx * cellW;
      let top = dy * CELL_H;

      cells.push(
        <View
          key={`c_${dx}_${dy}`}
          style={[
            styles.cell,
            { width: cellW, height: CELL_H, left: HEADER_W + left, top: top },
          ]}
        >
          {/* Cell data (invisible but probe can still read hour24 and cellDayCol) */}
        </View>
      );
    }
  }

  // Header Y cells - static 24-hour cycle, rendered once (never re-renders)
  // We render 24 + extra cells to cover visible area + buffer for smooth infinite scroll
  const headerYcells = useMemo(() => {
    const cells = [];
    const totalHours = 24 + Math.ceil(gridH / CELL_H) + 4; // 24 hours + visible + buffer
    for (let i = 0; i < totalHours; ++i) {
      const hour24 = i % 24;
      cells.push(
        <View
          key={`hy${i}`}
          style={{
            position: 'absolute',
            top: i * CELL_H,
            left: 0,
            width: HEADER_W,
            height: CELL_H,
            borderWidth: 1,
            borderColor: '#ddd',
            backgroundColor: '#f8f9fa',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#495057', fontSize: 12, fontWeight: '500' }}>
            {hourLabel(hour24)}
          </Text>
        </View>
      );
    }
    return cells;
  }, [gridH]); // Only re-render if screen size changes


  // Red line
  let redLine = (
    <View
      style={{
        position: 'absolute',
        left: redLineX - 1,
        top: 0,
        width: 2,
        height: HEADER_H,
        backgroundColor: 'red',
        zIndex: 150,
        pointerEvents: 'none',
      }}
    />
  );

  // Render events - positioned exactly like grid cells (same coordinate system)
  // Events go inside the grid container and move with gridAnimatedStyle transform
  // Render 4 days in each direction, only re-render when animation stops
  const EVENT_DAYS_BUFFER = 4;
  const baseDate = new Date(2023, 9, 31); // Oct 31, 2023

  // Memoize event views - only recalculates when settledPosition changes (animation stops)
  const { eventViews, childEventViews } = useMemo(() => {
    const eventViews = [];
    const childEventViews = [];

    if (!events || events.length === 0) {
      return { eventViews, childEventViews };
    }

    // Filter out child responsibility events (they render as lines, not rectangles)
    const regularEvents = events.filter(event => !event.isResponsibilityEvent);

    // STEP 1: Use scan-line algorithm to calculate slot assignments
    const eventLayouts = new Map(); // eventId -> {column, maxColumns, columnsToUse}

    // Create scan events (start and end points)
    const scanEvents = [];
    regularEvents.forEach((event) => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      scanEvents.push({ time: eventStart, type: 'start', event });
      scanEvents.push({ time: eventEnd, type: 'end', event });
    });

    // Sort scan events by time (start before end if same time)
    scanEvents.sort((a, b) => {
      if (a.time.getTime() !== b.time.getTime()) {
        return a.time - b.time;
      }
      return a.type === 'start' ? -1 : 1;
    });

    // Track active events and their columns
    const activeEvents = [];
    const eventColumns = new Map();

    // Process scan events
    scanEvents.forEach((scanEvent) => {
      if (scanEvent.type === 'start') {
        const usedColumns = new Set(activeEvents.map(e => e.column));
        let column = 0;
        while (usedColumns.has(column)) {
          column++;
        }
        eventColumns.set(scanEvent.event.eventId, column);
        activeEvents.push({ event: scanEvent.event, column });
      } else {
        const index = activeEvents.findIndex(e => e.event.eventId === scanEvent.event.eventId);
        if (index !== -1) {
          activeEvents.splice(index, 1);
        }
      }
    });

    // STEP 2: Calculate max columns and expansion for each event
    regularEvents.forEach((event) => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      const eventColumn = eventColumns.get(event.eventId);

      const overlappingEvents = regularEvents.filter((other) => {
        const otherStart = new Date(other.startTime);
        const otherEnd = new Date(other.endTime);
        return otherStart < eventEnd && otherEnd > eventStart;
      });

      const maxColumns = Math.max(...overlappingEvents.map(e => eventColumns.get(e.eventId) + 1));

      const overlappingColumns = new Set(overlappingEvents.map(e => eventColumns.get(e.eventId)));
      let columnsToUse = 1;
      for (let col = eventColumn + 1; col < maxColumns; col++) {
        if (!overlappingColumns.has(col)) {
          columnsToUse++;
        } else {
          break;
        }
      }

      eventLayouts.set(event.eventId, {
        column: eventColumn,
        maxColumns,
        columnsToUse,
      });
    });

    // STEP 3: Render events at FIXED screen positions relative to probe
    // Events positioned based on offset from probeDay/probeHour24
    // Since probe only updates when animation stops, events stay fixed during scroll
    // This matches user perception - grid appears fixed, content scrolls underneath

    // Calculate master datetime as absolute hours from baseDate for comparison
    const masterAbsoluteHours = probeDay * 24 + probeHour24;
    const bufferHours = EVENT_DAYS_BUFFER * 24; // 4 days in hours

    // Probe screen position (relative to event container which starts at HEADER_W)
    // probeScreenX is at center of probed cell, so subtract 0.5*cellW to get left edge of probeDay column
    const probeDayLeftEdge = (redLineX - HEADER_W) - 0.5 * cellW;
    const probeScreenYInContainer = probeScreenY - HEADER_H;

    regularEvents.forEach((event) => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);

      // Calculate event's absolute hours from baseDate
      const eventStartAbsoluteHours = (eventStart - baseDate) / (1000 * 60 * 60);
      const eventEndAbsoluteHours = (eventEnd - baseDate) / (1000 * 60 * 60);

      // Skip events outside visible range (4 days each side)
      // Render if: masterDateTime < eventEnd + 4 days AND masterDateTime > eventStart - 4 days
      if (eventEndAbsoluteHours < masterAbsoluteHours - bufferHours ||
          eventStartAbsoluteHours > masterAbsoluteHours + bufferHours) {
        return;
      }

      const layout = eventLayouts.get(event.eventId);
      if (!layout) return;

      const eventStartHour = eventStart.getHours() + eventStart.getMinutes() / 60;
      const eventDurationHours = (eventEnd - eventStart) / (1000 * 60 * 60);

      // Layout within right half of column
      const availableWidth = cellW / 2;
      const columnWidth = availableWidth / layout.maxColumns;
      const eventWidth = columnWidth * layout.columnsToUse;
      const eventOffsetX = columnWidth * layout.column;
      const eventHeight = eventDurationHours * CELL_H;

      // Render event for each day column in the visible range
      // Moving right = +24 hours, moving left = -24 hours
      // So we need to render the event at multiple day column offsets
      for (let dayOffset = -EVENT_DAYS_BUFFER; dayOffset <= EVENT_DAYS_BUFFER; dayOffset++) {
        // Calculate where this event instance would appear
        // dayOffset of 0 = actual event position
        // dayOffset of +1 = event appears one column to the right (as if viewing 24hrs earlier)
        // dayOffset of -1 = event appears one column to the left (as if viewing 24hrs later)

        const renderDayCol = probeDay + dayOffset;

        // Calculate the hour offset for this day column
        // At renderDayCol, what hour would show this event's start?
        // eventStartHour stays the same, but we're viewing from a different day
        const hourOffsetFromProbe = eventStartHour - probeHour24 + (dayOffset * 24);

        // Calculate actual day difference between event and render column
        const eventStartDay = Math.floor((eventStart - baseDate) / (1000 * 60 * 60 * 24));
        const actualDayDiff = eventStartDay - renderDayCol;

        // The event should render in this column if the hour offset puts it in visible range
        // Adjust hourOffset by the actual day difference (each day diff = 24 hour shift in Y)
        const totalHourOffset = eventStartHour - probeHour24 + (actualDayDiff * 24);

        // X position: dayOffset columns from probe
        const xOffset = dayOffset * cellW;
        const baseLeft = probeDayLeftEdge + xOffset;

        // Y position: hour difference from probe
        const yOffset = totalHourOffset * CELL_H;
        const baseTop = probeScreenYInContainer + yOffset;

        // Final position
        const eventLeft = baseLeft + (cellW / 2) + eventOffsetX;
        const eventTop = baseTop;

        // Get color based on layer preferences
        const eventColor = getEventColor(event, layerPreferences);
        const eventBgColor = getLighterColor(eventColor);

        eventViews.push(
          <Pressable
            key={`event_${event.eventId}_day${dayOffset}`}
            style={{
              position: 'absolute',
              left: eventLeft,
              top: eventTop,
              width: eventWidth,
              height: eventHeight,
              backgroundColor: eventBgColor,
              borderLeftWidth: 3,
              borderLeftColor: eventColor,
              padding: 2,
              zIndex: 5,
            }}
            onLongPress={() => {
              navigation.navigate('EditEvent', {
                groupId: groupId,
                eventId: event.eventId,
              });
            }}
            delayLongPress={300}
          >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: eventColor,
            }}
          >
            {event.title}
          </Text>
          {layout.columnsToUse > 1 && event.description && (
            <Text
              numberOfLines={2}
              style={{
                fontSize: 9,
                color: '#555',
                marginTop: 1,
              }}
            >
              {event.description}
            </Text>
          )}
        </Pressable>
        );
      }
    });

    // CHILD RESPONSIBILITY EVENTS - same absolute positioning approach
    const allResponsibilityLines = [];
    events.forEach((event) => {
      if (event.responsibilityEvents && event.responsibilityEvents.length > 0) {
        event.responsibilityEvents.forEach((re) => {
          allResponsibilityLines.push({
            responsibilityEventId: re.responsibilityEventId,
            eventId: event.eventId,
            title: event.title,
            startTime: event.startTime,
            endTime: event.endTime,
            childColor: re.child.iconColor,
            childInitials: re.child.user?.memberIcon || re.child.iconLetters,
            startAdultColor: re.startResponsibleMember?.iconColor || re.startResponsibleOtherColor,
            startAdultInitials: re.startResponsibleMember?.user?.memberIcon || re.startResponsibleMember?.iconLetters,
            endAdultColor: re.endResponsibleMember?.iconColor || re.endResponsibleOtherColor,
            hasHandoff: !!re.endResponsibleMember || !!re.endResponsibleOtherName,
          });
        });
      }
    });

    // Scan-line algorithm for child events
    const childEventLayouts = new Map();
    const childScanEvents = [];
    allResponsibilityLines.forEach((line) => {
      const lineStart = new Date(line.startTime);
      const lineEnd = new Date(line.endTime);
      childScanEvents.push({ time: lineStart, type: 'start', line });
      childScanEvents.push({ time: lineEnd, type: 'end', line });
    });

    childScanEvents.sort((a, b) => {
      if (a.time.getTime() !== b.time.getTime()) {
        return a.time - b.time;
      }
      return a.type === 'start' ? -1 : 1;
    });

    const activeLines = [];
    const lineColumns = new Map();

    childScanEvents.forEach((scanEvent) => {
      if (scanEvent.type === 'start') {
        const usedColumns = new Set(activeLines.map(l => l.column));
        let column = 0;
        while (usedColumns.has(column)) {
          column++;
        }
        lineColumns.set(scanEvent.line.responsibilityEventId, column);
        activeLines.push({ line: scanEvent.line, column });
      } else {
        const index = activeLines.findIndex(l => l.line.responsibilityEventId === scanEvent.line.responsibilityEventId);
        if (index !== -1) {
          activeLines.splice(index, 1);
        }
      }
    });

    allResponsibilityLines.forEach((line) => {
      const lineStart = new Date(line.startTime);
      const lineEnd = new Date(line.endTime);
      const lineColumn = lineColumns.get(line.responsibilityEventId);

      const overlappingLines = allResponsibilityLines.filter((other) => {
        const otherStart = new Date(other.startTime);
        const otherEnd = new Date(other.endTime);
        return otherStart < lineEnd && otherEnd > lineStart;
      });

      const maxColumns = Math.max(...overlappingLines.map(l => lineColumns.get(l.responsibilityEventId) + 1));

      const overlappingColumns = new Set(overlappingLines.map(l => lineColumns.get(l.responsibilityEventId)));
      let columnsToUse = 1;
      for (let col = lineColumn + 1; col < maxColumns; col++) {
        if (!overlappingColumns.has(col)) {
          columnsToUse++;
        } else {
          break;
        }
      }

      childEventLayouts.set(line.responsibilityEventId, {
        column: lineColumn,
        maxColumns,
        columnsToUse,
      });
    });

    // Render child events for each day column (same multi-column approach as regular events)
    allResponsibilityLines.forEach((line) => {
      const lineStart = new Date(line.startTime);
      const lineEnd = new Date(line.endTime);

      // Calculate line's absolute hours from baseDate
      const lineStartAbsoluteHours = (lineStart - baseDate) / (1000 * 60 * 60);
      const lineEndAbsoluteHours = (lineEnd - baseDate) / (1000 * 60 * 60);

      // Skip events outside visible range (4 days each side)
      if (lineEndAbsoluteHours < masterAbsoluteHours - bufferHours ||
          lineStartAbsoluteHours > masterAbsoluteHours + bufferHours) {
        return;
      }

      const layout = childEventLayouts.get(line.responsibilityEventId);
      if (!layout) return;

      const lineStartHour = lineStart.getHours() + lineStart.getMinutes() / 60;
      const lineDurationHours = (lineEnd - lineStart) / (1000 * 60 * 60);

      // Layout within LEFT half of column
      const availableWidth = cellW / 2;
      const columnWidth = availableWidth / layout.maxColumns;
      const eventWidth = columnWidth * layout.columnsToUse;
      const eventOffsetX = columnWidth * layout.column;
      const eventHeight = lineDurationHours * CELL_H;
      const halfWidth = eventWidth / 2;

      // Render for each day column in the visible range
      for (let dayOffset = -EVENT_DAYS_BUFFER; dayOffset <= EVENT_DAYS_BUFFER; dayOffset++) {
        const renderDayCol = probeDay + dayOffset;
        const lineStartDay = Math.floor((lineStart - baseDate) / (1000 * 60 * 60 * 24));
        const actualDayDiff = lineStartDay - renderDayCol;
        const totalHourOffset = lineStartHour - probeHour24 + (actualDayDiff * 24);

        // X position: dayOffset columns from probe
        const xOffset = dayOffset * cellW;
        const baseLeft = probeDayLeftEdge + xOffset;

        // Y position: hour difference from probe
        const yOffset = totalHourOffset * CELL_H;
        const baseTop = probeScreenYInContainer + yOffset;

        // Final position (left half of cell)
        const eventLeft = baseLeft + eventOffsetX;
        const eventTop = baseTop;

        // Child half (left)
        childEventViews.push(
          <View
            key={`child_${line.responsibilityEventId}_day${dayOffset}`}
            style={{
              position: 'absolute',
              left: eventLeft,
              top: eventTop,
              width: halfWidth,
              height: eventHeight,
              backgroundColor: line.childColor,
              zIndex: 4,
            }}
          />
        );

        // Adult half (right)
        childEventViews.push(
          <View
            key={`adult_${line.responsibilityEventId}_day${dayOffset}`}
            style={{
              position: 'absolute',
              left: eventLeft + halfWidth,
              top: eventTop,
              width: halfWidth,
              height: eventHeight,
              backgroundColor: line.startAdultColor,
              zIndex: 4,
            }}
          />
        );

        // Touchable overlay
        childEventViews.push(
          <Pressable
            key={`wrapper_${line.responsibilityEventId}_day${dayOffset}`}
            style={{
              position: 'absolute',
              left: eventLeft,
              top: eventTop,
              width: eventWidth,
              height: eventHeight,
              zIndex: 7,
            }}
            onLongPress={() => {
              navigation.navigate('EditChildEvent', {
                groupId: groupId,
                eventId: line.eventId,
              });
            }}
            delayLongPress={300}
          >
            <View style={{ padding: 2, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 2, marginBottom: 2 }}>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: line.childColor, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 6, fontWeight: 'bold', color: '#000' }}>{line.childInitials}</Text>
                </View>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: line.startAdultColor, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 6, fontWeight: 'bold', color: '#000' }}>{line.startAdultInitials}</Text>
                </View>
              </View>
              {line.title && (
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: 9,
                    fontWeight: 'bold',
                    color: '#000',
                    textAlign: 'center',
                  }}
                >
                  {line.title}
                </Text>
              )}
            </View>
          </Pressable>
        );
      }
    });

    return { eventViews, childEventViews };
  }, [events, probeDay, probeHour24, redLineX, probeScreenY, cellW, navigation, groupId, layerPreferences]);

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={styles.gridRoot}>
        {/* Top bar & header cells */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: HEADER_H,
            zIndex: 16,
            backgroundColor: '#f8f9fa',
            borderBottomWidth: 1,
            borderBottomColor: '#ddd',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            overflow: 'hidden',
          }}
        >
          {/* Animated inner container - transforms with horizontal scroll */}
          <Animated.View style={headerXAnimatedStyle}>
            {headerXcells}
          </Animated.View>
          {redLine}
        </View>
        {/* Left header Y col - clip container */}
        <View
          style={{
            position: 'absolute',
            top: HEADER_H,
            left: 0,
            width: HEADER_W,
            bottom: 0,
            zIndex: 10,
            overflow: 'hidden',
          }}
        >
          {/* Animated inner container - transforms with vertical scroll */}
          <Animated.View style={headerYAnimatedStyle}>
            {headerYcells}
          </Animated.View>
        </View>
        {/* Main grid container - transforms for smooth animation */}
        <Animated.View
          style={[
            { position: 'absolute', top: HEADER_H, left: 0, right: 0, bottom: 0 },
            gridAnimatedStyle,
          ]}
        >
          {cells}
        </Animated.View>
        {/* Event layer - clipped to grid area, events positioned relative to probe */}
        <View
          style={{
            position: 'absolute',
            top: HEADER_H,
            left: HEADER_W,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
          }}
          pointerEvents="box-none"
        >
          {/* Animated container - moves events with scroll delta from settled position */}
          <Animated.View style={eventAnimatedStyle}>
            {/* Child responsibility lines (left half of day column) */}
            {childEventViews}
            {/* Event rectangles (right half of day column) */}
            {eventViews}
          </Animated.View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * CalendarScreen component
 */
export default function CalendarScreen({ navigation, route }) {
  const { groupId } = route.params;
  const insets = useSafeAreaInsets();

  // View mode: 'month' or 'day'
  const [viewMode, setViewMode] = useState('month');

  // Month scroll state - defined early for use in handleViewModeToggle and handleDatePickerChange
  // Base month (fixed reference point - the month when component mounted)
  const baseMonthRef = useRef({
    year: new Date().getFullYear(),
    month: new Date().getMonth()
  });

  // Infinite month scroll - track position as a float (like day view)
  const monthScrollFloat = useSharedValue(0);
  const [settledMonthScroll, setSettledMonthScroll] = useState(0);

  // Helper to get day offset from base date for a given date
  const getDayOffsetForDate = (date) => {
    const baseDate = new Date(2023, 9, 31); // Oct 31, 2023
    const baseDateUTC = Date.UTC(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    const dateUTC = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((dateUTC - baseDateUTC) / (1000 * 60 * 60 * 24));
  };

  // Get position for midday of today (used when entering day view)
  const getMiddayTodayPosition = () => {
    const now = new Date();
    const diffDays = getDayOffsetForDate(now);
    return getXYFloatForProbeTarget(12, diffDays); // 12 = midday
  };

  // Calculate initial position based on current date/time
  const getInitialPosition = () => {
    const now = new Date();
    const diffDays = getDayOffsetForDate(now);
    // Get current hour (round to nearest hour)
    const currentHour = now.getHours();
    // Use the helper function to get proper scroll position
    return getXYFloatForProbeTarget(currentHour, diffDays);
  };

  // Handle view mode toggle - preserve current day and hour when switching views
  const handleViewModeToggle = (currentProbeDay, currentProbeHour) => {
    if (viewMode === 'month') {
      // Switching TO day view - preserve the current hour (or use 12pm if not set)
      const targetHour = typeof currentProbeHour === 'number' ? currentProbeHour : 12;
      const newPosition = getXYFloatForProbeTarget(targetHour, currentProbeDay);
      setExternalXYFloat(newPosition);
      setViewMode('day');
    } else {
      // Switching TO month view - calculate month offset from base month
      // Calculate the date from currentProbeDay
      const baseDate = new Date(2023, 9, 31); // Oct 31, 2023
      const currentDate = new Date(baseDate);
      currentDate.setDate(baseDate.getDate() + currentProbeDay);

      // Calculate month offset from base month
      const targetYear = currentDate.getFullYear();
      const targetMonth = currentDate.getMonth();
      const baseMonthYear = baseMonthRef.current.year;
      const baseMonthMonth = baseMonthRef.current.month;
      const monthOffset = (targetYear - baseMonthYear) * 12 + (targetMonth - baseMonthMonth);

      // Update month scroll position
      monthScrollFloat.value = monthOffset;
      setSettledMonthScroll(monthOffset);

      setViewMode('month');
    }
  };

  // Day view: External XY float state that drives the grid
  const [externalXYFloat, setExternalXYFloat] = useState(getInitialPosition());

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedPickerDate, setSelectedPickerDate] = useState(new Date());

  // Event creation modal state
  const [showEventTypeModal, setShowEventTypeModal] = useState(false);

  // Day events popup state (for long-press in month view)
  const [showDayEventsModal, setShowDayEventsModal] = useState(false);
  const [selectedDayDate, setSelectedDayDate] = useState(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState([]);

  // Events state
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Layer preferences state
  const [showLayersModal, setShowLayersModal] = useState(false);
  const [layerPreferences, setLayerPreferences] = useState([]);

  // Imported calendars state
  const [importedCalendars, setImportedCalendars] = useState([]);
  const [importedEvents, setImportedEvents] = useState([]);

  // Permission state
  const [canCreate, setCanCreate] = useState(false);
  const [groupInfo, setGroupInfo] = useState(null);

  /**
   * Load group info and check permissions
   */
  const loadGroupInfo = async () => {
    try {
      const response = await API.get(`/groups/${groupId}`);
      setGroupInfo(response.data.group);
      const role = response.data.group?.userRole || null;
      const settings = response.data.group?.settings;

      // Check if user can create calendar events
      // Use !== false to properly handle explicit false values (defaults to true if undefined)
      if (role === 'admin' && settings?.calendarCreatableByAdmins !== false) {
        setCanCreate(true);
      } else if (role === 'parent' && settings?.calendarCreatableByParents !== false) {
        setCanCreate(true);
      } else if (role === 'adult' && settings?.calendarCreatableByAdults !== false) {
        setCanCreate(true);
      } else if (role === 'caregiver' && settings?.calendarCreatableByCaregivers !== false) {
        setCanCreate(true);
      } else if (role === 'child' && settings?.calendarCreatableByChildren !== false) {
        setCanCreate(true);
      } else {
        setCanCreate(false);
      }
    } catch (err) {
      console.error('Load group info error:', err);
    }
  };

  /**
   * Fetch events for a date range
   */
  const fetchEvents = async () => {
    try {
      setEventsLoading(true);

      // Fetch ALL events for this group (no date range filter)
      // This ensures consistent layout calculation across all scrolling positions
      const response = await API.get(`/groups/${groupId}/calendar/events`);

      if (response.data.success) {
        setEvents(response.data.events || []);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setEventsLoading(false);
    }
  };

  /**
   * Fetch layer preferences for the current group
   */
  const fetchLayerPreferences = async () => {
    try {
      const response = await API.get(`/groups/${groupId}/calendar/layers`);
      if (response.data.success) {
        setLayerPreferences(response.data.layers || []);
      }
    } catch (error) {
      console.error('Error fetching layer preferences:', error);
    }
  };

  /**
   * Fetch imported calendars and their events
   */
  const fetchImportedCalendars = async () => {
    try {
      // Fetch imported calendars
      const calendarsResponse = await API.get(`/groups/${groupId}/calendar/imported`);
      if (calendarsResponse.data.success) {
        setImportedCalendars(calendarsResponse.data.calendars || []);
      }

      // Fetch all imported events
      const eventsResponse = await API.get(`/groups/${groupId}/calendar/imported-events`);
      if (eventsResponse.data.success) {
        setImportedEvents(eventsResponse.data.events || []);
      }
    } catch (error) {
      console.error('Error fetching imported calendars:', error);
    }
  };

  /**
   * Fetch events and group info when component mounts or groupId changes
   */
  useEffect(() => {
    loadGroupInfo();
    fetchEvents();
    fetchLayerPreferences();
    fetchImportedCalendars();
  }, [groupId]);

  /**
   * Refresh events when returning from CreateEvent or EditEvent screens
   * Also marks calendar as viewed to clear the notification badge
   */
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchEvents();
      // Mark calendar as viewed to clear notification badge
      API.post(`/groups/${groupId}/calendar/mark-viewed`).catch(err => {
        console.error('Failed to mark calendar as viewed:', err);
      });
    });

    return unsubscribe;
  }, [navigation, groupId]);

  /**
   * Check if an event should be visible based on layer preferences.
   * An event is visible if ANY of its attendees' layers are visible.
   * For child responsibility events, also checks child and responsible adults.
   */
  const isEventVisible = useCallback((event) => {
    // If no layer preferences are set, show all events (default)
    if (!layerPreferences || layerPreferences.length === 0) {
      return true;
    }

    // Helper to check if a member's layer is visible
    const isMemberLayerVisible = (groupMemberId) => {
      if (!groupMemberId) return true; // If no ID, show by default
      const layer = layerPreferences.find(l => l.memberLayerId === groupMemberId);
      // If no layer preference exists, default to visible
      return layer ? layer.isVisible : true;
    };

    // Check attendees
    if (event.attendees && event.attendees.length > 0) {
      const hasVisibleAttendee = event.attendees.some(attendee =>
        isMemberLayerVisible(attendee.groupMemberId)
      );
      if (hasVisibleAttendee) return true;
    }

    // Check responsibility events (child events)
    if (event.responsibilityEvents && event.responsibilityEvents.length > 0) {
      for (const re of event.responsibilityEvents) {
        // Check child layer
        if (re.child && isMemberLayerVisible(re.child.groupMemberId)) {
          return true;
        }
        // Check start responsible adult layer
        if (re.startResponsibleMember && isMemberLayerVisible(re.startResponsibleMember.groupMemberId)) {
          return true;
        }
        // Check end responsible adult layer
        if (re.endResponsibleMember && isMemberLayerVisible(re.endResponsibleMember.groupMemberId)) {
          return true;
        }
      }
    }

    // If event has no attendees and no responsibility info, show by default
    if ((!event.attendees || event.attendees.length === 0) &&
        (!event.responsibilityEvents || event.responsibilityEvents.length === 0)) {
      return true;
    }

    return false;
  }, [layerPreferences]);

  /**
   * Check if an imported calendar event should be visible
   * based on user's preference for that calendar
   */
  const isImportedEventVisible = useCallback((importedEvent) => {
    // Find the calendar this event belongs to
    const calendar = importedCalendars.find(
      cal => cal.importedCalendarId === importedEvent.importedCalendarId
    );

    // If calendar not found or explicitly hidden, don't show
    if (!calendar) return false;

    // Check if the calendar layer is visible (defaults to true)
    return calendar.isVisible !== false;
  }, [importedCalendars]);

  /**
   * Get color for an imported event based on its calendar's color
   */
  const getImportedEventColor = useCallback((importedEvent) => {
    const calendar = importedCalendars.find(
      cal => cal.importedCalendarId === importedEvent.importedCalendarId
    );
    return calendar?.customColor || calendar?.color || '#6200ee';
  }, [importedCalendars]);

  /**
   * Filter events based on visibility preferences
   * Merges regular calendar events with imported calendar events
   */
  const visibleEvents = useMemo(() => {
    // Filter regular events
    const filteredEvents = events.filter(isEventVisible);

    // Filter and transform imported events to match event structure
    const filteredImportedEvents = importedEvents
      .filter(isImportedEventVisible)
      .map(importedEvent => ({
        // Map imported event to match regular event structure
        eventId: `imported-${importedEvent.eventId}`,
        title: importedEvent.title,
        description: importedEvent.description,
        location: importedEvent.location,
        startTime: importedEvent.startTime,
        endTime: importedEvent.endTime,
        isAllDay: importedEvent.isAllDay,
        // Mark as imported for special handling
        isImported: true,
        importedCalendarId: importedEvent.importedCalendarId,
        importedCalendarName: importedEvent.calendarName,
        // Use calendar color for this event
        _importedColor: getImportedEventColor(importedEvent),
        // Empty arrays for fields not applicable to imported events
        attendees: [],
        responsibilityEvents: [],
      }));

    // Merge and return all visible events
    return [...filteredEvents, ...filteredImportedEvents];
  }, [events, isEventVisible, importedEvents, isImportedEventVisible, getImportedEventColor]);

  // Calculate masterDateTime from current probe position
  const { cellW, padL, padT, gridW, gridH } = getSizes();
  const redLineX = HEADER_W + 0.5 * cellW;
  const probeScreenY = HEADER_H + gridH / 2.5 + CELL_H / 2;
  const probeXInGrid = (redLineX - HEADER_W) / cellW;
  const probeYInGrid = (probeScreenY - HEADER_H) / CELL_H;
  const probeCol = Math.floor(externalXYFloat.scrollXFloat + probeXInGrid - padL / cellW);
  const probeRow = Math.floor(externalXYFloat.scrollYFloat + probeYInGrid - padT / CELL_H);
  const probeHour24 = ((probeRow % 24) + 24) % 24;
  const probeDayOffset = Math.floor(probeRow / 24);
  const probeDay = probeCol + probeDayOffset;

  // Create a Date object for the master datetime (used by both Month and Day views)
  const baseDate = new Date(2023, 9, 31); // Oct 31, 2023
  const masterDateTime = new Date(baseDate);
  masterDateTime.setDate(baseDate.getDate() + probeDay);
  masterDateTime.setHours(probeHour24, 0, 0, 0);

  // Format for banner display
  const masterDayTimeDate = `${hourLabel(probeHour24)} ${dateLabel(probeDay, true)}`;

  // Handle date picker change - apply the selected date at 12pm
  const handleDatePickerChange = (newDate) => {
    setSelectedPickerDate(newDate);

    // Convert selected date to day offset, set hour to 12 (noon)
    const baseDate = new Date(2023, 9, 31);

    // Use Date.UTC to avoid timezone issues with date arithmetic
    const baseDateUTC = Date.UTC(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    const selectedDateUTC = Date.UTC(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
    const daysDiff = Math.round((selectedDateUTC - baseDateUTC) / (1000 * 60 * 60 * 24));

    const targetHour = 12; // Always go to 12pm (noon)

    // Convert to scroll floats
    const newXYFloat = getXYFloatForProbeTarget(targetHour, daysDiff);
    setExternalXYFloat(newXYFloat);

    // Update month scroll position to match the selected date's month
    // Calculate month offset from base month
    const targetYear = newDate.getFullYear();
    const targetMonth = newDate.getMonth();
    const baseMonthYear = baseMonthRef.current.year;
    const baseMonthMonth = baseMonthRef.current.month;
    const monthOffset = (targetYear - baseMonthYear) * 12 + (targetMonth - baseMonthMonth);

    // Update month scroll position
    monthScrollFloat.value = monthOffset;
    setSettledMonthScroll(monthOffset);
  };

  // Header will be rendered as CustomNavigationHeader in the return statement

  // Swipeable Month View Implementation - Infinite Scroll
  const MONTH_WIDTH = SCREEN_WIDTH;
  const ROWS = 6;
  const COLS = 7;
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const CELL_WIDTH = Math.floor((SCREEN_WIDTH - 6) / 7);
  const CELL_HEIGHT_MONTH = CELL_WIDTH * 2; // 2x the height (renamed to avoid conflict)
  const CALENDAR_HEIGHT = 24 + ROWS * CELL_HEIGHT_MONTH;

  // Additional shared value for gesture start position
  const monthScrollStart = useSharedValue(0);

  // Get month matrix (always 6 rows)
  const getMonthMatrix = (year, month) => {
    const firstDay = new Date(year, month, 1);
    let firstWeekDay = firstDay.getDay();
    let matrix = [];
    let day = 1 - firstWeekDay;
    for (let row = 0; row < ROWS; ++row) {
      let week = [];
      for (let col = 0; col < COLS; ++col, ++day) {
        let d = new Date(year, month, day);
        let isCurrentMonth = d.getMonth() === month;
        week.push({
          key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
          date: new Date(d),
          isCurrentMonth,
        });
      }
      matrix.push(week);
    }
    return matrix;
  };

  // Get adjacent months - helper function
  const getAdjacentMonths = (baseYear, baseMonth, offset) => {
    let m = baseMonth + offset;
    let y = baseYear + Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return { year: y, month: m };
  };

  // Get month for a given scroll offset from base month
  const getMonthForOffset = useCallback((offset) => {
    return getAdjacentMonths(baseMonthRef.current.year, baseMonthRef.current.month, offset);
  }, []);

  // Calculate visible months based on settled scroll position
  // Render enough months to cover the visible area plus buffer for smooth scrolling
  const visibleMonths = useMemo(() => {
    const centerMonth = Math.round(settledMonthScroll);
    // Render 5 months: 2 before, current, 2 after
    const result = [];
    for (let i = centerMonth - 2; i <= centerMonth + 2; i++) {
      const month = getMonthForOffset(i);
      result.push({ ...month, offset: i });
    }
    return result;
  }, [settledMonthScroll, getMonthForOffset]);

  // Callback for when month animation settles
  const onMonthAnimationComplete = useCallback((newScrollValue) => {
    setSettledMonthScroll(newScrollValue);

    // Update masterDateTime for banner
    const targetMonth = getMonthForOffset(Math.round(newScrollValue));
    const newDate = new Date(targetMonth.year, targetMonth.month, 15); // Middle of month
    newDate.setHours(12, 0, 0, 0);

    const baseDate = new Date(2023, 9, 31);
    const baseDateUTC = Date.UTC(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    const newDateUTC = Date.UTC(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
    const diffDays = Math.round((newDateUTC - baseDateUTC) / (1000 * 60 * 60 * 24));

    const newPosition = getXYFloatForProbeTarget(12, diffDays);
    setExternalXYFloat(newPosition);
  }, [getMonthForOffset]);

  // Animated style for month container - infinite scroll using translateX
  const monthAnimatedStyle = useAnimatedStyle(() => {
    // Calculate offset based on scroll position
    // Each month is MONTH_WIDTH wide
    // We translate by the fractional part to create smooth scrolling
    const offset = monthScrollFloat.value * MONTH_WIDTH;
    return {
      transform: [{ translateX: -offset }],
    };
  });

  // Gesture handler for month swipe - runs on UI thread (infinite scroll)
  const monthPanGesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-10, 10]) // Require 10px horizontal movement to activate
    .onStart(() => {
      monthScrollStart.value = monthScrollFloat.value;
    })
    .onUpdate((event) => {
      // Update scroll position based on drag
      // Negative translationX means dragging left = moving to next month = positive scroll
      monthScrollFloat.value = monthScrollStart.value - event.translationX / MONTH_WIDTH;
    })
    .onEnd((event) => {
      // Snap to nearest month with spring animation
      const velocity = -event.velocityX / MONTH_WIDTH;
      const current = monthScrollFloat.value;

      // Determine target based on velocity and position
      let target;
      if (Math.abs(velocity) > 0.5) {
        // High velocity - snap in direction of movement
        target = velocity > 0 ? Math.ceil(current) : Math.floor(current);
      } else {
        // Low velocity - snap to nearest
        target = Math.round(current);
      }

      monthScrollFloat.value = withSpring(target, {
        damping: 80,
        stiffness: 500,
        velocity: velocity,
      }, (finished) => {
        if (finished) {
          runOnJS(onMonthAnimationComplete)(target);
        }
      });
    }), [onMonthAnimationComplete]);

  // Handle day cell tap - update banner and highlight the selected day
  const handleDayTap = (date) => {
    const baseDate = new Date(2023, 9, 31); // Oct 31, 2023
    const targetDate = new Date(date);
    targetDate.setHours(12, 0, 0, 0); // Set to noon

    // Use Date.UTC to avoid timezone issues
    const baseDateUTC = Date.UTC(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    const targetDateUTC = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const diffDays = Math.round((targetDateUTC - baseDateUTC) / (1000 * 60 * 60 * 24));

    // Update the probe position to highlight the selected day
    const newPosition = getXYFloatForProbeTarget(12, diffDays);
    setExternalXYFloat(newPosition);

    // Stay in month view (don't switch to day view)
  };

  // Handle day cell long press - show events popup
  const handleDayLongPress = (date) => {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Filter events that touch this day (using visibleEvents for layer filtering)
    const dayEvents = visibleEvents.filter(event => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      return eventStart <= dayEnd && eventEnd >= dayStart;
    });

    // Sort by start time
    dayEvents.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    setSelectedDayDate(date);
    setSelectedDayEvents(dayEvents);
    setShowDayEventsModal(true);
  };

  /**
   * Calculate GLOBAL column assignments for all child responsibility events
   * This must be done once for ALL events so the same event gets the same column across all days
   */
  const calculateGlobalChildEventColumns = (allEvents) => {
    if (!allEvents || allEvents.length === 0) {
      return new Map();
    }

    // Flatten all responsibility events
    const allResponsibilityEvents = [];
    allEvents.forEach(event => {
      if (event.responsibilityEvents && event.responsibilityEvents.length > 0) {
        event.responsibilityEvents.forEach(re => {
          allResponsibilityEvents.push({
            responsibilityEventId: re.responsibilityEventId,
            eventId: event.eventId,
            startTime: event.startTime,
            endTime: event.endTime,
          });
        });
      }
    });

    // Use scan-line algorithm to assign columns
    const childBarColumns = new Map();
    const childScanEvents = [];

    allResponsibilityEvents.forEach(re => {
      const eventStart = new Date(re.startTime);
      const eventEnd = new Date(re.endTime);
      childScanEvents.push({ time: eventStart, type: 'start', re });
      childScanEvents.push({ time: eventEnd, type: 'end', re });
    });

    childScanEvents.sort((a, b) => {
      if (a.time.getTime() !== b.time.getTime()) {
        return a.time - b.time;
      }
      return a.type === 'start' ? -1 : 1;
    });

    const activeBars = [];
    childScanEvents.forEach(scanEvent => {
      if (scanEvent.type === 'start') {
        const usedColumns = new Set(activeBars.map(b => b.column));
        let column = 0;
        while (usedColumns.has(column)) {
          column++;
        }
        childBarColumns.set(scanEvent.re.responsibilityEventId, column);
        activeBars.push({ re: scanEvent.re, column });
      } else {
        const index = activeBars.findIndex(b => b.re.responsibilityEventId === scanEvent.re.responsibilityEventId);
        if (index !== -1) {
          activeBars.splice(index, 1);
        }
      }
    });

    return childBarColumns;
  };

  /**
   * Calculate event layout for a single day in month view
   * Returns: { dots, lines, childBars }
   */
  const getMonthDayEventLayout = (date, allEvents, globalChildColumns, prefs) => {
    if (!allEvents || allEvents.length === 0) {
      return { dots: [], lines: [], childBars: [] };
    }

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // === PROCESS REGULAR EVENTS ===
    // Filter to regular events only (no child responsibility events)
    const regularEvents = allEvents.filter(event => !event.isResponsibilityEvent);

    // Find regular events that touch this day
    const eventsThisDay = regularEvents.filter(event => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      return eventStart <= dayEnd && eventEnd >= dayStart;
    });

    // Separate single-day and multi-day events
    const singleDayEvents = [];
    const multiDayEvents = [];

    eventsThisDay.forEach(event => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);

      // Check if event spans multiple days
      const startDay = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
      const endDay = new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate());
      const spansDays = endDay.getTime() > startDay.getTime();

      if (spansDays) {
        multiDayEvents.push(event);
      } else {
        singleDayEvents.push(event);
      }
    });

    // Use scan-line algorithm to assign rows to multi-day events
    const eventRows = new Map();
    const scanEvents = [];

    multiDayEvents.forEach(event => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      scanEvents.push({ time: eventStart, type: 'start', event });
      scanEvents.push({ time: eventEnd, type: 'end', event });
    });

    scanEvents.sort((a, b) => {
      if (a.time.getTime() !== b.time.getTime()) {
        return a.time - b.time;
      }
      return a.type === 'start' ? -1 : 1;
    });

    const activeEvents = [];
    scanEvents.forEach(scanEvent => {
      if (scanEvent.type === 'start') {
        const usedRows = new Set(activeEvents.map(e => e.row));
        let row = 0;
        while (usedRows.has(row)) {
          row++;
        }
        eventRows.set(scanEvent.event.eventId, row);
        activeEvents.push({ event: scanEvent.event, row });
      } else {
        const index = activeEvents.findIndex(e => e.event.eventId === scanEvent.event.eventId);
        if (index !== -1) {
          activeEvents.splice(index, 1);
        }
      }
    });

    // Build lines for multi-day events
    const lines = multiDayEvents.map(event => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      const row = eventRows.get(event.eventId) || 0;

      // Check if this day is the start or end of the event
      const isStart = eventStart >= dayStart && eventStart <= dayEnd;
      const isEnd = eventEnd >= dayStart && eventEnd <= dayEnd;

      return {
        color: getEventColor(event, prefs),
        row,
        isStart,
        isEnd,
        eventId: event.eventId,
      };
    });

    // Build dots for single-day events
    const dots = singleDayEvents.map((event, idx) => ({
      color: getEventColor(event, prefs),
      row: idx, // Simple stacking for dots
      eventId: event.eventId,
    }));

    // === PROCESS CHILD RESPONSIBILITY EVENTS ===
    // Use the GLOBAL column assignments passed in (calculated once for all days)
    const allResponsibilityBars = [];
    allEvents.forEach(event => {
      if (event.responsibilityEvents && event.responsibilityEvents.length > 0) {
        const eventStart = new Date(event.startTime);
        const eventEnd = new Date(event.endTime);

        // Only include if event touches this day
        if (eventStart <= dayEnd && eventEnd >= dayStart) {
          event.responsibilityEvents.forEach(re => {
            // Calculate start and end fractions within this specific day (0.0 = 12am, 1.0 = 12am next day)
            const visibleStart = eventStart > dayStart ? eventStart : dayStart;
            const visibleEnd = eventEnd < dayEnd ? eventEnd : dayEnd;

            // Calculate fraction of day (12am to 12am is 0.0 to 1.0)
            const dayDuration = 24 * 60 * 60 * 1000; // 24 hours in ms
            const startFraction = (visibleStart - dayStart) / dayDuration;
            const endFraction = (visibleEnd - dayStart) / dayDuration;

            // Get the global column assignment for this responsibility event
            const column = globalChildColumns.get(re.responsibilityEventId) || 0;

            allResponsibilityBars.push({
              responsibilityEventId: re.responsibilityEventId,
              eventId: event.eventId,
              childColor: re.child.iconColor,
              adultColor: re.startResponsibleMember?.iconColor || re.startResponsibleOtherColor,
              startFraction, // 0.0 to 1.0 (position within day)
              endFraction,   // 0.0 to 1.0 (position within day)
              column,        // Global column assignment (same across all days)
            });
          });
        }
      }
    });

    // Build child bars with global column assignments
    const childBars = allResponsibilityBars;

    return { dots, lines, childBars };
  };

  // Render single month view - with numbers and highlighting
  const renderSingleMonthView = (year, month) => {
    const matrix = getMonthMatrix(year, month);
    const today = new Date();

    // Calculate GLOBAL column assignments once for all child responsibility events
    // This ensures the same event gets the same column across all days
    const globalChildColumns = calculateGlobalChildEventColumns(visibleEvents);

    // Calculate max columns to determine spacing for all days
    const maxColumns = globalChildColumns.size > 0 ? Math.max(...globalChildColumns.values()) + 1 : 0;

    return (
      <View style={[styles.monthView, { height: CALENDAR_HEIGHT }]}>
        <View style={styles.headerRow}>
          {DAY_LABELS.map((label, i) => (
            <Text key={i} style={styles.dayLabel}>
              {label}
            </Text>
          ))}
        </View>
        {matrix.map((week, r) => (
          <View key={r} style={styles.weekRow}>
            {week.map((day, c) => {
              const isToday =
                day.date.getDate() === today.getDate() &&
                day.date.getMonth() === today.getMonth() &&
                day.date.getFullYear() === today.getFullYear();

              const isMasterDate =
                day.date.getDate() === masterDateTime.getDate() &&
                day.date.getMonth() === masterDateTime.getMonth() &&
                day.date.getFullYear() === masterDateTime.getFullYear();

              // Get event indicators for this day (pass global columns and layer preferences)
              const { dots, lines, childBars } = getMonthDayEventLayout(day.date, visibleEvents, globalChildColumns, layerPreferences);

              return (
                <TouchableOpacity
                  key={day.key}
                  onPress={() => handleDayTap(day.date)}
                  onLongPress={() => handleDayLongPress(day.date)}
                  style={[
                    styles.monthCell,
                    !day.isCurrentMonth && styles.monthCellOutside,
                    isToday && styles.monthTodayCell,
                    isMasterDate && styles.monthMasterDateCell,
                  ]}
                >
                  {/* Day number at top */}
                  <Text
                    style={[
                      styles.monthCellText,
                      !day.isCurrentMonth && styles.monthCellTextOutside,
                    ]}
                  >
                    {day.date.getDate()}
                  </Text>

                  {/* Child responsibility bars at top (below day number) */}
                  <View style={styles.monthChildBarContainer}>
                    {childBars.map((bar) => {
                      // Each bar uses its column (from scan-line algorithm) to determine vertical position
                      // This ensures bars align horizontally across multiple days for the same event

                      // Calculate horizontal position based on time within the day
                      // startFraction and endFraction are 0.0 (12am) to 1.0 (12am next day)
                      const leftPercent = (bar.startFraction || 0) * 100;
                      const widthPercent = ((bar.endFraction || 1) - (bar.startFraction || 0)) * 100;

                      // Each bar pair takes up equal vertical space within the top 60% of cell (below day number)
                      // The cell height is 2x the width (CELL_HEIGHT_MONTH = CELL_WIDTH * 2)
                      // Split: Day number (top), 60% child bars, 40% event indicators (bottom)
                      const dayNumberAndGapHeight = 20; // Reserve space for day number + gap at top
                      const childBarsHeight = (CELL_HEIGHT_MONTH - dayNumberAndGapHeight) * 0.6; // 60% for child bars
                      const barPairHeight = maxColumns > 0 ? Math.floor(childBarsHeight / maxColumns) : 0; // Divide space equally
                      const barHeight = Math.floor(barPairHeight / 2); // Child and adult each get half

                      const topPosition = dayNumberAndGapHeight + (bar.column * barPairHeight); // Start below day number + gap

                      return (
                        <View
                          key={`childbar-${bar.responsibilityEventId}`}
                          style={{
                            position: 'absolute',
                            left: `${leftPercent}%`, // Start at time-based position
                            width: `${widthPercent}%`, // Width based on duration
                            top: topPosition,
                            flexDirection: 'column', // Stack child/adult vertically
                          }}
                        >
                          {/* Child bar (top) */}
                          <View
                            style={{
                              height: barHeight,
                              backgroundColor: bar.childColor,
                            }}
                          />
                          {/* Adult bar (bottom) */}
                          <View
                            style={{
                              height: barHeight,
                              backgroundColor: bar.adultColor,
                            }}
                          />
                        </View>
                      );
                    })}
                  </View>

                  {/* Event indicators in bottom half of cell */}
                  <View style={styles.monthEventContainer}>

                    {/* Render lines for multi-day events */}
                    {lines.slice(0, 3).map((line, idx) => (
                      <View
                        key={`line-${line.eventId}`}
                        style={[
                          styles.monthEventLine,
                          {
                            backgroundColor: line.color,
                            bottom: 2 + (idx * 6), // Stack lines vertically from bottom
                            left: line.isStart ? '20%' : 0, // Start partway if event starts this day
                            right: line.isEnd ? '20%' : 0, // End partway if event ends this day
                          },
                        ]}
                      />
                    ))}

                    {/* Render dots above lines for single-day events */}
                    {dots.slice(0, 3).map((dot, idx) => {
                      const lineCount = Math.min(lines.length, 3);
                      const dotBottom = 2 + (lineCount * 6) + (idx * 6); // Start above lines
                      return (
                        <View
                          key={`dot-${dot.eventId}`}
                          style={[
                            styles.monthEventDot,
                            {
                              backgroundColor: dot.color,
                              bottom: dotBottom,
                            },
                          ]}
                        />
                      );
                    })}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  // Month view rendering - using Reanimated for smooth 60fps infinite scroll
  const renderMonthView = () => {
    return (
      <GestureDetector gesture={monthPanGesture}>
        <Animated.View style={{ width: '100%' }}>
          <View style={[styles.overflow, { width: '100%', height: CALENDAR_HEIGHT }]}>
            {/* Container that translates with scroll - months positioned absolutely */}
            <Animated.View
              style={[
                {
                  position: 'relative',
                  width: '100%',
                  height: CALENDAR_HEIGHT,
                },
                monthAnimatedStyle,
              ]}
            >
              {/* Render each visible month at its absolute position */}
              {visibleMonths.map((m) => (
                <View
                  key={`${m.year}-${m.month}-${m.offset}`}
                  style={{
                    position: 'absolute',
                    left: m.offset * MONTH_WIDTH,
                    width: MONTH_WIDTH,
                    height: CALENDAR_HEIGHT,
                  }}
                >
                  {renderSingleMonthView(m.year, m.month)}
                </View>
              ))}
            </Animated.View>
          </View>
        </Animated.View>
      </GestureDetector>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        {/* Custom Navigation Header */}
        <CustomNavigationHeader
        onBack={() => navigation.goBack()}
        customTitle={
          <TouchableOpacity
            onPress={() => {
              try {
                setSelectedPickerDate(masterDateTime);
                setShowDatePicker(true);
              } catch (error) {
                console.error('Error opening date picker:', error);
              }
            }}
            style={styles.headerDateButton}
          >
            <Text style={styles.headerDateText}>{masterDayTimeDate || 'Loading...'}</Text>
          </TouchableOpacity>
        }
        rightButtons={[
          {
            icon: 'ear-hearing',
            onPress: () => setShowLayersModal(true),
          },
          {
            icon: viewMode === 'day' ? 'calendar-month' : 'calendar-today',
            onPress: () => handleViewModeToggle(probeDay, probeHour24),
          },
        ]}
      />

      {viewMode === 'month' ? (
        renderMonthView()
      ) : (
        <InfiniteGrid
          externalXYFloat={externalXYFloat}
          onXYFloatChange={setExternalXYFloat}
          events={visibleEvents}
          navigation={navigation}
          groupId={groupId}
          layerPreferences={layerPreferences}
        />
      )}

      {/* Floating Action Button (both Month and Day views) */}
      {canCreate && (
        <TouchableOpacity
          style={[styles.fab, { bottom: 20 + Math.max(insets.bottom, 16) }]}
          onPress={() => setShowEventTypeModal(true)}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Date Picker */}
      <DateTimeSelector
        value={selectedPickerDate}
        onChange={handleDatePickerChange}
        format={3}
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        title="Go to Date"
      />

      {/* Event Type Choice Modal */}
      <Modal visible={showEventTypeModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[
            styles.modalContent,
            // Offset for web-admin sidebar (240px / 2 = 120px)
            Platform.OS === 'web' && { transform: [{ translateX: 120 }] }
          ]}>
            <Text style={styles.modalTitle}>Create New...</Text>
            <TouchableOpacity
              style={styles.eventTypeButton}
              onPress={() => {
                setShowEventTypeModal(false);
                // Calculate masterDateTime from probe position
                const baseDate = new Date(2023, 9, 31); // Oct 31, 2023
                const masterDateTime = new Date(baseDate);
                masterDateTime.setDate(baseDate.getDate() + probeDay);
                masterDateTime.setHours(probeHour24, 0, 0, 0);
                navigation.navigate('CreateEvent', {
                  groupId,
                  defaultStartDate: masterDateTime.toISOString()
                });
              }}
            >
              <Text style={styles.eventTypeIcon}>📅</Text>
              <View style={styles.eventTypeTextContainer}>
                <Text style={styles.eventTypeTitle}>Event</Text>
                <Text style={styles.eventTypeDescription}>
                  Meetings, appointments, reminders
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.eventTypeButton}
              onPress={() => {
                setShowEventTypeModal(false);
                // Calculate masterDateTime from probe position
                const baseDate = new Date(2023, 9, 31); // Oct 31, 2023
                const masterDateTime = new Date(baseDate);
                masterDateTime.setDate(baseDate.getDate() + probeDay);
                masterDateTime.setHours(probeHour24, 0, 0, 0);
                navigation.navigate('CreateChildEvent', {
                  groupId,
                  defaultStartDate: masterDateTime.toISOString()
                });
              }}
            >
              <Text style={styles.eventTypeIcon}>👶</Text>
              <View style={styles.eventTypeTextContainer}>
                <Text style={styles.eventTypeTitle}>Child Responsibility</Text>
                <Text style={styles.eventTypeDescription}>
                  Who's responsible for a child at this time
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cancelButton, { marginTop: 20 }]}
              onPress={() => setShowEventTypeModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Day Events Modal (Long Press on Month View) */}
      <Modal visible={showDayEventsModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[
            styles.dayEventsModalContent,
            // Offset for web-admin sidebar (240px / 2 = 120px)
            Platform.OS === 'web' && { transform: [{ translateX: 120 }] }
          ]}>
            {/* Header with date and close button */}
            <View style={styles.dayEventsHeader}>
              <Text style={styles.dayEventsTitle}>
                {selectedDayDate ? selectedDayDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                }) : ''}
              </Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowDayEventsModal(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Events list */}
            <ScrollView style={styles.dayEventsList}>
              {selectedDayEvents.length === 0 ? (
                <Text style={styles.noEventsText}>No events for this day</Text>
              ) : (
                selectedDayEvents.map((event) => {
                  const eventStart = new Date(event.startTime);
                  const eventEnd = new Date(event.endTime);
                  const isChildEvent = event.responsibilityEvents && event.responsibilityEvents.length > 0;

                  // Check if event spans multiple days
                  const startDay = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
                  const endDay = new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate());
                  const isMultiDay = endDay.getTime() > startDay.getTime();

                  return (
                    <TouchableOpacity
                      key={event.eventId}
                      style={styles.dayEventItem}
                      onPress={() => {
                        setShowDayEventsModal(false);
                        if (isChildEvent) {
                          navigation.navigate('EditChildEvent', {
                            groupId: groupId,
                            eventId: event.eventId,
                          });
                        } else {
                          navigation.navigate('EditEvent', {
                            groupId: groupId,
                            eventId: event.eventId,
                          });
                        }
                      }}
                    >
                      <View style={styles.dayEventTimeContainer}>
                        {isMultiDay ? (
                          <>
                            <Text style={styles.dayEventDate}>
                              {eventStart.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric'
                              })}
                            </Text>
                            <Text style={styles.dayEventTime}>
                              {eventStart.toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </Text>
                            <Text style={styles.dayEventTime}>to</Text>
                            <Text style={styles.dayEventDate}>
                              {eventEnd.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric'
                              })}
                            </Text>
                            <Text style={styles.dayEventTime}>
                              {eventEnd.toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </Text>
                          </>
                        ) : (
                          <>
                            <Text style={styles.dayEventTime}>
                              {eventStart.toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </Text>
                            <Text style={styles.dayEventTime}>-</Text>
                            <Text style={styles.dayEventTime}>
                              {eventEnd.toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </Text>
                          </>
                        )}
                      </View>
                      <View style={styles.dayEventInfo}>
                        <Text style={styles.dayEventTitle}>
                          {isChildEvent ? '👶 ' : '📅 '}
                          {event.title}
                        </Text>
                        {event.description && (
                          <Text style={styles.dayEventDescription} numberOfLines={2}>
                            {event.description}
                          </Text>
                        )}
                        {isChildEvent && event.responsibilityEvents && (
                          <View style={styles.childResponsibilityInfo}>
                            {event.responsibilityEvents.map((re) => (
                              <Text key={re.responsibilityEventId} style={styles.childResponsibilityText}>
                                Child: {re.child.displayName} | Responsible: {re.startResponsibleMember?.displayName || re.startResponsibleOtherName}
                              </Text>
                            ))}
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Calendar Layers Modal */}
      <CalendarLayersModal
        visible={showLayersModal}
        groupId={groupId}
        onClose={() => setShowLayersModal(false)}
        onLayersChanged={setLayerPreferences}
        onImportedCalendarsChanged={(calendars) => {
          setImportedCalendars(calendars);
          // Refetch imported events when calendars change
          fetchImportedCalendars();
        }}
      />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  // Header button styles
  headerDateButton: {
    padding: 8,
    paddingHorizontal: 12,
    minWidth: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDateText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  viewToggleText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    userSelect: 'none',
  },

  // Swipeable Month view styles
  overflow: {
    overflow: 'hidden',
  },
  monthView: {
    width: '100%',
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
    height: 24,
    alignItems: 'center',
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 14,
    color: '#778',
  },
  weekRow: {
    flexDirection: 'row',
    height: Math.floor((SCREEN_WIDTH - 6) / 7) * 2, // 2x height
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthCell: {
    flex: 1,
    height: Math.floor((SCREEN_WIDTH - 6) / 7) * 2, // 2x height
    padding: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    justifyContent: 'flex-start', // Position content at top
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  monthCellOutside: {
    backgroundColor: '#f5f5f5', // Light gray for outside days
  },
  monthTodayCell: {
    backgroundColor: '#e3f2fd', // Light blue for today
    borderColor: '#90caf9',
    borderWidth: 2,
  },
  monthMasterDateCell: {
    backgroundColor: '#f3e5f5', // Light purple for masterDateTime
    borderColor: '#6200ee',
    borderWidth: 2,
  },
  monthCellText: {
    fontSize: 12, // Small text
    color: '#222',
    marginTop: 2, // Small margin from top
  },
  monthCellTextOutside: {
    color: '#bbb', // Gray text for outside days
  },
  monthTodayText: {
    color: '#1976d2',
    fontWeight: 'bold',
  },
  monthMasterDateText: {
    color: '#6200ee',
    fontWeight: 'bold',
  },
  monthChildBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '80%', // Day number (top 20px) + child bars (60% of remaining) = ~80% total
    pointerEvents: 'none', // Don't block touch events
  },
  monthEventContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%', // Bottom 40% of cell for event indicators
    pointerEvents: 'none', // Don't block touch events
  },
  monthEventDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    left: '50%',
    marginLeft: -3, // Center the dot
  },
  monthEventLine: {
    position: 'absolute',
    height: 3,
    borderRadius: 1.5,
  },

  // Grid styles
  gridRoot: {
    flex: 1,
    backgroundColor: '#eee',
  },
  cell: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
    gap: 12,
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },

  // Floating Action Button
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6200ee',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabText: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '300',
    marginTop: -2,
  },

  // Event Type Choice Modal
  eventTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 12,
  },
  eventTypeIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  eventTypeTextContainer: {
    flex: 1,
  },
  eventTypeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  eventTypeDescription: {
    fontSize: 14,
    color: '#666',
  },

  // Day Events Modal styles
  dayEventsModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 0,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  dayEventsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  dayEventsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
    fontWeight: 'bold',
  },
  dayEventsList: {
    padding: 16,
  },
  noEventsText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 40,
  },
  dayEventItem: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3',
  },
  dayEventTimeContainer: {
    marginRight: 12,
    alignItems: 'center',
    minWidth: 70,
  },
  dayEventDate: {
    fontSize: 11,
    color: '#2196f3',
    fontWeight: 'bold',
  },
  dayEventTime: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  dayEventInfo: {
    flex: 1,
  },
  dayEventTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  dayEventDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  childResponsibilityInfo: {
    marginTop: 4,
  },
  childResponsibilityText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
});
