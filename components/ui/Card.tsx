import React from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { AppleColors } from '@/theme/colors';
import { Radii, Spacing } from '@/theme/spacing';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  variant?: 'grouped' | 'elevated' | 'glass';
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  onPress,
  variant = 'grouped',
}) => {
  const getBackgroundColor = () => {
    switch (variant) {
      case 'elevated':
        return AppleColors.elevatedBackground;
      case 'glass':
        return AppleColors.glassSurface;
      case 'grouped':
      default:
        return AppleColors.secondaryBackground;
    }
  };

  const cardStyle: ViewStyle = {
    backgroundColor: getBackgroundColor(),
    borderRadius: Radii.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
  };

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={[cardStyle, styles.shadow, style]}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={[cardStyle, styles.shadow, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
});
