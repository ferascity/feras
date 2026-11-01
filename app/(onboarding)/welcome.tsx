import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  Image,
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
    badge: 'AUTONOMOUS ARENA',
    color: AppleColors.brandEmerald,
    title: 'Autonomous AI Grandmasters',
    description:
      'Continuous on-chain chess tournament rounds between neural engines with verifiable moves and sub-second execution.',
  },
  {
    icon: 'stats-chart-outline' as const,
    badge: 'LIVE PREDICTIONS',
    color: AppleColors.brandCyan,
    title: 'Dynamic Win Probability',
    description:
      'Live engine evaluations, move-by-move telemetry, and automated liquidity odds updating with every board state.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    badge: 'SOLANA DEVNET',
    color: AppleColors.systemBlue,
    title: '1-Tap Self-Custodial Wallet',
    description:
      'Sign in with Google or Apple. An embedded Solana Devnet wallet is generated automatically with zero seed phrase friction.',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const [slideIndex, setSlideIndex] = useState(0);

  const currentSlide = SLIDES[slideIndex];

  const handleNextSlide = () => {
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
        {/* Minimalist Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.brandBadge}>
            <View style={styles.livePulseDot} />
            <Text style={styles.brandBadgeText}>DEVNET V1.0</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)')}
            style={styles.skipBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* Hero Section with Official Logo */}
        <View style={styles.heroSection}>
          <View style={styles.logoContainer}>
            <Image
              source={require('@/assets/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandTitle}>FERAS</Text>
          <Text style={styles.brandSubtitle}>
            AUTONOMOUS CHESS ENGINE PROTOCOL
          </Text>
        </View>

        {/* Feature Carousel Card */}
        <View style={styles.featureCard}>
          <View style={styles.slideHeader}>
            <View
              style={[
                styles.iconBox,
                { backgroundColor: `${currentSlide.color}15` },
              ]}
            >
              <Ionicons
                name={currentSlide.icon}
                size={26}
                color={currentSlide.color}
              />
            </View>
            <View style={styles.badgePill}>
              <Text
                style={[
                  styles.badgePillText,
                  { color: currentSlide.color },
                ]}
              >
                {currentSlide.badge}
              </Text>
            </View>
          </View>

          <Text style={styles.slideTitle}>{currentSlide.title}</Text>
          <Text style={styles.slideDesc}>{currentSlide.description}</Text>

          {/* Dots Indicator */}
          <View style={styles.dotsRow}>
            {SLIDES.map((_, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => setSlideIndex(idx)}
                activeOpacity={0.8}
                style={[
                  styles.dot,
                  idx === slideIndex && styles.activeDot,
                ]}
              />
            ))}
          </View>
        </View>

        {/* Bottom CTAs */}
        <View style={styles.bottomSection}>
          <Button
            title="Sign In with Google or Apple"
            onPress={() => router.push('/(onboarding)/connect-wallet')}
            variant="primary"
            size="lg"
            style={styles.primaryBtn}
          />

          <Button
            title={slideIndex === SLIDES.length - 1 ? 'Explore Arena as Guest' : 'Next Feature'}
            onPress={handleNextSlide}
            variant="secondary"
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
    paddingBottom: Platform.OS === 'ios' ? Spacing.lg : Spacing.xl,
    paddingTop: Spacing.sm,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppleColors.brandEmerald,
    marginRight: 6,
  },
  brandBadgeText: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  skipBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  skipText: {
    ...Typography.subheadline,
    color: AppleColors.labelSecondary,
  },
  heroSection: {
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: AppleColors.secondaryBackground,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  logoImage: {
    width: 52,
    height: 52,
  },
  brandTitle: {
    ...Typography.title1,
    color: AppleColors.labelPrimary,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  brandSubtitle: {
    ...Typography.caption1,
    color: AppleColors.labelTertiary,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  featureCard: {
    backgroundColor: AppleColors.secondaryBackground,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
    padding: Spacing.xl,
    marginVertical: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  slideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  badgePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: Radii.pill,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  slideTitle: {
    ...Typography.title3,
    color: AppleColors.labelPrimary,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  slideDesc: {
    ...Typography.callout,
    color: AppleColors.labelSecondary,
    lineHeight: 22,
    marginBottom: Spacing.lg,
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginHorizontal: 4,
  },
  activeDot: {
    width: 24,
    backgroundColor: AppleColors.labelPrimary,
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
