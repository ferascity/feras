import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFerasStore } from '@/store/useFerasStore';
import { Card } from '@/components/ui/Card';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';
import { isMobileWalletRuntime } from '@/services/wallet';
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
    badge: 'Fastest',
    desc: 'Instant self-custodial Solana wallet. No seed phrase required.',
    recommended: true,
  },
  {
    id: 'Apple',
    name: 'Continue with Apple',
    icon: 'logo-apple',
    color: AppleColors.labelPrimary,
    desc: 'Sign in securely with Apple ID. Native on iOS.',
  },
  {
    id: 'Email',
    name: 'Continue with Email',
    icon: 'mail',
    color: AppleColors.systemBlue,
    desc: 'Passwordless one-time verification code to your inbox.',
  },
  {
    id: 'MWA',
    name: 'External Wallet (MWA)',
    icon: 'phone-portrait',
    color: AppleColors.systemPurple,
    desc: isMobileWalletRuntime
      ? 'Connect Phantom or Solflare via Mobile Wallet Adapter'
      : 'Requires Android development build (Phantom / Solflare)',
  },
];

export default function ConnectWalletModal() {
  const router = useRouter();
  const connectWallet = useFerasStore((state) => state.connectWallet);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const handleConnect = async (provider: ProviderOption) => {
    if (provider.id === 'MWA' && !isMobileWalletRuntime) {
      useFerasStore.getState().showToast({
        type: 'info',
        title: 'Android Build Required',
        message: 'External Mobile Wallet Adapter requires an Android development build. Try Google or Apple sign-in instead.',
      });
      return;
    }

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
        <View style={styles.header}>
          <Text style={styles.title}>Sign In to Feras</Text>
          <Text style={styles.subtext}>
            Connect your self-custodial Solana wallet in one tap. Your wallet is created instantly and secured with multi-party computation.
          </Text>
        </View>

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
                    { backgroundColor: `${provider.color}18` },
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
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{provider.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.walletDesc}>{provider.desc}</Text>
                </View>

                {isConnecting ? (
                  <ActivityIndicator size="small" color={AppleColors.systemBlue} />
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

        <View style={styles.footer}>
          <View style={styles.guaranteeRow}>
            <Ionicons name="shield-checkmark" size={14} color={AppleColors.systemGreen} />
            <Text style={styles.guaranteeText}>
              Non-custodial · Solana Devnet · Multi-Party Computation
            </Text>
          </View>
          <Text style={styles.footerNote}>
            Feras never has access to your private keys or personal credentials.
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
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    justifyContent: 'space-between',
    paddingBottom: Spacing.xl,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.title1,
    color: AppleColors.labelPrimary,
  },
  subtext: {
    ...Typography.subhead,
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
    borderRadius: Radii.lg,
  },
  recommendedItem: {
    borderColor: 'rgba(234, 67, 53, 0.3)',
    borderWidth: 1,
  },
  walletIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  walletInfo: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walletName: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
  },
  badge: {
    backgroundColor: 'rgba(234, 67, 53, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EA4335',
    textTransform: 'uppercase',
  },
  walletDesc: {
    ...Typography.caption1,
    color: AppleColors.labelSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: 6,
  },
  guaranteeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  guaranteeText: {
    ...Typography.caption1,
    color: AppleColors.systemGreen,
    fontWeight: '600',
  },
  footerNote: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
    textAlign: 'center',
  },
});
