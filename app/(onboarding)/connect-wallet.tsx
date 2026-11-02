import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFerasStore } from '@/store/useFerasStore';
import { Card } from '@/components/ui/Card';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';
import { WalletName } from '@/services/wallet/IWalletService';

interface ProviderOption {
  id: WalletName;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  badge?: string;
  desc: string;
  recommended?: boolean;
}

const WALLET_PROVIDERS: ProviderOption[] = [
  {
    id: 'Google',
    name: 'Continue with Google',
    icon: 'logo-google',
    color: '#EA4335',
    badge: '1-Tap Solana Wallet',
    desc: 'Instant cryptographic Solana Devnet wallet generated on sign-in.',
    recommended: true,
  },
  {
    id: 'Apple',
    name: 'Continue with Apple',
    icon: 'logo-apple',
    color: AppleColors.labelPrimary,
    badge: 'Native iOS',
    desc: 'Sign in securely with Apple ID. Generates self-custodial Solana keypair.',
  },
  {
    id: 'Email',
    name: 'Continue with Email',
    icon: 'mail-outline',
    color: AppleColors.brandCyan,
    desc: 'Passwordless sign-in with your email address.',
  },
];

export default function ConnectWalletModal() {
  const router = useRouter();
  const connectWallet = useFerasStore((state) => state.connectWallet);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const handleConnect = async (provider: ProviderOption) => {

    if (Platform.OS !== 'web') {
      try {
        Haptics.selectionAsync();
      } catch {}
    }

    setConnectingProvider(provider.id);
    try {
      await connectWallet(provider.id);
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
      }
      useFerasStore.getState().showToast({
        type: 'success',
        title: 'Wallet Connected',
        message: `Signed in with ${provider.name.replace('Continue with ', '')}.`,
      });
      router.back();
    } catch (error) {
      setConnectingProvider(null);
      useFerasStore.getState().showToast({
        type: 'error',
        title: 'Sign In Failed',
        message: error instanceof Error ? error.message : 'Unable to complete sign in.',
      });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header with Logo */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <View style={styles.logoContainer}>
              <Image
                source={require('@/assets/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <View>
              <Text style={styles.title}>Sign In to Feras</Text>
              <Text style={styles.protocolBadge}>SELF-CUSTODIAL SOLANA DEVNET</Text>
            </View>
          </View>
          <Text style={styles.subtext}>
            Connect in one tap. Your cryptographic ed25519 Solana wallet is generated automatically for instant predictions.
          </Text>
        </View>

        {/* Provider List */}
        <View style={styles.walletList}>
          {WALLET_PROVIDERS.map((provider) => {
            const isConnecting = connectingProvider === provider.id;
            return (
              <Card
                key={provider.id}
                style={StyleSheet.flatten([
                  styles.walletItem,
                  provider.recommended && styles.recommendedItem,
                ])}
                onPress={() => handleConnect(provider)}
              >
                <View
                  style={[
                    styles.walletIconCircle,
                    { backgroundColor: `${provider.color}15` },
                  ]}
                >
                  <Ionicons
                    name={provider.icon}
                    size={22}
                    color={provider.color}
                  />
                </View>

                <View style={styles.walletInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.walletName}>{provider.name}</Text>
                    {provider.badge && (
                      <View
                        style={[
                          styles.badge,
                          provider.recommended && styles.recommendedBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            provider.recommended && styles.recommendedBadgeText,
                          ]}
                        >
                          {provider.badge}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.walletDesc}>{provider.desc}</Text>
                </View>

                {isConnecting ? (
                  <ActivityIndicator size="small" color={AppleColors.brandEmerald} />
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={AppleColors.labelTertiary}
                  />
                )}
              </Card>
            );
          })}
        </View>

        {/* Footer Guarantee */}
        <View style={styles.footer}>
          <View style={styles.guaranteeRow}>
            <Ionicons name="shield-checkmark" size={15} color={AppleColors.brandEmerald} />
            <Text style={styles.guaranteeText}>
              Non-custodial · Cryptographic ed25519 · Solana Devnet
            </Text>
          </View>
          <Text style={styles.footerNote}>
            Feras never stores or transmits private keys. Your wallet persists securely on your device.
          </Text>
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    justifyContent: 'space-between',
    paddingBottom: Spacing.xl,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  logoContainer: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: AppleColors.secondaryBackground,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  logoImage: {
    width: 30,
    height: 30,
  },
  title: {
    ...Typography.title2,
    color: AppleColors.labelPrimary,
    fontWeight: '800',
  },
  protocolBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: AppleColors.brandEmerald,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  subtext: {
    ...Typography.callout,
    color: AppleColors.labelSecondary,
    marginTop: 6,
    lineHeight: 20,
  },
  walletList: {
    flex: 1,
  },
  walletItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: 18,
    backgroundColor: AppleColors.secondaryBackground,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
  },
  recommendedItem: {
    borderColor: 'rgba(16, 185, 129, 0.35)',
    backgroundColor: 'rgba(18, 19, 22, 0.95)',
  },
  walletIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  walletInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 3,
  },
  walletName: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  recommendedBadge: {
    backgroundColor: AppleColors.brandEmeraldSoft,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: AppleColors.labelSecondary,
  },
  recommendedBadgeText: {
    color: AppleColors.brandEmerald,
  },
  walletDesc: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
    lineHeight: 16,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingTop: Spacing.md,
    alignItems: 'center',
  },
  guaranteeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  guaranteeText: {
    ...Typography.caption1,
    color: AppleColors.labelPrimary,
    fontWeight: '600',
  },
  footerNote: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
    textAlign: 'center',
    lineHeight: 16,
  },
});
