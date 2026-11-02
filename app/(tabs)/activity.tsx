import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  RefreshControl,
  Platform,
  TouchableOpacity,
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
  const [timeframe, setTimeframe] = useState<'This week' | 'All time'>('This week');

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
  const totalPositioned = (positions || []).reduce((total, position) => total + position.stakeUsdc, 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={AppleColors.brandEmerald}
          />
        }
      >
        {/* Zenvest Header: Analytics title Left, Bell & Profile Right */}
        <View style={styles.zenHeaderRow}>
          <Text style={styles.zenHeaderTitle}>Analytics</Text>
          <View style={styles.zenHeaderRight}>
            <View style={styles.zenIconPill}>
              <Ionicons name="notifications-outline" size={18} color={AppleColors.labelPrimary} />
            </View>
            <View style={styles.zenAvatarPill}>
              <Ionicons name="person-outline" size={16} color={AppleColors.brandEmerald} />
            </View>
          </View>
        </View>

        {/* Zenvest Analytics Card: Income & Performance */}
        <View style={styles.analyticsHeroCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardSectionLabel}>Portfolio Yield</Text>
            <TouchableOpacity
              style={styles.timeframePill}
              onPress={() => setTimeframe(timeframe === 'This week' ? 'All time' : 'This week')}
              activeOpacity={0.7}
            >
              <Text style={styles.timeframeText}>{timeframe}</Text>
              <Ionicons name="chevron-down" size={12} color={AppleColors.labelSecondary} />
            </TouchableOpacity>
          </View>

          {/* Large Numeric Value */}
          <View style={styles.valueRow}>
            <Text
              style={[
                styles.hugeNetValue,
                { color: netPnL >= 0 ? AppleColors.brandEmerald : AppleColors.systemRed },
              ]}
            >
              {netPnL >= 0 ? '+' : '-'}${Math.abs(netPnL).toFixed(2)}
            </Text>
            <Text style={styles.usdcUnitText}>USDC</Text>
          </View>

          <View style={styles.pctRow}>
            <Ionicons
              name={netPnL >= 0 ? 'trending-up' : 'trending-down'}
              size={14}
              color={netPnL >= 0 ? AppleColors.brandEmerald : AppleColors.systemRed}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.pctText,
                { color: netPnL >= 0 ? AppleColors.brandEmerald : AppleColors.systemRed },
              ]}
            >
              {netPnL >= 0 ? '+14.2%' : '-4.8%'} from autonomous positions
            </Text>
          </View>

          {/* Minimalist Zenvest Wave Representation & Active Tooltip */}
          <View style={styles.chartWrapper}>
            <View style={styles.chartTooltip}>
              <Text style={styles.chartTooltipText}>
                {netPnL >= 0 ? `+$${(Math.abs(netPnL) * 0.75).toFixed(0)} settled` : '$0.00'}
              </Text>
            </View>

            <View style={styles.waveContainer}>
              <View style={styles.waveBar} />
              <View style={[styles.waveBar, { height: 18 }]} />
              <View style={[styles.waveBar, { height: 28 }]} />
              <View style={[styles.waveBar, { height: 22 }]} />
              <View style={[styles.waveBar, { height: 42, backgroundColor: AppleColors.brandEmerald }]} />
              <View style={[styles.waveBar, { height: 35 }]} />
              <View style={[styles.waveBar, { height: 24 }]} />
            </View>

            <View style={styles.daysRow}>
              <Text style={styles.dayLabel}>Sun</Text>
              <Text style={styles.dayLabel}>Mon</Text>
              <Text style={styles.dayLabel}>Tue</Text>
              <Text style={styles.dayLabel}>Wed</Text>
              <Text style={[styles.dayLabel, styles.dayActive]}>Thu</Text>
              <Text style={styles.dayLabel}>Fri</Text>
              <Text style={styles.dayLabel}>Sat</Text>
            </View>
          </View>

          {/* Secondary Metrics Grid */}
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statColLabel}>Positioned</Text>
              <Text style={styles.statColValue}>{totalPositioned.toFixed(0)} USDC</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statColLabel}>Settled Returns</Text>
              <Text style={styles.statColValue}>
                {(positions || [])
                  .filter((p) => p.status === 'WON')
                  .reduce((sum, p) => sum + p.estimatedReturnUsdc, 0)
                  .toFixed(0)} USDC
              </Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statColLabel}>Win Ratio</Text>
              <Text style={[styles.statColValue, { color: AppleColors.brandEmerald }]}>
                {positions && positions.length > 0
                  ? `${Math.round(
                      (positions.filter((p) => p.status === 'WON').length /
                        Math.max(1, positions.filter((p) => p.status !== 'ACTIVE').length)) *
                        100
                    )}%`
                  : '0%'}
              </Text>
            </View>
          </View>
        </View>

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
            <Skeleton height={80} style={{ marginBottom: Spacing.sm }} />
            <Skeleton height={80} style={{ marginBottom: Spacing.sm }} />
            <Skeleton height={80} />
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
            description="Predictions created on live autonomous matches will appear here."
          />
        )}

        {/* Zenvest Style Category Item List (Starbucks / Netflix style circle icons) */}
        {!isLoading &&
          filteredPositions.map((position) => {
            const isWon = position.status === 'WON';
            const isLost = position.status === 'LOST';

            return (
              <Card key={position.id} style={styles.itemCard}>
                <View style={styles.itemMainRow}>
                  {/* Category Circle Icon */}
                  <View
                    style={[
                      styles.circleIconBox,
                      isWon && styles.circleWon,
                      isLost && styles.circleLost,
                    ]}
                  >
                    <Ionicons
                      name={
                        isWon
                          ? 'trophy'
                          : isLost
                          ? 'close'
                          : 'flash'
                      }
                      size={18}
                      color={
                        isWon
                          ? AppleColors.brandEmerald
                          : isLost
                          ? AppleColors.systemRed
                          : AppleColors.brandCyan
                      }
                    />
                  </View>

                  {/* Title and Subtitle */}
                  <View style={styles.itemTextCol}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {position.selectedAgentName} ({position.outcome})
                    </Text>
                    <Text style={styles.itemSubtitle}>
                      {position.matchTitle} · {new Date(position.placedAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>

                  {/* Amount / Payout */}
                  <View style={styles.itemAmountCol}>
                    <Text
                      style={[
                        styles.itemAmountText,
                        isWon && { color: AppleColors.brandEmerald },
                        isLost && { color: AppleColors.labelTertiary },
                      ]}
                    >
                      {isWon ? '+' : isLost ? '-' : ''}
                      {position.estimatedReturnUsdc.toFixed(2)} USDC
                    </Text>
                    <Text style={styles.itemMultiplierText}>
                      Stake: {position.stakeUsdc} USDC ({position.estimatedMultiplier.toFixed(2)}x)
                    </Text>
                  </View>
                </View>

                {/* Footer Signature */}
                <View style={styles.itemFooterRow}>
                  <Tag
                    label={position.status}
                    type={isWon ? 'win' : isLost ? 'loss' : 'master'}
                  />
                  <View style={styles.txLinkRow}>
                    <Ionicons name="link-outline" size={12} color={AppleColors.brandCyan} />
                    <Text style={styles.txSignatureText}>
                      {(position.receipt.signature || position.receipt.id).slice(0, 16)}...
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })}
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
  zenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  zenHeaderTitle: {
    ...Typography.largeTitle,
    color: AppleColors.labelPrimary,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  zenHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zenIconPill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: AppleColors.cardElevated,
    borderWidth: 1,
    borderColor: AppleColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zenAvatarPill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyticsHeroCard: {
    backgroundColor: AppleColors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  cardSectionLabel: {
    ...Typography.caption1,
    color: AppleColors.labelSecondary,
    fontWeight: '500',
  },
  timeframePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppleColors.cardElevated,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: AppleColors.border,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
  },
  timeframeText: {
    ...Typography.caption2,
    color: AppleColors.labelPrimary,
    fontWeight: '600',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  hugeNetValue: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  usdcUnitText: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
    marginLeft: 6,
    fontWeight: '600',
  },
  pctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  pctText: {
    ...Typography.caption1,
    fontWeight: '600',
  },
  chartWrapper: {
    backgroundColor: AppleColors.cardElevated,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  chartTooltip: {
    backgroundColor: '#000000',
    borderRadius: Radii.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: Spacing.sm,
  },
  chartTooltipText: {
    ...Typography.caption2,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: '100%',
    height: 50,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  waveBar: {
    width: 6,
    height: 12,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: Spacing.xs,
  },
  dayLabel: {
    fontSize: 10,
    color: AppleColors.labelTertiary,
    fontWeight: '500',
  },
  dayActive: {
    color: AppleColors.labelPrimary,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingTop: Spacing.sm,
  },
  statCol: {
    alignItems: 'center',
    flex: 1,
  },
  statColLabel: {
    fontSize: 10,
    color: AppleColors.labelTertiary,
  },
  statColValue: {
    ...Typography.numericSmall,
    color: AppleColors.labelPrimary,
    marginTop: 2,
    fontWeight: '700',
  },
  filterControl: {
    marginBottom: Spacing.md,
  },
  loadingCol: {
    paddingVertical: Spacing.md,
  },
  itemCard: {
    marginBottom: Spacing.sm,
    backgroundColor: AppleColors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: AppleColors.border,
    padding: Spacing.md,
  },
  itemMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  circleIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: AppleColors.cardElevated,
    borderWidth: 1,
    borderColor: AppleColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  circleWon: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  circleLost: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  itemTextCol: {
    flex: 1,
  },
  itemTitle: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
    fontWeight: '700',
  },
  itemSubtitle: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    marginTop: 2,
  },
  itemAmountCol: {
    alignItems: 'flex-end',
  },
  itemAmountText: {
    ...Typography.numericMedium,
    color: AppleColors.labelPrimary,
    fontWeight: '800',
  },
  itemMultiplierText: {
    fontSize: 10,
    color: AppleColors.labelTertiary,
    marginTop: 2,
  },
  itemFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: Spacing.xs,
  },
  txLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  txSignatureText: {
    fontSize: 10,
    color: AppleColors.brandCyan,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
