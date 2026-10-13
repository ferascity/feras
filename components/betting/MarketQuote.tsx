import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';

interface MarketQuoteProps {
  label: string;
  estimatedMultiplier: number;
  onPress?: () => void;
  selected?: boolean;
  style?: ViewStyle;
}

export function MarketQuote({
  label,
  estimatedMultiplier,
  onPress,
  selected = false,
  style,
}: MarketQuoteProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.container, selected && styles.selectedContainer, style]}
    >
      <Text style={[styles.label, selected && styles.selectedText]}>{label}</Text>
      <View style={styles.quoteRow}>
        <Text style={[styles.multiplier, selected && styles.selectedText]}>
          {estimatedMultiplier.toFixed(2)}x
        </Text>
        <Text style={styles.estimateLabel}>EST.</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
    backgroundColor: AppleColors.fillSecondary,
  },
  selectedContainer: {
    borderColor: AppleColors.systemBlue,
    backgroundColor: '#0A84FF26',
  },
  label: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  quoteRow: { alignItems: 'center' },
  multiplier: { ...Typography.numericMedium, color: AppleColors.labelPrimary },
  estimateLabel: { ...Typography.caption2, color: AppleColors.labelTertiary, marginTop: 1 },
  selectedText: { color: AppleColors.systemBlue },
});
