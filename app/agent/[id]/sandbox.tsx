import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { getAgentById } from '@/services/api/agents';
import { ChessBoardReplay } from '@/components/chess/ChessBoardReplay';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';
import replay102 from '@/mocks/gameReplays/match-102.json';
import { GameReplay } from '@/types/chess';

const OPPONENTS = [
  { label: 'Stockfish Lite', value: 'sf_lite' },
  { label: 'Tactical Bot', value: 'tactical' },
  { label: 'Positional Bot', value: 'positional' },
];

export default function AgentSandboxScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selectedOpponent, setSelectedOpponent] = useState('sf_lite');
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent-sandbox', id],
    queryFn: () => getAgentById(id || 'agent-1'),
  });

  const handleStartSparring = () => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
    }
    setIsRunning(true);
    setHasRun(false);

    setTimeout(() => {
      setIsRunning(false);
      setHasRun(true);
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
      }
    }, 1800);
  };

  if (isLoading || !agent) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Skeleton height={60} style={{ marginBottom: Spacing.md }} />
          <Skeleton height={380} style={{ marginBottom: Spacing.md }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.header}>
          <Text style={styles.subtitle}>OFFLINE BENCHMARK TEST BENCH</Text>
          <Text style={styles.title}>Sparring Sandbox</Text>
          <Text style={styles.subtext}>
            Test {agent.name} against calibrated benchmark engines before entering live tournaments.
          </Text>
        </View>

        {/* Opponent Selection */}
        <Text style={styles.sectionLabel}>Select Sparring Opponent</Text>
        <SegmentedControl
          values={OPPONENTS}
          selectedValue={selectedOpponent}
          onChange={setSelectedOpponent}
          style={styles.segmented}
        />

        {/* Start Button */}
        <Button
          title={isRunning ? 'Simulating Sparring Match...' : 'Run Sparring Match'}
          onPress={handleStartSparring}
          loading={isRunning}
          variant="primary"
          size="lg"
          style={styles.runBtn}
        />

        {/* Board Simulation */}
        <View style={styles.boardWrapper}>
          <ChessBoardReplay
            replay={replay102 as unknown as GameReplay}
            autoPlay={hasRun}
            initialPly={hasRun ? 6 : 0}
          />
        </View>

        {/* Post-match diagnostic report */}
        {hasRun && (
          <Card style={styles.metricsCard}>
            <Text style={styles.reportTitle}>Diagnostic Analysis Report</Text>
            <View style={styles.reportGrid}>
              <View style={styles.reportCol}>
                <Text style={styles.reportVal}>98.6%</Text>
                <Text style={styles.reportSub}>Move Accuracy</Text>
              </View>
              <View style={styles.reportCol}>
                <Text style={[styles.reportVal, { color: AppleColors.systemGreen }]}>
                  0
                </Text>
                <Text style={styles.reportSub}>Blunders</Text>
              </View>
              <View style={styles.reportCol}>
                <Text style={styles.reportVal}>0.9s</Text>
                <Text style={styles.reportSub}>Avg Latency</Text>
              </View>
            </View>
          </Card>
        )}
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
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxl,
  },
  loadingContainer: {
    padding: Spacing.md,
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
  subtext: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  sectionLabel: {
    ...Typography.subhead,
    color: AppleColors.labelSecondary,
    marginBottom: Spacing.xs,
  },
  segmented: {
    marginBottom: Spacing.md,
  },
  runBtn: {
    marginBottom: Spacing.md,
  },
  boardWrapper: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  metricsCard: {
    backgroundColor: AppleColors.fillSecondary,
    marginTop: Spacing.sm,
  },
  reportTitle: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
    marginBottom: Spacing.sm,
  },
  reportGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reportCol: {
    alignItems: 'center',
    flex: 1,
  },
  reportVal: {
    ...Typography.numericMedium,
    color: AppleColors.labelPrimary,
  },
  reportSub: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
    marginTop: 2,
  },
});
