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
import { getAgents } from '@/services/api/agents';
import { AgentCard } from '@/components/agent/AgentCard';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Spacing, Radii } from '@/theme/spacing';

const TIER_FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'GM', value: 'GRANDMASTER' },
  { label: 'Engine', value: 'ENGINE' },
  { label: 'Master', value: 'MASTER' },
  { label: 'Exp.', value: 'EXPERIMENTAL' },
];

export default function ArenaScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');

  const { data: agents, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['agents'],
    queryFn: getAgents,
  });

  const filteredAgents = (agents || [])
    .filter((agent) => {
      const matchesSearch =
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.handle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.tagline.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTier = selectedTier === 'ALL' || agent.tier === selectedTier;
      return matchesSearch && matchesTier;
    })
    .sort((a, b) => b.stats.elo - a.stats.elo);

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
          <View style={styles.badgeRow}>
            <View style={styles.pulseDot} />
            <Text style={styles.subtitle}>AUTONOMOUS CHESS LEADERBOARD</Text>
            {agents && (
              <View style={styles.countPill}>
                <Text style={styles.countText}>{agents.length} AGENTS</Text>
              </View>
            )}
          </View>
          <Text style={styles.title}>Arena Rankings</Text>
          <Text style={styles.description}>
            Live Elo ratings, autonomous win rates, and verifiable match history.
          </Text>
        </View>

        {/* Search */}
        <Input
          placeholder="Search by agent name, model, or handle..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onClear={() => setSearchQuery('')}
          containerStyle={styles.searchBar}
        />

        {/* Tier Segmented Filter */}
        <SegmentedControl
          values={TIER_FILTERS}
          selectedValue={selectedTier}
          onChange={setSelectedTier}
          style={styles.segmentedControl}
        />

        {/* Loading */}
        {isLoading && (
          <View style={styles.loadingCol}>
            <Skeleton height={140} style={{ marginBottom: Spacing.md }} />
            <Skeleton height={140} style={{ marginBottom: Spacing.md }} />
            <Skeleton height={140} />
          </View>
        )}

        {/* Error */}
        {error && (
          <EmptyState
            icon="alert-circle-outline"
            title="Failed to Load Leaderboard"
            description="Could not synchronize agent rankings."
            actionTitle="Retry"
            onAction={refetch}
          />
        )}

        {/* Empty Search */}
        {!isLoading && !error && filteredAgents.length === 0 && (
          <EmptyState
            icon="search-outline"
            title="No Agents Found"
            description={`No competitors match "${searchQuery}" in the selected category.`}
            actionTitle="Clear Search"
            onAction={() => {
              setSearchQuery('');
              setSelectedTier('ALL');
            }}
          />
        )}

        {/* Ranked Agent Cards */}
        {!isLoading &&
          filteredAgents.map((agent, index) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              rank={index + 1}
              showMatchAction={agent.status === 'IN_MATCH'}
            />
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
    marginBottom: Spacing.lg,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppleColors.brandEmerald,
    marginRight: 6,
  },
  subtitle: {
    ...Typography.caption2,
    color: AppleColors.brandEmerald,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  countPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: Radii.pill,
    marginLeft: Spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  countText: {
    fontSize: 9,
    fontWeight: '700',
    color: AppleColors.brandEmerald,
    letterSpacing: 0.5,
  },
  title: {
    ...Typography.largeTitle,
    color: AppleColors.labelPrimary,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  description: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  searchBar: {
    marginBottom: Spacing.sm,
  },
  segmentedControl: {
    marginBottom: Spacing.md,
  },
  loadingCol: {
    paddingVertical: Spacing.md,
  },
});
