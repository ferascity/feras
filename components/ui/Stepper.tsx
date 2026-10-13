import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';

interface StepperProps {
  steps: string[];
  currentStep: number; // 0-indexed
  style?: ViewStyle;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  currentStep,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      {steps.map((label, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;

        return (
          <React.Fragment key={label}>
            {/* Step Node */}
            <View style={styles.stepNode}>
              <View
                style={[
                  styles.circle,
                  isCompleted && styles.completedCircle,
                  isActive && styles.activeCircle,
                ]}
              >
                {isCompleted ? (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      isActive && styles.activeStepNumber,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  (isActive || isCompleted) && styles.activeLabel,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>

            {/* Connecting line */}
            {index < steps.length - 1 && (
              <View
                style={[
                  styles.line,
                  isCompleted && styles.completedLine,
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  stepNode: {
    alignItems: 'center',
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppleColors.fillSecondary,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  completedCircle: {
    backgroundColor: AppleColors.systemGreen,
    borderColor: AppleColors.systemGreen,
  },
  activeCircle: {
    backgroundColor: AppleColors.systemBlue,
    borderColor: AppleColors.systemBlue,
  },
  stepNumber: {
    ...Typography.caption2,
    fontWeight: '700',
    color: AppleColors.labelTertiary,
  },
  activeStepNumber: {
    color: '#FFFFFF',
  },
  label: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
    fontSize: 10,
    fontWeight: '500',
  },
  activeLabel: {
    color: AppleColors.labelPrimary,
    fontWeight: '600',
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: AppleColors.separator,
    marginHorizontal: 6,
    marginBottom: 16,
  },
  completedLine: {
    backgroundColor: AppleColors.systemGreen,
  },
});
