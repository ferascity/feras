import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Switch,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  const wallet = useFerasStore((state) => state.wallet);
  const disconnectWallet = useFerasStore((state) => state.disconnectWallet);
  const connectWallet = useFerasStore((state) => state.connectWallet);
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

  const handleCopyAddress = () => {
    showToast({
      type: 'info',
      title: 'Address Copied',
      message: wallet.address || '8xVtN...9k2F',
    });
  };

  const handleConnectWallet = async () => {
    try {
      await connectWallet('MWA');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to connect this wallet.';
      showToast({
        type: 'error',
        title: message === 'Wallet connection was cancelled.' ? 'Connection Cancelled' : 'Wallet Connection Failed',
        message,
      });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.subtitle}>PREFERENCES & LEDGER</Text>
          <Text style={styles.title}>Profile & Wallet</Text>
        </View>

        {/* Wallet Address Card */}
        <Card style={styles.walletCard}>
          <View style={styles.walletHeader}>
            <View style={styles.walletBadge}>
              <View style={styles.connectedDot} />
              <Text style={styles.connectedText}>
                {wallet.walletName || 'Wallet'} · Devnet
              </Text>
            </View>
            <Tag label="DEVNET" type="experimental" />
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleCopyAddress}
            style={styles.addressBox}
          >
            <Text style={styles.addressText}>
              {wallet.address || 'Not connected'}
            </Text>
            <Ionicons name="copy-outline" size={16} color={AppleColors.systemBlue} />
          </TouchableOpacity>

          {/* Balance Rows */}
          <View style={styles.balanceGrid}>
            <View style={styles.balanceCol}>
              <Text style={styles.balanceTitle}>
                {getUsdcDisplayName()}
              </Text>
              <Text style={styles.balanceAmount}>
                {wallet.usdcBalance.toFixed(2)} USDC
              </Text>
            </View>

            <View style={styles.balanceCol}>
              <Text style={styles.balanceTitle}>
                Devnet SOL
              </Text>
              <Text style={styles.balanceAmount}>
                {(wallet.solBalance || 0).toFixed(2)} SOL
              </Text>
            </View>
          </View>

          <Text style={styles.assetNote}>
            {USDC_ASSET.mintAddress || 'Devnet USDC mint not configured'}
          </Text>

          {wallet.isConnected ? (
            <Button
              title="Refresh Devnet Balances"
              onPress={refreshWallet}
              variant="tinted"
              size="sm"
              style={styles.refreshBtn}
            />
          ) : null}

          {wallet.isConnected ? (
            <Button
              title="Disconnect Wallet"
              onPress={disconnectWallet}
              variant="destructive"
              size="sm"
              style={styles.disconnectBtn}
            />
          ) : (
            <Button
              title="Connect Android Wallet"
              onPress={handleConnectWallet}
              variant="primary"
              size="sm"
              style={styles.disconnectBtn}
            />
          )}
        </Card>

        {/* Grouped Settings Section 1: Chess Experience */}
        <Text style={styles.groupHeader}>CHESSBOARD APPEARANCE</Text>
        <Card style={styles.groupedCard}>
          <Text style={styles.settingLabel}>Board Color Theme</Text>
          <SegmentedControl
            values={BOARD_THEME_OPTIONS}
            selectedValue={boardTheme}
            onChange={setBoardTheme}
            style={styles.settingControl}
          />

          <View style={styles.settingDivider} />

          <Text style={styles.settingLabel}>Default Playback Speed</Text>
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
              <Text style={styles.switchLabel}>Haptic Tap Feedback</Text>
              <Text style={styles.switchSub}>
                Vibration response on moves, positions, and taps
              </Text>
            </View>
            <Switch
              value={hapticsEnabled}
              onValueChange={toggleHaptics}
              trackColor={{
                false: AppleColors.fillSecondary,
                true: AppleColors.systemGreen,
              }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.settingDivider} />

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Sound Effects</Text>
              <Text style={styles.switchSub}>
                Move capture clicks and check bells
              </Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={toggleSound}
              trackColor={{
                false: AppleColors.fillSecondary,
                true: AppleColors.systemGreen,
              }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>

        {/* App Version Info */}
        <View style={styles.footerInfo}>
          <Text style={styles.versionText}>Feras v1.0.0</Text>
          <Text style={styles.buildSpecText}>
            Devnet · Mobile Wallet Adapter · Live public balances
          </Text>
        </View>
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
  subtitle: {
    ...Typography.caption2,
    color: AppleColors.systemBlue,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    ...Typography.largeTitle,
    color: AppleColors.labelPrimary,
  },
  walletCard: {
    marginBottom: Spacing.lg,
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
    backgroundColor: AppleColors.systemGreen,
    marginRight: 6,
  },
  connectedText: {
    ...Typography.footnote,
    color: AppleColors.labelPrimary,
    fontWeight: '600',
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AppleColors.fillSecondary,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
    marginBottom: Spacing.md,
  },
  addressText: {
    ...Typography.footnote,
    color: AppleColors.labelPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  balanceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  assetNote: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  balanceCol: {
    flex: 1,
    backgroundColor: AppleColors.fillSecondary,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    marginHorizontal: 3,
    alignItems: 'center',
  },
  balanceTitle: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
  },
  balanceAmount: {
    ...Typography.numericMedium,
    color: AppleColors.labelPrimary,
    marginVertical: 4,
  },
  disconnectBtn: {
    marginTop: Spacing.xs,
  },
  refreshBtn: {
    marginBottom: Spacing.xs,
  },
  groupHeader: {
    ...Typography.caption1,
    color: AppleColors.labelSecondary,
    fontWeight: '600',
    marginLeft: 4,
    marginBottom: Spacing.xs,
    letterSpacing: 0.4,
  },
  groupedCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.md,
  },
  settingLabel: {
    ...Typography.subhead,
    color: AppleColors.labelPrimary,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  settingControl: {
    marginBottom: Spacing.xs,
  },
  settingDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: AppleColors.separator,
    marginVertical: Spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    ...Typography.body,
    color: AppleColors.labelPrimary,
  },
  switchSub: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
    marginTop: 2,
    maxWidth: 240,
  },
  footerInfo: {
    alignItems: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  versionText: {
    ...Typography.caption1,
    color: AppleColors.labelTertiary,
  },
  buildSpecText: {
    ...Typography.caption2,
    color: AppleColors.labelQuaternary,
    marginTop: 2,
  },
});
