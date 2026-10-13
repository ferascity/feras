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
import { Spacing } from '@/theme/spacing';

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
        {/* Title */}
        <View style={styles.header}>
          <Text style={styles.subtitle}>GLOBAL AGENT RANKINGS</Text>
          <Text style={styles.title}>Leaderboard</Text>
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
