import React, { useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { placePosition } from '@/services/api/positions';
import { TransactionReceipt } from '@/services/wallet/IWalletService';
import { useFerasStore } from '@/store/useFerasStore';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';
import { getUsdcDisplayName } from '@/services/solana/config';

const PRESET_STAKES = [10, 25, 50, 100, 250];

export function MarketPositionSheet() {
  const queryClient = useQueryClient();
  const isOpen = useFerasStore((state) => state.isPositionSheetOpen);
  const close = useFerasStore((state) => state.closePositionSheet);
  const match = useFerasStore((state) => state.positionMatch);
  const agentName = useFerasStore((state) => state.positionAgentName);
  const outcome = useFerasStore((state) => state.positionOutcome);
  const multiplier = useFerasStore((state) => state.positionEstimatedMultiplier);
  const stake = useFerasStore((state) => state.positionStakeUsdc);
  const setStake = useFerasStore((state) => state.setPositionStakeUsdc);
  const wallet = useFerasStore((state) => state.wallet);
  const refreshWallet = useFerasStore((state) => state.refreshWallet);
  const showToast = useFerasStore((state) => state.showToast);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);

  if (!match) return null;

  const estimatedReturn = Number((stake * multiplier).toFixed(2));
  const hasInsufficientFunds = wallet.usdcBalance < stake;
  const canCreateMarketPosition = wallet.capabilities.canCreateMarketPositions;

  const handleSelectPreset = (amount: number) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => undefined);
    }
    setStake(amount);
  };

  const handleCreatePosition = async () => {
    if (hasInsufficientFunds || stake <= 0 || isSubmitting || !canCreateMarketPosition) return;

    try {
      setIsSubmitting(true);
      const position = await placePosition({
        matchId: match.id,
        matchTitle: match.title,
        selectedAgentId: useFerasStore.getState().positionAgentId || '',
        selectedAgentName: agentName || 'Draw Outcome',
        outcome,
        stakeUsdc: stake,
        estimatedMultiplier: multiplier,
      });

      await refreshWallet();
      await queryClient.invalidateQueries({ queryKey: ['position-history'] });
      setReceipt(position.receipt);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
      }
      showToast({
        type: 'success',
        title: 'Prediction Submitted',
        message: `${stake} USDC on ${agentName || 'Draw'}`,
      });
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Position Failed',
        message: error instanceof Error ? error.message : 'Unable to create position.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setReceipt(null);
    close();
  };

  return (
    <BottomSheet
      visible={isOpen}
      onClose={handleClose}
      title={receipt ? 'Position Ready' : 'Create Position'}
      subtitle={receipt ? 'Devnet transaction submitted' : match.title}
      footer={
        receipt ? (
          <Button title="Done" onPress={handleClose} size="lg" style={styles.fullWidth} />
        ) : (
          <Button
            title={
              hasInsufficientFunds
                ? 'Insufficient USDC'
                : !canCreateMarketPosition
                  ? 'Devnet Market Not Configured'
                : `Review ${stake} USDC Transaction`
            }
            onPress={handleCreatePosition}
            disabled={hasInsufficientFunds || stake <= 0 || !canCreateMarketPosition}
            loading={isSubmitting}
            size="lg"
            style={styles.fullWidth}
          />
        )
      }
    >
      {receipt ? (
        <View style={styles.successContainer}>
          <Ionicons
            name="checkmark-circle"
            size={52}
            color={AppleColors.systemGreen}
          />
          <Text style={styles.successTitle}>
            {receipt.status === 'CONFIRMED' ? 'Transaction Confirmed' : 'Transaction Submitted'}
          </Text>
          <Text style={styles.successSub}>
            {stake} USDC on{' '}
            <Text style={styles.emphasis}>{agentName || 'Draw'}</Text>
          </Text>

          <View style={styles.receiptCard}>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Cluster</Text>
              <Text style={styles.receiptValue}>DEVNET</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Estimated multiplier</Text>
              <Text style={styles.receiptValue}>{multiplier.toFixed(2)}x</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Estimated return</Text>
              <Text style={[styles.receiptValue, styles.returnValue]}>
                {estimatedReturn.toFixed(2)} USDC
              </Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Signature</Text>
              <Text style={styles.receiptId} numberOfLines={1}>
                {receipt.signature || receipt.id}
              </Text>
            </View>
          </View>

        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.networkBanner}>
            <Ionicons name="flask-outline" size={17} color={AppleColors.systemBlue} />
            <View style={styles.networkCopy}>
              <Text style={styles.networkTitle}>
                DEVNET · {getUsdcDisplayName().toUpperCase()}
              </Text>
              <Text style={styles.networkText}>
                {canCreateMarketPosition
                  ? 'Your wallet will review a Solana devnet transaction.'
                  : 'Market transactions unlock after Devnet program and API configuration.'}
              </Text>
            </View>
          </View>

          <View style={styles.selectionCard}>
            <View style={styles.selectionLeft}>
              <Text style={styles.selectionSide}>{outcome}</Text>
              <Text style={styles.selectionAgent}>{agentName}</Text>
            </View>
            <View style={styles.multiplierBox}>
              <Text style={styles.multiplierValue}>{multiplier.toFixed(2)}x</Text>
              <Text style={styles.multiplierLabel}>ESTIMATE</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Position amount</Text>
          <View style={styles.presetRow}>
            {PRESET_STAKES.map((amount) => {
              const selected = stake === amount;
              return (
                <TouchableOpacity
                  key={amount}
                  onPress={() => handleSelectPreset(amount)}
                  style={[styles.presetChip, selected && styles.presetChipActive]}
                >
                  <Text style={[styles.presetText, selected && styles.presetTextActive]}>
                    {amount}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputContainer}>
              <TextInput
                value={stake.toString()}
                onChangeText={(value) =>
                  setStake(parseInt(value.replace(/[^0-9]/g, ''), 10) || 0)
                }
                keyboardType="numeric"
                style={styles.input}
                placeholder="0"
                placeholderTextColor={AppleColors.labelTertiary}
              />
              <Text style={styles.currency}>USDC</Text>
            </View>
            <View style={styles.balanceContainer}>
              <Text style={styles.balanceLabel}>Available</Text>
              <Text style={styles.balanceValue}>{wallet.usdcBalance.toFixed(2)} USDC</Text>
            </View>
          </View>

          {hasInsufficientFunds && (
            <Text style={styles.errorText}>Insufficient Devnet USDC in the connected wallet.</Text>
          )}

          <View style={styles.estimateCard}>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Position</Text>
              <Text style={styles.receiptValue}>{stake.toFixed(2)} USDC</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Estimated return</Text>
              <Text style={[styles.receiptValue, styles.returnValue]}>
                {estimatedReturn.toFixed(2)} USDC
              </Text>
            </View>
            <Text style={styles.estimateNote}>
              Pari-mutuel estimates change with the pool until the market locks.
            </Text>
          </View>

        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: Spacing.md },
  networkBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    borderRadius: Radii.sm,
    backgroundColor: '#0A84FF1F',
  },
  networkCopy: { flex: 1 },
  networkTitle: { ...Typography.caption1, color: AppleColors.systemBlue, fontWeight: '700' },
  networkText: { ...Typography.caption2, color: AppleColors.labelSecondary, marginTop: 2 },
  selectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AppleColors.fillSecondary,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  selectionLeft: { flex: 1 },
  selectionSide: { ...Typography.caption1, color: AppleColors.systemBlue, fontWeight: '700' },
  selectionAgent: { ...Typography.headline, color: AppleColors.labelPrimary, marginTop: 2 },
  multiplierBox: { alignItems: 'flex-end' },
  multiplierValue: { ...Typography.numericMedium, color: AppleColors.labelPrimary },
  multiplierLabel: { ...Typography.caption2, color: AppleColors.labelTertiary },
  sectionLabel: { ...Typography.subhead, color: AppleColors.labelSecondary, marginBottom: Spacing.xs },
  presetRow: { flexDirection: 'row', marginHorizontal: -3, marginBottom: Spacing.sm },
  presetChip: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 3,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
    backgroundColor: AppleColors.fillSecondary,
  },
  presetChipActive: { backgroundColor: AppleColors.systemBlue, borderColor: AppleColors.systemBlue },
  presetText: { ...Typography.footnote, color: AppleColors.labelPrimary, fontWeight: '600' },
  presetTextActive: { color: '#FFFFFF' },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  inputContainer: {
    flex: 1,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    marginRight: Spacing.md,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
    backgroundColor: AppleColors.fill,
  },
  input: { flex: 1, ...Typography.numericMedium, color: AppleColors.labelPrimary },
  currency: { ...Typography.caption1, color: AppleColors.labelTertiary, fontWeight: '700' },
  balanceContainer: { alignItems: 'flex-end' },
  balanceLabel: { ...Typography.caption2, color: AppleColors.labelTertiary },
  balanceValue: { ...Typography.numericSmall, color: AppleColors.labelPrimary },
  errorText: { ...Typography.caption1, color: AppleColors.systemRed, marginBottom: Spacing.sm },
  estimateCard: {
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderRadius: Radii.md,
    backgroundColor: AppleColors.fillSecondary,
  },
  estimateNote: { ...Typography.caption2, color: AppleColors.labelTertiary, marginTop: Spacing.xs },
  receiptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  receiptLabel: { ...Typography.footnote, color: AppleColors.labelSecondary },
  receiptValue: { ...Typography.footnote, color: AppleColors.labelPrimary, fontWeight: '600' },
  returnValue: { color: AppleColors.systemGreen },
  fullWidth: { width: '100%' },
  successContainer: { alignItems: 'center', paddingVertical: Spacing.md },
  successTitle: { ...Typography.title2, color: AppleColors.labelPrimary, marginTop: Spacing.sm },
  successSub: { ...Typography.subhead, color: AppleColors.labelSecondary, textAlign: 'center', marginTop: 4 },
  emphasis: { color: AppleColors.labelPrimary },
  receiptCard: {
    width: '100%',
    padding: Spacing.md,
    marginVertical: Spacing.lg,
    borderRadius: Radii.md,
    backgroundColor: AppleColors.fillSecondary,
  },
  receiptId: {
    flex: 1,
    marginLeft: Spacing.md,
    textAlign: 'right',
    ...Typography.caption1,
    color: AppleColors.systemBlue,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  disclaimer: {
    ...Typography.caption1,
    color: AppleColors.labelSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
});
