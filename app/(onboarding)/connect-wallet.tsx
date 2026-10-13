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

const WALLET_PROVIDERS = [
  {
    name: 'MWA' as const,
    icon: 'phone-portrait' as const,
    color: AppleColors.systemBlue,
    desc: 'Solana Mobile Wallet Adapter (Android Native)',
  },
];

export default function ConnectWalletModal() {
  const router = useRouter();
  const connectWallet = useFerasStore((state) => state.connectWallet);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const handleConnect = async (provider: typeof WALLET_PROVIDERS[number]) => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.selectionAsync();
      } catch {}
    }
    setConnectingProvider(provider.name);
    try {
      await connectWallet(provider.name);
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
        title: 'Wallet Connection Failed',
        message: error instanceof Error ? error.message : 'Unable to connect this wallet.',
      });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Connect Solana Wallet</Text>
          <Text style={styles.subtext}>
            {isMobileWalletRuntime
              ? 'Connect a Mobile Wallet Adapter compatible wallet. Feras reads live Devnet balances; every future transaction requires your wallet approval.'
              : 'Install the Android Feras development build to connect a real Devnet wallet. Expo Go cannot use Mobile Wallet Adapter.'}
          </Text>
        </View>

        <View style={styles.walletList}>
          {WALLET_PROVIDERS.map((provider) => {
            const isConnecting = connectingProvider === provider.name;
            return (
              <Card
                key={provider.name}
                style={styles.walletItem}
                onPress={isMobileWalletRuntime ? () => handleConnect(provider) : undefined}
              >
                <View
                  style={[
                    styles.walletIconCircle,
                    { backgroundColor: `${provider.color}25` },
                  ]}
                >
                  <Ionicons
                    name={provider.icon}
                    size={22}
                    color={provider.color}
                  />
                </View>

                <View style={styles.walletInfo}>
                  <Text style={styles.walletName}>{provider.name}</Text>
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
          <Text style={styles.footerNote}>
            {isMobileWalletRuntime
              ? 'DEVNET · Live public balances · Wallet signatures stay in your wallet'
              : 'ANDROID DEVELOPMENT BUILD REQUIRED · No simulated wallet is available'}
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
    marginTop: 4,
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
  walletName: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
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
  },
  footerNote: {
    ...Typography.caption1,
    color: AppleColors.labelTertiary,
    textAlign: 'center',
  },
});
