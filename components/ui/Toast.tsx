import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFerasStore } from '@/store/useFerasStore';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';

export const Toast: React.FC = () => {
  const currentToast = useFerasStore((state) => state.currentToast);
  const clearToast = useFerasStore((state) => state.clearToast);

  if (!currentToast) return null;

  const getIcon = () => {
    switch (currentToast.type) {
      case 'success':
        return <Ionicons name="checkmark-circle" size={20} color={AppleColors.systemGreen} />;
      case 'error':
        return <Ionicons name="alert-circle" size={20} color={AppleColors.systemRed} />;
      case 'info':
      default:
        return <Ionicons name="information-circle" size={20} color={AppleColors.systemBlue} />;
    }
  };

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={clearToast}
        style={styles.capsule}
      >
        <View style={styles.icon}>{getIcon()}</View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{currentToast.title}</Text>
          {currentToast.message && (
            <Text style={styles.message}>{currentToast.message}</Text>
          )}
        </View>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppleColors.secondaryBackground,
    borderRadius: Radii.pill,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    maxWidth: '90%',
  },
  icon: {
    marginRight: Spacing.sm,
  },
  textContainer: {
    flexShrink: 1,
  },
  title: {
    ...Typography.subhead,
    fontWeight: '600',
    color: AppleColors.labelPrimary,
  },
  message: {
    ...Typography.caption1,
    color: AppleColors.labelSecondary,
    marginTop: 1,
  },
});
