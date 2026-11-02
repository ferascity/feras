import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useFerasStore } from '@/store/useFerasStore';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';
import { WalletName } from '@/services/wallet/IWalletService';

export function AuthBottomSheet() {
  const isOpen = useFerasStore((state) => state.isAuthSheetOpen);
  const close = useFerasStore((state) => state.closeAuthSheet);
  const connectWallet = useFerasStore((state) => state.connectWallet);
  const showToast = useFerasStore((state) => state.showToast);

  const [connectingProvider, setConnectingProvider] = useState<WalletName | null>(null);
  const [email, setEmail] = useState('');
  const [showEmailInput, setShowEmailInput] = useState(false);

  const handleConnect = async (provider: WalletName) => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.selectionAsync();
      } catch {}
    }

    setConnectingProvider(provider);
    try {
      await connectWallet(provider);
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
      }
      showToast({
        type: 'success',
        title: 'Wallet Connected',
        message: `Signed in with ${provider}. Real Solana Devnet keypair active.`,
      });
      close();
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Sign In Failed',
        message: error instanceof Error ? error.message : 'Unable to complete sign in.',
      });
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleEmailSubmit = async () => {
    if (!email || !email.includes('@')) {
      showToast({
        type: 'error',
        title: 'Invalid Email',
        message: 'Please enter a valid email address.',
      });
      return;
    }
    await handleConnect('Email');
  };

  return (
    <BottomSheet
      visible={isOpen}
      onClose={close}
      title=""
      subtitle=""
    >
      <View style={styles.container}>
        {/* Brand Header */}
        <View style={styles.brandContainer}>
          <View style={styles.logoSquircle}>
            <Image
              source={require('@/assets/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandTitle}>Sign in to Feras</Text>
          <Text style={styles.brandSubtitle}>
            Instant non-custodial Solana Devnet wallet generated on sign-in. No seed phrases needed.
          </Text>
        </View>

        {/* Auth Buttons */}
        <View style={styles.buttonStack}>
          {/* 1-Tap Google Button (Hero Primary) */}
          <TouchableOpacity
            style={[styles.authButton, styles.googleButton]}
            onPress={() => handleConnect('Google')}
            activeOpacity={0.85}
            disabled={connectingProvider !== null}
          >
            <View style={styles.buttonLeft}>
              <View style={styles.googleIconBg}>
                <Ionicons name="logo-google" size={18} color="#EA4335" />
              </View>
              <View>
                <View style={styles.titleRow}>
                  <Text style={styles.authButtonTitle}>Continue with Google</Text>
                  <View style={styles.recommendedBadge}>
                    <Text style={styles.recommendedText}>1-TAP</Text>
                  </View>
                </View>
                <Text style={styles.authButtonSub}>Instant cryptographic Solana wallet</Text>
              </View>
            </View>
            {connectingProvider === 'Google' ? (
              <ActivityIndicator size="small" color={AppleColors.brandEmerald} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={AppleColors.labelTertiary} />
            )}
          </TouchableOpacity>

          {/* 1-Tap Apple Button */}
          <TouchableOpacity
            style={[styles.authButton, styles.appleButton]}
            onPress={() => handleConnect('Apple')}
            activeOpacity={0.85}
            disabled={connectingProvider !== null}
          >
            <View style={styles.buttonLeft}>
              <View style={styles.appleIconBg}>
                <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.authButtonTitle}>Continue with Apple</Text>
                <Text style={styles.authButtonSub}>Sign in securely with your Apple ID</Text>
              </View>
            </View>
            {connectingProvider === 'Apple' ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={AppleColors.labelTertiary} />
            )}
          </TouchableOpacity>

          {/* Passwordless Email Option */}
          {!showEmailInput ? (
            <TouchableOpacity
              style={[styles.authButton, styles.emailButton]}
              onPress={() => setShowEmailInput(true)}
              activeOpacity={0.85}
              disabled={connectingProvider !== null}
            >
              <View style={styles.buttonLeft}>
                <View style={styles.emailIconBg}>
                  <Ionicons name="mail-outline" size={18} color={AppleColors.brandCyan} />
                </View>
                <View>
                  <Text style={styles.authButtonTitle}>Continue with Email</Text>
                  <Text style={styles.authButtonSub}>Passwordless magic link</Text>
                </View>
              </View>
              <Ionicons name="chevron-down" size={18} color={AppleColors.labelTertiary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.emailInputCard}>
              <View style={styles.emailInputRow}>
                <Ionicons name="mail-outline" size={18} color={AppleColors.brandCyan} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.textInput}
                  placeholder="name@example.com"
                  placeholderTextColor={AppleColors.labelTertiary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.submitArrowBtn}
                  onPress={handleEmailSubmit}
                  disabled={connectingProvider !== null}
                >
                  {connectingProvider === 'Email' ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Security & Non-Custodial Guarantee */}
        <View style={styles.securityBadge}>
          <Ionicons name="shield-checkmark-outline" size={14} color={AppleColors.brandEmerald} />
          <Text style={styles.securityText}>
            Self-custodial · Cryptographic ed25519 Keypair generated securely on your device.
          </Text>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  logoSquircle: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: AppleColors.cardElevated,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  logoImage: {
    width: 38,
    height: 38,
  },
  brandTitle: {
    ...Typography.title2,
    color: AppleColors.labelPrimary,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: Spacing.md,
    lineHeight: 18,
  },
  buttonStack: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  authButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AppleColors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: AppleColors.border,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
  },
  googleButton: {
    borderColor: 'rgba(16, 185, 129, 0.35)',
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
  },
  appleButton: {
    backgroundColor: AppleColors.card,
  },
  emailButton: {
    backgroundColor: AppleColors.card,
  },
  buttonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  googleIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(234, 67, 53, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  appleIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E2228',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  emailIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authButtonTitle: {
    ...Typography.body,
    fontWeight: '700',
    color: AppleColors.labelPrimary,
  },
  recommendedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  recommendedText: {
    fontSize: 9,
    fontWeight: '800',
    color: AppleColors.brandEmerald,
    letterSpacing: 0.5,
  },
  authButtonSub: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    marginTop: 2,
  },
  emailInputCard: {
    backgroundColor: AppleColors.cardElevated,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    padding: Spacing.sm,
  },
  emailInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    ...Typography.body,
    color: AppleColors.labelPrimary,
    paddingVertical: 8,
  },
  submitArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: AppleColors.brandCyan,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.xs,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.18)',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    gap: 8,
  },
  securityText: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    flex: 1,
    lineHeight: 16,
  },
});
