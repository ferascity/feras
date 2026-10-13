import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, TouchTarget, Spacing } from '@/theme/spacing';

export type ButtonVariant = 'primary' | 'tinted' | 'secondary' | 'destructive' | 'glass';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
  textStyle,
}) => {
  const handlePress = () => {
    if (disabled || loading) return;
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    }
    onPress();
  };

  const getVariantStyles = (): { container: ViewStyle; text: TextStyle } => {
    switch (variant) {
      case 'tinted':
        return {
          container: {
            backgroundColor: 'rgba(10, 132, 255, 0.15)',
          },
          text: {
            color: AppleColors.systemBlue,
          },
        };
      case 'secondary':
        return {
          container: {
            backgroundColor: AppleColors.tertiaryBackground,
            borderWidth: 1,
            borderColor: AppleColors.cardBorder,
          },
          text: {
            color: AppleColors.labelPrimary,
          },
        };
      case 'destructive':
        return {
          container: {
            backgroundColor: 'rgba(255, 69, 58, 0.15)',
            borderWidth: 1,
            borderColor: 'rgba(255, 69, 58, 0.3)',
          },
          text: {
            color: AppleColors.systemRed,
          },
        };
      case 'glass':
        return {
          container: {
            backgroundColor: AppleColors.glassSurface,
            borderWidth: 1,
            borderColor: AppleColors.cardBorder,
          },
          text: {
            color: AppleColors.labelPrimary,
          },
        };
      case 'primary':
      default:
        return {
          container: {
            backgroundColor: AppleColors.systemBlue,
          },
          text: {
            color: '#FFFFFF',
          },
        };
    }
  };

  const getSizeStyles = (): { container: ViewStyle; text: TextStyle } => {
    switch (size) {
      case 'sm':
        return {
          container: {
            paddingVertical: 6,
            paddingHorizontal: Spacing.sm,
            borderRadius: Radii.sm,
            minHeight: 32,
          },
          text: {
            ...Typography.footnote,
            fontWeight: '600',
          },
        };
      case 'lg':
        return {
          container: {
            paddingVertical: 14,
            paddingHorizontal: Spacing.xl,
            borderRadius: Radii.lg,
            minHeight: 52,
          },
          text: {
            ...Typography.headline,
            fontWeight: '600',
          },
        };
      case 'md':
      default:
        return {
          container: {
            paddingVertical: 10,
            paddingHorizontal: Spacing.md,
            borderRadius: Radii.md,
            minHeight: TouchTarget.minHeight,
          },
          text: {
            ...Typography.body,
            fontWeight: '600',
          },
        };
    }
  };

  const vStyle = getVariantStyles();
  const sStyle = getSizeStyles();

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={handlePress}
      disabled={disabled || loading}
      style={[
        styles.base,
        vStyle.container,
        sStyle.container,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? '#FFFFFF' : AppleColors.systemBlue}
        />
      ) : (
        <>
          {icon}
          <Text
            style={[
              vStyle.text,
              sStyle.text,
              icon ? { marginLeft: Spacing.xs } : null,
              disabled && styles.disabledText,
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  disabledText: {
    color: AppleColors.labelTertiary,
  },
});
