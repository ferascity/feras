import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getAllMatches } from '@/services/api/matches';
import { Match } from '@/types/match';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { MarketQuote } from '@/components/betting/MarketQuote';
import { useFerasStore } from '@/store/useFerasStore';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';

const CATEGORIES = ['ALL', 'CHAMPIONSHIP', 'GRAND_PRIX', 'HIGH_STAKES'] as const;

export default function HomeScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const openPositionSheet = useFerasStore((state) => state.openPositionSheet);
  const wallet = useFerasStore((state) => state.wallet);

  const { data: matches, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['matches'],
    queryFn: getAllMatches,
  });

  const filteredMatches = (matches || []).filter((m) => {
    if (selectedCategory === 'ALL') return true;
    return m.category === selectedCategory;
  });

  const liveMatches = filteredMatches.filter((m) => m.status === 'LIVE');
  const upcomingMatches = filteredMatches.filter((m) => m.status === 'UPCOMING');
  const heroMatch = liveMatches[0] || matches?.[0];

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
        {/* iOS Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerSubtitle}>AUTONOMOUS CHESS TOURNAMENTS</Text>
            <Text style={styles.headerTitle}>Live Arena</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/profile')}
            style={styles.walletPill}
          >
            <View style={styles.statusDot} />
            <Text style={styles.walletBalanceText}>
              {wallet.usdcBalance.toFixed(0)} USDC
            </Text>
          </TouchableOpacity>
        </View>

        {/* Category Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryContainer}
        >
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[
                  styles.categoryChip,
                  isSelected && styles.categoryChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    isSelected && styles.categoryTextActive,
                  ]}
                >
                  {cat.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Loading State */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <Skeleton height={240} borderRadius={Radii.lg} style={{ marginBottom: Spacing.md }} />
            <Skeleton height={140} borderRadius={Radii.lg} style={{ marginBottom: Spacing.md }} />
            <Skeleton height={140} borderRadius={Radii.lg} />
          </View>
        )}

        {/* Error State */}
        {error && (
          <EmptyState
            icon="alert-circle-outline"
            title="Unable to Load Matches"
            description="Could not connect to Arena matchmaking service."
            actionTitle="Try Again"
            onAction={refetch}
          />
        )}

        {/* Hero Featured Live Match */}
        {!isLoading && heroMatch && (
          <Card
            style={styles.heroCard}
            onPress={() => router.push(`/match/${heroMatch.id}`)}
          >
            {/* Live Header Tag */}
            <View style={styles.heroHeader}>
              <Tag
                label={
                  heroMatch.status === 'LIVE'
                    ? `LIVE · PLY ${heroMatch.currentPly}`
                    : heroMatch.status
                }
                type={heroMatch.status === 'LIVE' ? 'live' : 'upcoming'}
                showDot={heroMatch.status === 'LIVE'}
              />
              <View style={styles.viewerBadge}>
                <Ionicons name="eye" size={13} color={AppleColors.labelSecondary} />
                <Text style={styles.viewerText}>
                  {(heroMatch.viewerCount ?? 0).toLocaleString()} watching
                </Text>
              </View>
            </View>

            <Text style={styles.heroTitle}>{heroMatch.title}</Text>

            {/* Matchup row */}
            <View style={styles.matchupRow}>
              {/* White Agent */}
              <View style={styles.agentCol}>
                <Image
                  source={{ uri: heroMatch.whiteAgent.avatarUrl }}
                  style={styles.agentAvatar}
                />
                <Text style={styles.agentName} numberOfLines={1}>
                  {heroMatch.whiteAgent.name}
                </Text>
                <Text style={styles.agentSub}>
                  ♔ White · {heroMatch.whiteAgent.stats.elo}
                </Text>
              </View>

              {/* VS Pill */}
              <View style={styles.vsBadge}>
                <Text style={styles.vsText}>VS</Text>
                <Text style={styles.timeControlText}>{heroMatch.timeControl}</Text>
              </View>

              {/* Black Agent */}
              <View style={[styles.agentCol, { alignItems: 'flex-end' }]}>
                <Image
                  source={{ uri: heroMatch.blackAgent.avatarUrl }}
                  style={styles.agentAvatar}
                />
                <Text style={styles.agentName} numberOfLines={1}>
                  {heroMatch.blackAgent.name}
                </Text>
                <Text style={styles.agentSub}>
                  ♚ Black · {heroMatch.blackAgent.stats.elo}
                </Text>
              </View>
            </View>

            {/* Live market estimates */}
            <View style={styles.oddsContainer}>
              <MarketQuote
                label={heroMatch.whiteAgent.name.split('-')[0]}
                estimatedMultiplier={heroMatch.marketEstimates.whiteMultiplier}
                onPress={() =>
                  openPositionSheet({
                    match: heroMatch,
                    agentId: heroMatch.whiteAgent.id,
                    agentName: heroMatch.whiteAgent.name,
                    outcome: 'WHITE',
                    estimatedMultiplier: heroMatch.marketEstimates.whiteMultiplier,
                  })
                }
                style={styles.oddsBox}
              />
              <MarketQuote
                label="DRAW"
                estimatedMultiplier={heroMatch.marketEstimates.drawMultiplier}
                onPress={() =>
                  openPositionSheet({
                    match: heroMatch,
                    agentId: 'draw',
                    agentName: 'Draw Outcome',
                    outcome: 'DRAW',
                    estimatedMultiplier: heroMatch.marketEstimates.drawMultiplier,
                  })
                }
                style={styles.oddsBox}
              />
              <MarketQuote
                label={heroMatch.blackAgent.name.split('-')[0]}
                estimatedMultiplier={heroMatch.marketEstimates.blackMultiplier}
                onPress={() =>
                  openPositionSheet({
                    match: heroMatch,
                    agentId: heroMatch.blackAgent.id,
                    agentName: heroMatch.blackAgent.name,
                    outcome: 'BLACK',
                    estimatedMultiplier: heroMatch.marketEstimates.blackMultiplier,
                  })
                }
                style={styles.oddsBox}
              />
            </View>

            {/* Action CTA */}
            <Button
              title="Watch Replay & Spectate"
              onPress={() => router.push(`/match/${heroMatch.id}`)}
              variant="tinted"
              size="md"
              style={styles.heroCta}
            />
          </Card>
        )}

        {/* Section: Upcoming Matchups */}
        {!isLoading && upcomingMatches.length > 0 && (
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Upcoming Matches</Text>
            <Text style={styles.sectionBadge}>{upcomingMatches.length}</Text>
          </View>
        )}

        {!isLoading &&
          upcomingMatches.map((m) => (
            <Card
              key={m.id}
              style={styles.upcomingCard}
              onPress={() => router.push(`/match/${m.id}`)}
            >
              <View style={styles.upcomingHeader}>
                <Tag label="UPCOMING" type="upcoming" />
                <Text style={styles.poolText}>
                  {(m.poolVolumeUsdc || 0).toLocaleString()} USDC Pool
                </Text>
              </View>

              <Text style={styles.upcomingTitle}>{m.title}</Text>

              <View style={styles.upcomingMatchup}>
                <Text style={styles.upcomingAgentText}>
                  {m.whiteAgent.name} ({m.whiteAgent.stats.elo})
                </Text>
                <Text style={styles.upcomingVs}>vs</Text>
                <Text style={styles.upcomingAgentText}>
                  {m.blackAgent.name} ({m.blackAgent.stats.elo})
                </Text>
              </View>

              <View style={styles.upcomingFooter}>
                <Text style={styles.timeText}>
                  Starts {new Date(m.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Button
                  title="View Market"
                  onPress={() => router.push(`/match/${m.id}`)}
                  variant="secondary"
                  size="sm"
                />
              </View>
            </Card>
          ))}

        {/* Arena Metrics Card */}
        <Card style={styles.statsCard}>
          <Text style={styles.statsCardTitle}>Arena 24h Activity</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCol}>
              <Text style={styles.statVal}>1.35M USDC</Text>
              <Text style={styles.statLabel}>Devnet Volume</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statVal}>42</Text>
              <Text style={styles.statLabel}>Active Agents</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={[styles.statVal, { color: AppleColors.systemGreen }]}>
                99.4%
              </Text>
              <Text style={styles.statLabel}>Avg Accuracy</Text>
            </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerSubtitle: {
    ...Typography.caption2,
    color: AppleColors.systemBlue,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerTitle: {
    ...Typography.largeTitle,
    color: AppleColors.labelPrimary,
  },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppleColors.fillSecondary,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: AppleColors.systemGreen,
    marginRight: 6,
  },
  walletBalanceText: {
    ...Typography.footnote,
    fontWeight: '600',
    color: AppleColors.labelPrimary,
  },
  categoryScroll: {
    marginBottom: Spacing.md,
  },
  categoryContainer: {
    flexDirection: 'row',
  },
  categoryChip: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.sm,
    backgroundColor: AppleColors.fillSecondary,
    marginRight: Spacing.xs,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
  },
  categoryChipActive: {
    backgroundColor: AppleColors.systemBlue,
    borderColor: AppleColors.systemBlue,
  },
  categoryText: {
    ...Typography.caption1,
    fontWeight: '600',
    color: AppleColors.labelSecondary,
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    paddingVertical: Spacing.md,
  },
  heroCard: {
    marginBottom: Spacing.lg,
    borderColor: 'rgba(10, 132, 255, 0.25)',
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewerText: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    marginLeft: 4,
  },
  heroTitle: {
    ...Typography.title3,
    color: AppleColors.labelPrimary,
    marginBottom: Spacing.md,
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AppleColors.fillSecondary,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  agentCol: {
    flex: 1,
  },
  agentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginBottom: 6,
  },
  agentName: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
  },
  agentSub: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    marginTop: 2,
  },
  vsBadge: {
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  vsText: {
    ...Typography.caption2,
    fontWeight: '700',
    color: AppleColors.labelTertiary,
  },
  timeControlText: {
    ...Typography.caption2,
    color: AppleColors.systemBlue,
    marginTop: 2,
  },
  oddsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  oddsBox: {
    flex: 1,
    marginHorizontal: 3,
  },
  heroCta: {
    width: '100%',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.title3,
    color: AppleColors.labelPrimary,
  },
  sectionBadge: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
    marginLeft: 8,
    backgroundColor: AppleColors.fillSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.xs,
  },
  upcomingCard: {
    marginBottom: Spacing.sm,
  },
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  poolText: {
    ...Typography.caption1,
    color: AppleColors.labelSecondary,
    fontWeight: '600',
  },
  upcomingTitle: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
    marginBottom: 6,
  },
  upcomingMatchup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  upcomingAgentText: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
  },
  upcomingVs: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
    marginHorizontal: 6,
  },
  upcomingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppleColors.separator,
    paddingTop: Spacing.sm,
  },
  timeText: {
    ...Typography.caption1,
    color: AppleColors.labelTertiary,
  },
  statsCard: {
    marginTop: Spacing.md,
    backgroundColor: AppleColors.fillSecondary,
  },
  statsCardTitle: {
    ...Typography.subhead,
    fontWeight: '600',
    color: AppleColors.labelSecondary,
    marginBottom: Spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCol: {
    alignItems: 'center',
    flex: 1,
  },
  statVal: {
    ...Typography.title3,
    color: AppleColors.labelPrimary,
  },
  statLabel: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
    marginTop: 2,
  },
});
