import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getUserAgents } from '@/services/api/agents';
import { AgentCard } from '@/components/agent/AgentCard';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';

export default function MyAgentsScreen() {
  const router = useRouter();

  const { data: myAgents, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['my-agents'],
    queryFn: getUserAgents,
  });

  const totalEarningsSol = (myAgents || []).reduce(
    (acc, a) => acc + (a.earningsSol || 0),
    0
  );
  const totalMatches = (myAgents || []).reduce(
    (acc, a) => acc + (a.stats?.totalMatches || 0),
    0
  );

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
        {/* Header with Deploy CTA */}
        <View style={styles.headerRow}>
          <View>
            <View style={styles.badgeRow}>
              <View style={styles.pulseDot} />
              <Text style={styles.headerSubtitle}>AUTONOMOUS AGENT STUDIO</Text>
            </View>
            <Text style={styles.headerTitle}>My Agents</Text>
          </View>
          <Button
            title="+ Deploy Agent"
            onPress={() => router.push('/agent/submit')}
            variant="primary"
            size="sm"
          />
        </View>

        {/* User Agents Performance Banner */}
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Autonomous Earnings</Text>
          <Text style={styles.summaryValue}>+{totalEarningsSol.toFixed(2)} SOL</Text>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryStatsRow}>
            <View style={styles.summaryStatItem}>
              <Text style={styles.statSubLabel}>Deployed Agents</Text>
              <Text style={styles.statSubValue}>{myAgents?.length || 0}</Text>
            </View>
            <View style={styles.summaryStatItem}>
              <Text style={styles.statSubLabel}>Total Battles</Text>
              <Text style={styles.statSubValue}>{totalMatches}</Text>
            </View>
            <View style={styles.summaryStatItem}>
              <Text style={styles.statSubLabel}>Validator Status</Text>
              <Text style={[styles.statSubValue, { color: AppleColors.brandEmerald }]}>
                Active
              </Text>
            </View>
          </View>
        </Card>

        {/* Loading */}
        {isLoading && (
          <View style={styles.loadingCol}>
            <Skeleton height={140} style={{ marginBottom: Spacing.md }} />
            <Skeleton height={140} />
          </View>
        )}

        {/* Error */}
        {error && (
          <EmptyState
            icon="alert-circle-outline"
            title="Error Loading Deployed Agents"
            description="Unable to sync agent configurations."
            actionTitle="Retry"
            onAction={refetch}
          />
        )}

        {/* Empty State */}
        {!isLoading && !error && (!myAgents || myAgents.length === 0) && (
          <EmptyState
            icon="hardware-chip-outline"
            title="No Agents Deployed"
            description="Deploy your own fine-tuned weights or API endpoint to compete for prize pools and spectator volume."
            actionTitle="Deploy New Agent"
            onAction={() => router.push('/agent/submit')}
          />
        )}

        {/* Deployed User Agents */}
        {!isLoading &&
          (myAgents || []).map((agent) => (
            <View key={agent.id} style={styles.agentWrapper}>
              <AgentCard agent={agent} showMatchAction={false} />
              <View style={styles.agentActionsRow}>
                <Button
                  title="Test in Sandbox"
                  onPress={() => router.push(`/agent/${agent.id}/sandbox`)}
                  variant="tinted"
                  size="sm"
                  style={styles.sandboxBtn}
                />
                <Button
                  title="Configure Weights"
                  onPress={() => router.push(`/agent/${agent.id}`)}
                  variant="secondary"
                  size="sm"
                  style={styles.configBtn}
                />
              </View>
            </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  headerSubtitle: {
    ...Typography.caption2,
    color: AppleColors.brandEmerald,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  headerTitle: {
    ...Typography.largeTitle,
    color: AppleColors.labelPrimary,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  summaryCard: {
    marginBottom: Spacing.md,
    backgroundColor: AppleColors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: AppleColors.border,
    padding: Spacing.md,
  },
  summaryLabel: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  summaryValue: {
    ...Typography.numericLarge,
    color: AppleColors.brandEmerald,
    marginVertical: 4,
    fontWeight: '800',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: AppleColors.border,
    marginVertical: Spacing.sm,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryStatItem: {
    alignItems: 'center',
  },
  statSubLabel: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
  },
  statSubValue: {
    ...Typography.numericSmall,
    color: AppleColors.labelPrimary,
    marginTop: 2,
    fontWeight: '700',
  },
  loadingCol: {
    paddingVertical: Spacing.md,
  },
  agentWrapper: {
    marginBottom: Spacing.md,
  },
  agentActionsRow: {
    flexDirection: 'row',
    marginTop: -8,
    marginBottom: Spacing.sm,
  },
  sandboxBtn: {
    flex: 1,
    marginRight: Spacing.xs,
  },
  configBtn: {
    flex: 1,
  },
});
