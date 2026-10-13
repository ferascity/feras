import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AgentStats, AgentArchitecture } from '@/types/agent';
import { Card } from '@/components/ui/Card';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';

interface AgentStatBlockProps {
  stats: AgentStats;
  architecture: AgentArchitecture;
}

export const AgentStatBlock: React.FC<AgentStatBlockProps> = ({
  stats,
  architecture,
}) => {
  return (
    <View style={styles.container}>
      {/* 2x2 Grid of Primary Metrics */}
      <View style={styles.gridRow}>
        <Card style={styles.statBox}>
          <Text style={styles.statLabel}>Current Elo</Text>
          <Text style={[styles.statValue, { color: AppleColors.systemYellow }]}>
            {stats.elo}
          </Text>
          <Text style={styles.statSub}>Peak: {stats.peakElo}</Text>
        </Card>

        <Card style={styles.statBox}>
          <Text style={styles.statLabel}>Win Rate</Text>
          <Text style={[styles.statValue, { color: AppleColors.systemGreen }]}>
            {stats.winRate}%
          </Text>
          <Text style={styles.statSub}>
            {stats.wins}W · {stats.losses}L · {stats.draws}D
          </Text>
        </Card>
      </View>

      <View style={styles.gridRow}>
        <Card style={styles.statBox}>
          <Text style={styles.statLabel}>Move Latency</Text>
          <Text style={styles.statValue}>{stats.avgMoveTimeSec}s</Text>
          <Text style={styles.statSub}>Search Depth: {architecture.evalDepth}</Text>
        </Card>

        <Card style={styles.statBox}>
          <Text style={styles.statLabel}>Accuracy</Text>
          <Text style={[styles.statValue, { color: AppleColors.systemBlue }]}>
            {stats.accuracyPercent}%
          </Text>
          <Text style={styles.statSub}>Aggression: {stats.aggressionScore}/100</Text>
        </Card>
      </View>

      {/* Architecture & Opening Deep Dive */}
      <Card style={styles.archCard}>
        <Text style={styles.sectionHeader}>Model Architecture</Text>

        <View style={styles.specRow}>
          <Text style={styles.specKey}>Base Model</Text>
          <Text style={styles.specVal}>{architecture.baseModel}</Text>
        </View>
        <View style={styles.specRow}>
          <Text style={styles.specKey}>Parameters</Text>
          <Text style={styles.specVal}>{architecture.parameters}</Text>
        </View>
        <View style={styles.specRow}>
          <Text style={styles.specKey}>Search Engine</Text>
          <Text style={styles.specVal}>{architecture.searchAlgorithm}</Text>
        </View>
        <View style={styles.specRow}>
          <Text style={styles.specKey}>Favored Opening</Text>
          <Text style={[styles.specVal, { color: AppleColors.systemBlue }]}>
            {stats.favoredOpening}
          </Text>
        </View>
        <View style={[styles.specRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.specKey}>Author / Dev</Text>
          <Text style={styles.specVal}>{architecture.author}</Text>
        </View>
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  statBox: {
    flex: 1,
    marginHorizontal: 4,
    padding: Spacing.md,
  },
  statLabel: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    ...Typography.numericLarge,
    color: AppleColors.labelPrimary,
    marginVertical: 4,
  },
  statSub: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
  },
  archCard: {
    marginHorizontal: 4,
    marginTop: Spacing.xs,
  },
  sectionHeader: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
    marginBottom: Spacing.sm,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppleColors.separator,
  },
  specKey: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
  },
  specVal: {
    ...Typography.footnote,
    color: AppleColors.labelPrimary,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    paddingLeft: Spacing.md,
  },
});
