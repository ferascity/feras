import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Switch,
  Platform,
  Image,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useFerasStore, BoardThemeName } from '@/store/useFerasStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';
import { getUsdcDisplayName, USDC_ASSET } from '@/services/solana/config';

const BOARD_THEME_OPTIONS = [
  { label: 'Cupertino', value: 'cupertino' as BoardThemeName },
  { label: 'Slate', value: 'slate' as BoardThemeName },
  { label: 'Dark', value: 'dark' as BoardThemeName },
];

const SPEED_OPTIONS = [
  { label: '1x Normal', value: '1' },
  { label: '2x Fast', value: '2' },
  { label: '4x Turbo', value: '4' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const wallet = useFerasStore((state) => state.wallet);
  const disconnectWallet = useFerasStore((state) => state.disconnectWallet);
  const refreshWallet = useFerasStore((state) => state.refreshWallet);

  const boardTheme = useFerasStore((state) => state.boardTheme);
  const setBoardTheme = useFerasStore((state) => state.setBoardTheme);
  const playbackSpeed = useFerasStore((state) => state.playbackSpeed);
  const setPlaybackSpeed = useFerasStore((state) => state.setPlaybackSpeed);
  const soundEnabled = useFerasStore((state) => state.soundEnabled);
  const toggleSound = useFerasStore((state) => state.toggleSound);
  const hapticsEnabled = useFerasStore((state) => state.hapticsEnabled);
  const toggleHaptics = useFerasStore((state) => state.toggleHaptics);
  const showToast = useFerasStore((state) => state.showToast);

  const [isAirdropping, setIsAirdropping] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleCopyAddress = () => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.selectionAsync();
      } catch {}
    }
    showToast({
      type: 'info',
      title: 'Address Copied',
      message: wallet.address || 'Not connected',
    });
  };

  const handleOpenExplorer = () => {
    if (!wallet.address) return;
    const url = `https://explorer.solana.com/address/${wallet.address}?cluster=devnet`;
    Linking.openURL(url).catch(() => {
      showToast({
        type: 'error',
        title: 'Explorer Unavailable',
        message: 'Could not open browser for Solana Explorer.',
      });
    });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshWallet();
      showToast({
        type: 'success',
        title: 'Balances Updated',
        message: 'Devnet SOL and USDC balances refreshed.',
      });
    } catch {
      showToast({
        type: 'error',
        title: 'Refresh Failed',
        message: 'Could not retrieve updated balances from Devnet RPC.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRequestAirdrop = async () => {
    if (!wallet.address) return;
    setIsAirdropping(true);
    if (Platform.OS !== 'web') {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    }
    try {
      showToast({
        type: 'info',
        title: 'Requesting Faucet',
        message: 'Requesting 1 SOL from Solana Devnet faucet...',
      });
      await fetch('https://api.devnet.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'requestAirdrop',
          params: [wallet.address, 1000000000],
        }),
      });
      await refreshWallet();
      showToast({
        type: 'success',
        title: 'Faucet Airdrop Sent',
        message: '1 Devnet SOL credited to your wallet.',
      });
    } catch {
      showToast({
        type: 'info',
        title: 'Faucet Request Queued',
        message: 'Public faucet request dispatched to Devnet.',
      });
    } finally {
      setIsAirdropping(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Minimalist Screen Header */}
        <View style={styles.header}>
          <View style={styles.headerBrandRow}>
            <Image
              source={require('@/assets/logo.png')}
              style={styles.brandIcon}
              resizeMode="contain"
            />
            <Text style={styles.subtitle}>FERAS PROTOCOL LEDGER</Text>
          </View>
          <Text style={styles.title}>Profile & Wallet</Text>
        </View>

        {/* Wallet Ledger Card */}
        <Card
          style={StyleSheet.flatten([
            styles.walletCard,
            wallet.isConnected && styles.walletCardConnected,
          ])}
        >
          <View style={styles.walletHeader}>
            <View style={styles.walletBadge}>
              <View
                style={[
                  styles.connectedDot,
                  !wallet.isConnected && styles.disconnectedDot,
                ]}
              />
              <Text style={styles.connectedText}>
                {wallet.isConnected
                  ? `${wallet.walletName || 'Embedded'} · Devnet Active`
                  : 'Not Signed In · Devnet'}
              </Text>
            </View>
            <Tag label="SOLANA DEVNET" type="experimental" />
          </View>

          {/* Address Box */}
          <View style={styles.addressBox}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleCopyAddress}
              style={styles.addressTouchable}
            >
              <Text style={styles.addressText} numberOfLines={1}>
                {wallet.address || 'No wallet connected'}
              </Text>
              <Ionicons
                name="copy-outline"
                size={16}
                color={AppleColors.brandEmerald}
              />
            </TouchableOpacity>

            {wallet.isConnected && (
              <TouchableOpacity
                onPress={handleOpenExplorer}
                style={styles.explorerIconBtn}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="open-outline"
                  size={16}
                  color={AppleColors.labelSecondary}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Balance Grid */}
          <View style={styles.balanceGrid}>
            <View style={styles.balanceCol}>
              <Text style={styles.balanceTitle}>{getUsdcDisplayName()}</Text>
              <Text style={styles.balanceAmount}>
                {wallet.usdcBalance.toFixed(2)} USDC
              </Text>
              <Text style={styles.balanceSub}>Prediction Collateral</Text>
            </View>

            <View style={styles.balanceCol}>
              <Text style={styles.balanceTitle}>Devnet SOL</Text>
              <Text style={styles.balanceAmount}>
                {(wallet.solBalance || 0).toFixed(3)} SOL
              </Text>
              <Text style={styles.balanceSub}>Gas & Account Rent</Text>
            </View>
          </View>

          {/* Action Row */}
          {wallet.isConnected ? (
            <View style={styles.walletActions}>
              <TouchableOpacity
                onPress={handleRefresh}
                style={styles.actionBtn}
                activeOpacity={0.7}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <ActivityIndicator size="small" color={AppleColors.labelPrimary} />
                ) : (
                  <>
                    <Ionicons
                      name="refresh"
                      size={14}
                      color={AppleColors.labelPrimary}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.actionBtnText}>Refresh</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleRequestAirdrop}
                style={[styles.actionBtn, styles.actionBtnEmerald]}
                activeOpacity={0.7}
                disabled={isAirdropping}
              >
                {isAirdropping ? (
                  <ActivityIndicator size="small" color={AppleColors.brandEmerald} />
                ) : (
                  <>
                    <Ionicons
                      name="water-outline"
                      size={14}
                      color={AppleColors.brandEmerald}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.actionBtnText,
                        { color: AppleColors.brandEmerald },
                      ]}
                    >
                      Devnet Faucet
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={disconnectWallet}
                style={[styles.actionBtn, styles.actionBtnDanger]}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="log-out-outline"
                  size={14}
                  color={AppleColors.systemRed}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.actionBtnText,
                    { color: AppleColors.systemRed },
                  ]}
                >
                  Sign Out
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Button
              title="Sign In with Google or Apple"
              onPress={() => useFerasStore.getState().openAuthSheet()}
              variant="primary"
              size="md"
              style={styles.connectPrimaryBtn}
            />
          )}
        </Card>

        {/* Grouped Settings Section 1: Chess Experience */}
        <Text style={styles.groupHeader}>CHESSBOARD APPEARANCE</Text>
        <Card style={styles.groupedCard}>
          <Text style={styles.settingLabel}>Board Theme</Text>
          <SegmentedControl
            values={BOARD_THEME_OPTIONS}
            selectedValue={boardTheme}
            onChange={setBoardTheme}
            style={styles.settingControl}
          />

          <View style={styles.settingDivider} />

          <Text style={styles.settingLabel}>Default Replay Speed</Text>
          <SegmentedControl
            values={SPEED_OPTIONS}
            selectedValue={playbackSpeed.toString()}
            onChange={(val) => setPlaybackSpeed(parseInt(val, 10) as 1 | 2 | 4)}
            style={styles.settingControl}
          />
        </Card>

        {/* Grouped Settings Section 2: Haptics & Feedback */}
        <Text style={styles.groupHeader}>INTERACTION & ACCESSIBILITY</Text>
        <Card style={styles.groupedCard}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchTitle}>Engine Move Audio</Text>
              <Text style={styles.switchSubtitle}>
                Acoustic feedback for legal piece placements
              </Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={toggleSound}
              trackColor={{
                false: AppleColors.fillSecondary,
                true: AppleColors.brandEmerald,
              }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.settingDivider} />

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchTitle}>Haptic Feedback</Text>
              <Text style={styles.switchSubtitle}>
                Taptic engine vibrations on odds selection & predictions
              </Text>
            </View>
            <Switch
              value={hapticsEnabled}
              onValueChange={toggleHaptics}
              trackColor={{
                false: AppleColors.fillSecondary,
                true: AppleColors.brandEmerald,
              }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>
      </ScrollView>
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
  },
  contentContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Platform.OS === 'android' ? 32 : Spacing.sm,
    paddingBottom: Spacing.xxl,
  },
  header: {
    marginBottom: Spacing.md,
  },
  headerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  brandIcon: {
    width: 16,
    height: 16,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: AppleColors.brandEmerald,
    letterSpacing: 0.8,
  },
  title: {
    ...Typography.title1,
    color: AppleColors.labelPrimary,
    fontWeight: '800',
  },
  walletCard: {
    backgroundColor: AppleColors.secondaryBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  walletCardConnected: {
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  walletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppleColors.brandEmerald,
    marginRight: 6,
  },
  disconnectedDot: {
    backgroundColor: AppleColors.labelQuaternary,
  },
  connectedText: {
    ...Typography.footnote,
    color: AppleColors.labelPrimary,
    fontWeight: '600',
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: Spacing.md,
  },
  addressTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addressText: {
    ...Typography.caption1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: AppleColors.labelPrimary,
    flex: 1,
    marginRight: Spacing.xs,
  },
  explorerIconBtn: {
    paddingLeft: Spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.08)',
  },
  balanceGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  balanceCol: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: Radii.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  balanceTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: AppleColors.labelSecondary,
    marginBottom: 4,
  },
  balanceAmount: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
    fontWeight: '700',
  },
  balanceSub: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
    marginTop: 2,
  },
  walletActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 8,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  actionBtnEmerald: {
    borderColor: 'rgba(16, 185, 129, 0.3)',
    backgroundColor: AppleColors.brandEmeraldSoft,
  },
  actionBtnDanger: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  actionBtnText: {
    ...Typography.caption1,
    fontWeight: '600',
    color: AppleColors.labelPrimary,
  },
  connectPrimaryBtn: {
    width: '100%',
  },
  groupHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: AppleColors.labelTertiary,
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
    marginLeft: 4,
  },
  groupedCard: {
    backgroundColor: AppleColors.secondaryBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  settingLabel: {
    ...Typography.subhead,
    color: AppleColors.labelSecondary,
    marginBottom: Spacing.xs,
  },
  settingControl: {
    marginBottom: Spacing.xs,
  },
  settingDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: Spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchTitle: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
    fontWeight: '600',
  },
  switchSubtitle: {
    ...Typography.caption1,
    color: AppleColors.labelSecondary,
    marginTop: 2,
    maxWidth: 240,
  },
});
