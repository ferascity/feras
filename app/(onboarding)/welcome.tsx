import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Button } from '@/components/ui/Button';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';

const SLIDES = [
  {
    icon: 'hardware-chip-outline' as const,
    color: AppleColors.systemBlue,
    title: 'Autonomous Chess Agents',
    description:
      'Witness state-of-the-art neural engines and LLM-guided grandmasters battle in continuous tournaments with sub-second latency.',
  },
  {
    icon: 'game-controller-outline' as const,
    color: AppleColors.systemGreen,
    title: 'High-Precision Live Replay',
    description:
      'Spectate live move-by-move replays with real-time win probability evaluation bars, move commentary, and tactical diagnostics.',
  },
  {
    icon: 'wallet-outline' as const,
    color: AppleColors.systemOrange,
    title: 'Devnet Market Positions',
    description:
      'Explore simulated USDC market positions around autonomous matches, with auditable settlement planned for Solana devnet.',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const [slideIndex, setSlideIndex] = useState(0);

  const currentSlide = SLIDES[slideIndex];

  const handleNext = () => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.selectionAsync();
      } catch {}
    }
    if (slideIndex < SLIDES.length - 1) {
      setSlideIndex((prev) => prev + 1);
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Skip button */}
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)')}
          style={styles.skipBtn}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>

        {/* Feature Visual */}
        <View style={styles.centerSection}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: `${currentSlide.color}20` },
            ]}
          >
            <Ionicons
              name={currentSlide.icon}
              size={54}
              color={currentSlide.color}
            />
          </View>
          <Text style={styles.slideTitle}>{currentSlide.title}</Text>
          <Text style={styles.slideDesc}>{currentSlide.description}</Text>
        </View>

        {/* Pagination Dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                idx === slideIndex && styles.activeDot,
              ]}
            />
          ))}
        </View>

        {/* Action Buttons */}
        <View style={styles.bottomSection}>
          <Button
            title={slideIndex === SLIDES.length - 1 ? 'Enter Arena' : 'Continue'}
            onPress={handleNext}
            variant="primary"
            size="lg"
            style={styles.primaryBtn}
          />
          <Button
            title="Connect Solana Wallet"
            onPress={() => router.push('/(onboarding)/connect-wallet')}
            variant="glass"
            size="md"
            style={styles.secondaryBtn}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AppleColors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'space-between',
    paddingBottom: Spacing.xl,
  },
  skipBtn: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  skipText: {
    ...Typography.body,
    color: AppleColors.labelSecondary,
  },
  centerSection: {
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  iconCircle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
  },
  slideTitle: {
    ...Typography.title1,
    color: AppleColors.labelPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  slideDesc: {
    ...Typography.callout,
    color: AppleColors.labelSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppleColors.fillSecondary,
    marginHorizontal: 4,
  },
  activeDot: {
    width: 24,
    backgroundColor: AppleColors.systemBlue,
  },
  bottomSection: {
    width: '100%',
  },
  primaryBtn: {
    width: '100%',
    marginBottom: Spacing.sm,
  },
  secondaryBtn: {
    width: '100%',
  },
});
