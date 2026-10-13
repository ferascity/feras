import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';

interface SegmentedControlProps<T extends string> {
  values: { label: string; value: T }[];
  selectedValue: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
}

export function SegmentedControl<T extends string>({
  values,
  selectedValue,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  const handleSelect = (val: T) => {
    if (val === selectedValue) return;
    if (Platform.OS !== 'web') {
      try {
        Haptics.selectionAsync();
      } catch {}
    }
    onChange(val);
  };

  return (
    <View style={[styles.container, style]}>
      {values.map((item) => {
        const isSelected = item.value === selectedValue;
        return (
          <TouchableOpacity
            key={item.value}
            activeOpacity={0.8}
            onPress={() => handleSelect(item.value)}
            style={[styles.segment, isSelected && styles.activeSegment]}
          >
            <Text
              style={[
                styles.segmentText,
                isSelected ? styles.activeSegmentText : styles.inactiveSegmentText,
              ]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: AppleColors.fillSecondary,
    borderRadius: Radii.sm,
    padding: 3,
    alignItems: 'center',
  },
  segment: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.xs,
  },
  activeSegment: {
    backgroundColor: AppleColors.elevatedBackground,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppleColors.cardBorder,
  },
  segmentText: {
    ...Typography.footnote,
    fontWeight: '500',
  },
  activeSegmentText: {
    color: AppleColors.labelPrimary,
    fontWeight: '600',
  },
  inactiveSegmentText: {
    color: AppleColors.labelSecondary,
  },
});
