import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';

export type TagType =
  | 'live'
  | 'upcoming'
  | 'finished'
  | 'grandmaster'
  | 'engine'
  | 'master'
  | 'experimental'
  | 'win'
  | 'loss'
  | 'neutral';

interface TagProps {
  label: string;
  type?: TagType;
  style?: ViewStyle;
  textStyle?: TextStyle;
  showDot?: boolean;
}

export const Tag: React.FC<TagProps> = ({
  label,
  type = 'neutral',
  style,
  textStyle,
  showDot = false,
}) => {
  const getTagColors = () => {
    switch (type) {
      case 'live':
        return {
          bg: 'rgba(255, 69, 58, 0.18)',
          text: AppleColors.systemRed,
          dot: AppleColors.systemRed,
          border: 'rgba(255, 69, 58, 0.35)',
        };
      case 'upcoming':
        return {
          bg: 'rgba(255, 159, 10, 0.16)',
          text: AppleColors.systemOrange,
          dot: AppleColors.systemOrange,
          border: 'rgba(255, 159, 10, 0.3)',
        };
      case 'grandmaster':
        return {
          bg: 'rgba(191, 90, 242, 0.18)',
          text: AppleColors.systemPurple,
          dot: AppleColors.systemPurple,
          border: 'rgba(191, 90, 242, 0.35)',
        };
      case 'engine':
        return {
          bg: 'rgba(94, 92, 230, 0.18)',
          text: AppleColors.systemIndigo,
          dot: AppleColors.systemIndigo,
          border: 'rgba(94, 92, 230, 0.35)',
        };
      case 'master':
        return {
          bg: 'rgba(10, 132, 255, 0.16)',
          text: AppleColors.systemBlue,
          dot: AppleColors.systemBlue,
          border: 'rgba(10, 132, 255, 0.3)',
        };
      case 'experimental':
        return {
          bg: 'rgba(100, 210, 255, 0.16)',
          text: AppleColors.systemTeal,
          dot: AppleColors.systemTeal,
          border: 'rgba(100, 210, 255, 0.3)',
        };
      case 'win':
        return {
          bg: 'rgba(48, 209, 88, 0.16)',
          text: AppleColors.systemGreen,
          dot: AppleColors.systemGreen,
          border: 'rgba(48, 209, 88, 0.3)',
        };
      case 'loss':
        return {
          bg: 'rgba(255, 69, 58, 0.16)',
          text: AppleColors.systemRed,
          dot: AppleColors.systemRed,
          border: 'rgba(255, 69, 58, 0.3)',
        };
      case 'finished':
      case 'neutral':
      default:
        return {
          bg: AppleColors.fillSecondary,
          text: AppleColors.labelSecondary,
          dot: AppleColors.labelSecondary,
          border: AppleColors.cardBorder,
        };
    }
  };

  const colors = getTagColors();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.bg, borderColor: colors.border },
        style,
      ]}
    >
      {(showDot || type === 'live') && (
        <View style={[styles.dot, { backgroundColor: colors.dot }]} />
      )}
      <Text style={[styles.text, { color: colors.text }, textStyle]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radii.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  text: {
    ...Typography.caption2,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
