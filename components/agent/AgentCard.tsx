import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Agent } from '@/types/agent';
import { Card } from '@/components/ui/Card';
import { Tag, TagType } from '@/components/ui/Tag';
import { Button } from '@/components/ui/Button';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';

interface AgentCardProps {
  agent: Agent;
  rank?: number;
  showMatchAction?: boolean;
}

export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  rank,
  showMatchAction = true,
}) => {
  const router = useRouter();

  const getTierTagType = (tier: string): TagType => {
    switch (tier.toLowerCase()) {
      case 'grandmaster':
        return 'grandmaster';
      case 'engine':
        return 'engine';
      case 'master':
        return 'master';
      case 'experimental':
      default:
        return 'experimental';
    }
  };

  const handleCardPress = () => {
    router.push(`/agent/${agent.id}`);
  };

  return (
    <Card style={styles.card} onPress={handleCardPress}>
      <View style={styles.topRow}>
        {/* Optional rank badge */}
        {rank !== undefined && (
          <View
            style={[
              styles.rankBadge,
              rank === 1 && styles.rank1,
              rank === 2 && styles.rank2,
              rank === 3 && styles.rank3,
            ]}
          >
            <Text style={styles.rankText}>#{rank}</Text>
          </View>
        )}

        {/* Avatar */}
        <View style={styles.avatarWrapper}>
          <Image source={{ uri: agent.avatarUrl }} style={styles.avatar} />
          <View style={styles.emojiBadge}>
            <Text style={styles.emojiText}>{agent.badgeEmoji}</Text>
          </View>
        </View>

        {/* Agent Info */}
        <View style={styles.infoCol}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {agent.name}
            </Text>
            {agent.isUserOwned && (
              <Tag label="YOU" type="win" style={styles.youTag} />
            )}
          </View>
          <Text style={styles.handle}>{agent.handle}</Text>
          <View style={styles.tagRow}>
            <Tag label={agent.tier} type={getTierTagType(agent.tier)} />
            <View style={styles.eloBadge}>
              <Ionicons name="trophy" size={11} color={AppleColors.systemYellow} />
              <Text style={styles.eloText}>{agent.stats.elo}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Tagline */}
      <Text style={styles.tagline} numberOfLines={2}>
        {agent.tagline}
      </Text>

      {/* Key Metrics Row */}
      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Win Rate</Text>
          <Text style={[styles.metricValue, { color: AppleColors.systemGreen }]}>
            {agent.stats.winRate}%
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Matches</Text>
          <Text style={styles.metricValue}>{agent.stats.totalMatches}</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Avg Time</Text>
          <Text style={styles.metricValue}>{agent.stats.avgMoveTimeSec}s</Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionsRow}>
        <Button
          title="Profile & Analysis"
          onPress={handleCardPress}
          variant="secondary"
          size="sm"
          style={styles.secondaryAction}
        />
        {showMatchAction && (
          <Button
            title={agent.status === 'IN_MATCH' ? 'Spectate Live' : 'Challenge'}
            onPress={() => {
              if (agent.currentMatchId) {
                router.push(`/match/${agent.currentMatchId}`);
              } else {
                handleCardPress();
              }
            }}
            variant="tinted"
            size="sm"
            style={styles.primaryAction}
          />
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.md,
    backgroundColor: AppleColors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: AppleColors.border,
    padding: Spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: AppleColors.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: AppleColors.border,
  },
  rank1: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: 'rgba(245, 158, 11, 0.5)',
  },
  rank2: {
    backgroundColor: 'rgba(156, 163, 175, 0.2)',
    borderColor: 'rgba(156, 163, 175, 0.5)',
  },
  rank3: {
    backgroundColor: 'rgba(217, 119, 6, 0.2)',
    borderColor: 'rgba(217, 119, 6, 0.5)',
  },
  rankText: {
    ...Typography.caption2,
    fontWeight: '700',
    color: AppleColors.labelPrimary,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: Spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: AppleColors.cardElevated,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  emojiBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: AppleColors.card,
    borderRadius: 10,
    padding: 2,
    borderWidth: 1,
    borderColor: AppleColors.border,
  },
  emojiText: {
    fontSize: 12,
  },
  infoCol: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
    flexShrink: 1,
    fontWeight: '700',
  },
  youTag: {
    marginLeft: 6,
  },
  handle: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
    marginTop: 1,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  eloBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppleColors.cardElevated,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: Radii.pill,
    marginLeft: Spacing.xs,
    borderWidth: 1,
    borderColor: AppleColors.border,
  },
  eloText: {
    ...Typography.caption2,
    fontWeight: '700',
    color: AppleColors.labelPrimary,
    marginLeft: 4,
  },
  tagline: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppleColors.cardElevated,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginVertical: Spacing.md,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
  },
  metricValue: {
    ...Typography.numericSmall,
    color: AppleColors.labelPrimary,
    marginTop: 2,
    fontWeight: '600',
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: AppleColors.border,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  secondaryAction: {
    marginRight: Spacing.sm,
    flex: 1,
  },
  primaryAction: {
    flex: 1,
  },
});
