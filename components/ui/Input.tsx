import React from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing, TouchTarget } from '@/theme/spacing';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  onClear?: () => void;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  leftIcon,
  containerStyle,
  value,
  onClear,
  ...rest
}) => {
  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputContainer, error ? styles.errorBorder : null]}>
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
        <TextInput
          placeholderTextColor={AppleColors.labelTertiary}
          style={[styles.input, leftIcon ? { paddingLeft: 0 } : null]}
          value={value}
          selectionColor={AppleColors.systemBlue}
          {...rest}
        />
        {value && onClear && (
          <TouchableOpacity onPress={onClear} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={18} color={AppleColors.labelTertiary} />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.md,
  },
  label: {
    ...Typography.subhead,
    fontWeight: '500',
    color: AppleColors.labelSecondary,
    marginBottom: Spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppleColors.fill,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
    minHeight: TouchTarget.minHeight,
    paddingHorizontal: Spacing.md,
  },
  errorBorder: {
    borderColor: AppleColors.systemRed,
  },
  leftIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    ...Typography.body,
    color: AppleColors.labelPrimary,
    paddingVertical: Spacing.sm,
  },
  clearBtn: {
    padding: 4,
  },
  errorText: {
    ...Typography.caption1,
    color: AppleColors.systemRed,
    marginTop: 4,
  },
});
