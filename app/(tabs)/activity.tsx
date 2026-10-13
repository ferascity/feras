import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  RefreshControl,
  Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getPositionHistory } from '@/services/api/positions';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';

const FILTER_TABS = [
  { label: 'All', value: 'ALL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Won', value: 'WON' },
  { label: 'Lost', value: 'LOST' },
];

export default function ActivityScreen() {
  const [selectedFilter, setSelectedFilter] = useState('ALL');

  const { data: positions, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['position-history'],
    queryFn: getPositionHistory,
  });

  const filteredPositions = (positions || []).filter((position) => {
    if (selectedFilter === 'ALL') return true;
    return position.status === selectedFilter;
  });

  const totalWon = (positions || [])
    .filter((position) => position.status === 'WON')
    .reduce(
      (total, position) => total + (position.estimatedReturnUsdc - position.stakeUsdc),
      0,
    );

  const totalLost = (positions || [])
    .filter((position) => position.status === 'LOST')
    .reduce((total, position) => total + position.stakeUsdc, 0);

  const netPnL = totalWon - totalLost;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={AppleColors.systemBlue}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.subtitle}>DEVNET POSITION HISTORY</Text>
          <Text style={styles.title}>Activity</Text>
        </View>

        {/* PnL Performance Card */}
        <Card style={styles.pnlCard}>
          <Text style={styles.pnlLabel}>Devnet Net Result</Text>
          <Text
            style={[
              styles.pnlValue,
              { color: netPnL >= 0 ? AppleColors.systemGreen : AppleColors.systemRed },
            ]}
          >
            {netPnL >= 0 ? '+' : '-'}{Math.abs(netPnL).toFixed(2)} USDC
          </Text>
          <View style={styles.pnlRow}>
            <View style={styles.pnlItem}>
              <Text style={styles.pnlSubLabel}>Positioned</Text>
              <Text style={styles.pnlSubValue}>
                {(positions || []).reduce((total, position) => total + position.stakeUsdc, 0).toFixed(0)} USDC
              </Text>
            </View>
            <View style={styles.pnlItem}>
              <Text style={styles.pnlSubLabel}>Settled Returns</Text>
              <Text style={styles.pnlSubValue}>
                {(positions || [])
                  .filter((position) => position.status === 'WON')
                  .reduce((total, position) => total + position.estimatedReturnUsdc, 0)
                  .toFixed(0)} USDC
              </Text>
            </View>
            <View style={styles.pnlItem}>
              <Text style={styles.pnlSubLabel}>Win Ratio</Text>
              <Text style={[styles.pnlSubValue, { color: AppleColors.systemGreen }]}>
                {positions && positions.length > 0
                  ? `${Math.round(
                      (positions.filter((position) => position.status === 'WON').length /
                        Math.max(1, positions.filter((position) => position.status !== 'ACTIVE').length)) *
                        100
                    )}%`
                  : '0%'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Filter Segmented Control */}
        <SegmentedControl
          values={FILTER_TABS}
          selectedValue={selectedFilter}
          onChange={setSelectedFilter}
          style={styles.filterControl}
        />

        {/* Loading */}
        {isLoading && (
          <View style={styles.loadingCol}>
            <Skeleton height={110} style={{ marginBottom: Spacing.sm }} />
            <Skeleton height={110} style={{ marginBottom: Spacing.sm }} />
            <Skeleton height={110} />
          </View>
        )}

        {/* Error */}
        {error && (
          <EmptyState
            icon="alert-circle-outline"
            title="Failed to Load Positions"
            description="Could not synchronize devnet position history."
            actionTitle="Retry"
            onAction={refetch}
          />
        )}

        {/* Empty */}
        {!isLoading && !error && filteredPositions.length === 0 && (
          <EmptyState
            icon="receipt-outline"
            title="No Activity Yet"
            description="Positions created on live autonomous matches will appear here."
          />
        )}

        {/* Position receipts */}
        {!isLoading &&
          filteredPositions.map((position) => (
            <Card key={position.id} style={styles.ticketCard}>
              <View style={styles.ticketHeader}>
                <Tag
                  label={position.status}
                  type={
                    position.status === 'WON'
                      ? 'win'
                      : position.status === 'LOST'
                      ? 'loss'
                      : 'master'
                  }
                />
                <Text style={styles.dateText}>
                  {new Date(position.placedAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>

              <Text style={styles.matchTitle}>{position.matchTitle}</Text>

              <View style={styles.ticketBody}>
                <View>
                  <Text style={styles.backedLabel}>Selected Outcome</Text>
                  <Text style={styles.backedAgent}>
                    {position.selectedAgentName} ({position.outcome})
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.payoutLabel}>
                    {position.status === 'WON' ? 'Settled Return' : 'Estimated Return'}
                  </Text>
                  <Text
                    style={[
                      styles.payoutValue,
                      position.status === 'WON' && { color: AppleColors.systemGreen },
                      position.status === 'LOST' && { color: AppleColors.labelTertiary },
                    ]}
                  >
                    {position.estimatedReturnUsdc.toFixed(2)} USDC
                  </Text>
                </View>
              </View>

              <View style={styles.ticketFooter}>
                <Text style={styles.stakeInfo}>
                  Position: <Text style={{ color: AppleColors.labelPrimary }}>{position.stakeUsdc} USDC</Text> · est. {position.estimatedMultiplier.toFixed(2)}x
                </Text>
                <View style={styles.txRow}>
                  <Ionicons
                    name="link"
                    size={12}
                    color={AppleColors.systemBlue}
                  />
                  <Text style={styles.txHash}>
                    {position.receipt.signature || position.receipt.id}
                  </Text>
                </View>
              </View>
            </Card>
          ))}
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
  pnlCard: {
    marginBottom: Spacing.md,
    backgroundColor: AppleColors.fillSecondary,
  },
  pnlLabel: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    textTransform: 'uppercase',
  },
  pnlValue: {
    ...Typography.numericLarge,
    marginVertical: 4,
  },
  pnlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppleColors.separator,
    paddingTop: Spacing.sm,
  },
  pnlItem: {
    alignItems: 'center',
  },
  pnlSubLabel: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
  },
  pnlSubValue: {
    ...Typography.numericSmall,
    color: AppleColors.labelPrimary,
    marginTop: 2,
  },
  filterControl: {
    marginBottom: Spacing.md,
  },
  loadingCol: {
    paddingVertical: Spacing.md,
  },
  ticketCard: {
    marginBottom: Spacing.sm,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  dateText: {
    ...Typography.caption1,
    color: AppleColors.labelTertiary,
  },
  matchTitle: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
    marginBottom: Spacing.sm,
  },
  ticketBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AppleColors.fillSecondary,
    borderRadius: Radii.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  backedLabel: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
  },
  backedAgent: {
    ...Typography.footnote,
    fontWeight: '600',
    color: AppleColors.labelPrimary,
    marginTop: 2,
  },
  payoutLabel: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
  },
  payoutValue: {
    ...Typography.numericMedium,
    color: AppleColors.labelPrimary,
    marginTop: 2,
  },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppleColors.separator,
    paddingTop: Spacing.xs,
  },
  stakeInfo: {
    ...Typography.caption1,
    color: AppleColors.labelSecondary,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txHash: {
    ...Typography.caption2,
    color: AppleColors.systemBlue,
    marginLeft: 3,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
