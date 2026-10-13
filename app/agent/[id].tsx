import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Image,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getAgentById } from '@/services/api/agents';
import { AgentStatBlock } from '@/components/agent/AgentStatBlock';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';

export default function AgentProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: agent, isLoading, error } = useQuery({
    queryKey: ['agent', id],
    queryFn: () => getAgentById(id || 'agent-1'),
  });

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Skeleton height={80} style={{ marginBottom: Spacing.md }} />
          <Skeleton height={200} style={{ marginBottom: Spacing.md }} />
          <Skeleton height={180} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !agent) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <EmptyState
          icon="alert-circle-outline"
          title="Agent Not Found"
          description="Could not locate competitor specifications."
          actionTitle="Back to Arena"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Agent Header Hero */}
        <Card style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.avatarWrapper}>
              <Image source={{ uri: agent.avatarUrl }} style={styles.avatar} />
              <View style={styles.emojiBadge}>
                <Text style={styles.emojiText}>{agent.badgeEmoji}</Text>
              </View>
            </View>

            <View style={styles.heroInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{agent.name}</Text>
              </View>
              <Text style={styles.handle}>{agent.handle}</Text>
              <View style={styles.tagRow}>
                <Tag label={agent.tier} type="grandmaster" />
                <View style={styles.statusPill}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          agent.status === 'IN_MATCH'
                            ? AppleColors.systemOrange
                            : AppleColors.systemGreen,
                      },
                    ]}
                  />
                  <Text style={styles.statusText}>{agent.status.replace('_', ' ')}</Text>
                </View>
              </View>
            </View>
          </View>

          <Text style={styles.tagline}>{agent.tagline}</Text>

          <View style={styles.heroEarningsRow}>
            <View style={styles.earningItem}>
              <Text style={styles.earningLabel}>Tournament Earnings</Text>
              <Text style={styles.earningValue}>
                +{agent.earningsSol.toFixed(2)} SOL
              </Text>
            </View>
            <View style={styles.earningItem}>
              <Text style={styles.earningLabel}>Spectator Volume</Text>
              <Text style={styles.earningValue}>
                {(agent.totalVolumeUsdc / 1000).toFixed(0)}k USDC
              </Text>
            </View>
          </View>
        </Card>

        {/* Detailed Stats and Architecture Blocks */}
        <AgentStatBlock
          stats={agent.stats}
          architecture={agent.architecture}
        />

        {/* Action Buttons */}
        <View style={styles.actionSection}>
          <Button
            title="Launch Sparring Sandbox"
            onPress={() => router.push(`/agent/${agent.id}/sandbox`)}
            variant="primary"
            size="lg"
            style={styles.primaryBtn}
          />
          {agent.currentMatchId && (
            <Button
              title="Watch Live Tournament Match"
              onPress={() => router.push(`/match/${agent.currentMatchId}`)}
              variant="tinted"
              size="md"
              style={styles.secondaryBtn}
            />
          )}
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
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xxl,
  },
  loadingContainer: {
    padding: Spacing.md,
  },
  heroCard: {
    marginBottom: Spacing.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: Spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: AppleColors.fillSecondary,
  },
  emojiBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: AppleColors.secondaryBackground,
    borderRadius: 12,
    padding: 2,
  },
  emojiText: {
    fontSize: 14,
  },
  heroInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    ...Typography.title2,
    color: AppleColors.labelPrimary,
  },
  handle: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
    marginTop: 2,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppleColors.fillSecondary,
    borderRadius: Radii.pill,
    paddingVertical: 3,
    paddingHorizontal: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    fontWeight: '600',
  },
  tagline: {
    ...Typography.body,
    color: AppleColors.labelSecondary,
    marginTop: Spacing.md,
    lineHeight: 22,
  },
  heroEarningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: AppleColors.fillSecondary,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  earningItem: {
    flex: 1,
  },
  earningLabel: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
  },
  earningValue: {
    ...Typography.numericMedium,
    color: AppleColors.systemGreen,
    marginTop: 2,
  },
  actionSection: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  primaryBtn: {
    width: '100%',
    marginBottom: Spacing.sm,
  },
  secondaryBtn: {
    width: '100%',
  },
});
