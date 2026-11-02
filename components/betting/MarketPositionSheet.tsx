import React, { useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
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
import {
  calculateRequiredSol,
  autoConvertSolToUsdc,
  claimDevnetFaucetSol,
  SOL_USD_RATE,
} from '@/services/solana/swapService';

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
  const [isConverting, setIsConverting] = useState(false);
  const [isClaimingFaucet, setIsClaimingFaucet] = useState(false);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);

  if (!match) return null;

  const estimatedReturn = Number((stake * multiplier).toFixed(2));
  const hasInsufficientFunds = wallet.usdcBalance < stake;
  const canCreateMarketPosition = wallet.capabilities.canCreateMarketPositions;

  // Auto-conversion calculations
  const deficitUsdc = Math.max(0, Number((stake - wallet.usdcBalance).toFixed(2)));
  const requiredSol = calculateRequiredSol(deficitUsdc);
  const userSol = wallet.solBalance || 0;
  const canAutoConvert = hasInsufficientFunds && userSol >= requiredSol;
  const isCompletelyOutOfFunds = hasInsufficientFunds && userSol < requiredSol;

  const handleSelectPreset = (amount: number) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => undefined);
    }
    setStake(amount);
  };

  const handleClaimFaucet = async () => {
    if (!wallet.address) return;
    setIsClaimingFaucet(true);
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => undefined);
    }
    showToast({
      type: 'info',
      title: 'Requesting Faucet',
      message: 'Requesting 1 SOL from Devnet faucet...',
    });
    try {
      await claimDevnetFaucetSol(wallet.address);
      await refreshWallet();
      showToast({
        type: 'success',
        title: 'Faucet Credited',
        message: '1 Devnet SOL credited to your wallet.',
      });
    } catch {
      showToast({
        type: 'error',
        title: 'Faucet Unavailable',
        message: 'Could not claim Devnet faucet at this moment.',
      });
    } finally {
      setIsClaimingFaucet(false);
    }
  };

  const executePosition = async () => {
    setIsSubmitting(true);
    try {
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
          Haptics.NotificationFeedbackType.Success
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

  const handleCreatePosition = async () => {
    if (hasInsufficientFunds || stake <= 0 || isSubmitting || !canCreateMarketPosition) return;
    await executePosition();
  };

  const handleAutoConvertAndPlace = async () => {
    if (isConverting || isSubmitting || !canCreateMarketPosition) return;
    if (!wallet.address) {
      showToast({
        type: 'error',
        title: 'Wallet Not Connected',
        message: 'Connect your wallet before placing a prediction.',
      });
      return;
    }

    try {
      setIsConverting(true);
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => undefined);
      }
      showToast({
        type: 'info',
        title: 'Auto-Converting SOL',
        message: `Converting ~${requiredSol} SOL to ${deficitUsdc.toFixed(2)} USDC...`,
      });

      // Auto-convert SOL into USDC
      await autoConvertSolToUsdc(wallet.address, requiredSol);
      await refreshWallet();

      // Proceed immediately to execute the prediction
      await executePosition();
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Auto-Conversion Failed',
        message: error instanceof Error ? error.message : 'Unable to auto-convert SOL.',
      });
    } finally {
      setIsConverting(false);
    }
  };

  const handleClose = () => {
    setReceipt(null);
    close();
  };

  // Determine button title, action, and loading state
  let buttonTitle = `Review ${stake} USDC Transaction`;
  let buttonAction = handleCreatePosition;
  let buttonDisabled = stake <= 0 || !canCreateMarketPosition;
  let buttonLoading = isSubmitting;

  if (hasInsufficientFunds) {
    if (canAutoConvert) {
      buttonTitle = `Auto-Convert ${requiredSol} SOL & Bet`;
      buttonAction = handleAutoConvertAndPlace;
      buttonDisabled = !canCreateMarketPosition;
      buttonLoading = isConverting || isSubmitting;
    } else {
      buttonTitle = 'Claim Devnet Faucet SOL';
      buttonAction = handleClaimFaucet;
      buttonDisabled = false;
      buttonLoading = isClaimingFaucet;
    }
  }

  if (!wallet.isConnected) {
    buttonTitle = 'Sign In with Google / Apple to Bet';
    buttonAction = async () => {
      close();
      useFerasStore.getState().openAuthSheet();
    };
    buttonDisabled = false;
    buttonLoading = false;
  } else if (!canCreateMarketPosition && !hasInsufficientFunds) {
    buttonTitle = 'Devnet Market Not Configured';
    buttonDisabled = true;
  }

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
            title={buttonTitle}
            onPress={buttonAction}
            disabled={buttonDisabled}
            loading={buttonLoading}
            size="lg"
            variant="primary"
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
            color={AppleColors.brandEmerald}
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
              <Text style={styles.solBalanceSub}>
                {(wallet.solBalance || 0).toFixed(3)} SOL
              </Text>
            </View>
          </View>

          {/* Auto-Conversion Helper Card */}
          {canAutoConvert && (
            <View style={styles.autoConvertCard}>
              <View style={styles.autoConvertHeader}>
                <Ionicons name="flash" size={15} color={AppleColors.brandEmerald} />
                <Text style={styles.autoConvertTitle}>SOL Auto-Convert Available</Text>
              </View>
              <Text style={styles.autoConvertText}>
                You have {userSol.toFixed(3)} SOL available. Tap below to automatically convert ~{requiredSol} SOL into {deficitUsdc.toFixed(2)} USDC (at 1 SOL ≈ ${SOL_USD_RATE} USDC) and submit your bet in one tap.
              </Text>
            </View>
          )}

          {/* Faucet Prompt Card when completely out of both USDC & SOL */}
          {isCompletelyOutOfFunds && (
            <View style={styles.faucetPromptCard}>
              <View style={styles.faucetHeader}>
                <Ionicons name="alert-circle-outline" size={16} color={AppleColors.systemOrange} />
                <Text style={styles.faucetTitle}>Insufficient USDC & SOL</Text>
              </View>
              <Text style={styles.faucetText}>
                You need {stake} USDC (or ~{requiredSol} SOL) to place this prediction.
              </Text>
              <TouchableOpacity
                onPress={handleClaimFaucet}
                style={styles.faucetBtn}
                activeOpacity={0.8}
                disabled={isClaimingFaucet}
              >
                {isClaimingFaucet ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="water-outline" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.faucetBtnText}>Claim 1 Devnet SOL Faucet</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {hasInsufficientFunds && !canAutoConvert && !isCompletelyOutOfFunds && (
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
  solBalanceSub: {
    fontSize: 10,
    color: AppleColors.brandEmerald,
    fontWeight: '600',
    marginTop: 2,
  },
  autoConvertCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  autoConvertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  autoConvertTitle: {
    ...Typography.caption1,
    color: AppleColors.brandEmerald,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  autoConvertText: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    lineHeight: 16,
  },
  faucetPromptCard: {
    backgroundColor: 'rgba(255, 159, 10, 0.08)',
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.25)',
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  faucetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  faucetTitle: {
    ...Typography.caption1,
    color: AppleColors.systemOrange,
    fontWeight: '700',
  },
  faucetText: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    lineHeight: 16,
    marginBottom: Spacing.xs,
  },
  faucetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppleColors.brandEmerald,
    paddingVertical: 7,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.pill,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  faucetBtnText: {
    ...Typography.caption1,
    color: '#FFFFFF',
    fontWeight: '700',
  },
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
  returnValue: { color: AppleColors.brandEmerald },
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
});
