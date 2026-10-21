import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Image,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getMatchById } from '@/services/api/matches';
import { ChessBoardReplay } from '@/components/chess/ChessBoardReplay';
import { MarketQuote } from '@/components/betting/MarketQuote';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFerasStore } from '@/store/useFerasStore';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';

function formatEvaluation(score: number) {
  return `${score >= 0 ? '+' : ''}${score.toFixed(2)}`;
}

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const openPositionSheet = useFerasStore((state) => state.openPositionSheet);

  const { data: match, isLoading, error, refetch } = useQuery({
    queryKey: ['match', id],
    queryFn: () => getMatchById(id || 'match-101'),
  });

  const [activeTab, setActiveTab] = useState<'commentary' | 'pgn' | 'analysis'>('commentary');

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Skeleton height={60} style={{ marginBottom: Spacing.md }} />
          <Skeleton height={380} borderRadius={Radii.md} style={{ marginBottom: Spacing.md }} />
          <Skeleton height={100} style={{ marginBottom: Spacing.md }} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !match) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <EmptyState
          icon="alert-circle-outline"
          title="Match Unavailable"
          description="Could not synchronize with the live replay engine."
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
        {/* Match Header Tag & Info */}
        <View style={styles.matchMetaRow}>
          <Tag
            label={match.status === 'LIVE' ? `LIVE · ${match.timeControl}` : match.status}
            type={match.status === 'LIVE' ? 'live' : 'upcoming'}
            showDot
          />
          <View style={styles.viewerRow}>
            <Ionicons name="eye" size={13} color={AppleColors.labelSecondary} />
            <Text style={styles.viewerCount}>
              {(match.viewerCount ?? 0).toLocaleString()} Spectators
            </Text>
          </View>
        </View>

        <Text style={styles.matchTitle}>{match.title}</Text>

        {/* Versus Matchup Bar */}
        <Card style={styles.matchupBar}>
          {/* White Agent */}
          <TouchableOpacity
            style={styles.agentBox}
            onPress={() => router.push(`/agent/${match.whiteAgent.id}`)}
          >
            <Image
              source={{ uri: match.whiteAgent.avatarUrl }}
              style={styles.agentAvatar}
            />
            <View style={styles.agentTextColumn}>
              <Text style={styles.agentName} numberOfLines={1}>
                {match.whiteAgent.name}
              </Text>
              <Text style={styles.agentMeta}>
                ♔ White · {match.whiteAgent.stats.elo}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.vsSeparator} pointerEvents="none">
            <Text style={styles.vsText}>VS</Text>
          </View>

          {/* Black Agent */}
          <TouchableOpacity
            style={[styles.agentBox, styles.blackAgentBox]}
            onPress={() => router.push(`/agent/${match.blackAgent.id}`)}
          >
            <View style={[styles.agentTextColumn, styles.blackAgentTextColumn]}>
              <Text style={[styles.agentName, styles.blackAgentText]} numberOfLines={1}>
                {match.blackAgent.name}
              </Text>
              <Text style={[styles.agentMeta, styles.blackAgentText]}>
                ♚ Black · {match.blackAgent.stats.elo}
              </Text>
            </View>
            <Image
              source={{ uri: match.blackAgent.avatarUrl }}
              style={[styles.agentAvatar, { marginLeft: Spacing.sm, marginRight: 0 }]}
            />
          </TouchableOpacity>
        </Card>

        {/* The Replay Chessboard Component */}
        <View style={styles.boardWrapper}>
          <ChessBoardReplay
            replay={match.replay}
            initialPly={match.currentPly}
            autoPlay={match.status === 'LIVE'}
          />
        </View>

        {/* Live market estimates */}
        <View style={styles.oddsSection}>
          <Text style={styles.oddsSectionTitle}>DEVNET MARKET · ESTIMATES</Text>
          <View style={styles.oddsRow}>
            <MarketQuote
              label={match.whiteAgent.name.split('-')[0]}
              estimatedMultiplier={match.marketEstimates.whiteMultiplier}
              onPress={() =>
                openPositionSheet({
                  match,
                  agentId: match.whiteAgent.id,
                  agentName: match.whiteAgent.name,
                  outcome: 'WHITE',
                  estimatedMultiplier: match.marketEstimates.whiteMultiplier,
                })
              }
              style={styles.oddsBox}
            />

            <MarketQuote
              label="DRAW"
              estimatedMultiplier={match.marketEstimates.drawMultiplier}
              onPress={() =>
                openPositionSheet({
                  match,
                  agentId: 'draw',
                  agentName: 'Draw Outcome',
                  outcome: 'DRAW',
                  estimatedMultiplier: match.marketEstimates.drawMultiplier,
                })
              }
              style={styles.oddsBox}
            />

            <MarketQuote
              label={match.blackAgent.name.split('-')[0]}
              estimatedMultiplier={match.marketEstimates.blackMultiplier}
              onPress={() =>
                openPositionSheet({
                  match,
                  agentId: match.blackAgent.id,
                  agentName: match.blackAgent.name,
                  outcome: 'BLACK',
                  estimatedMultiplier: match.marketEstimates.blackMultiplier,
                })
              }
              style={styles.oddsBox}
            />
          </View>
        </View>

        {/* Market position action */}
        <Button
          title="Create Devnet Position"
          onPress={() =>
            openPositionSheet({
              match,
              agentId: match.whiteAgent.id,
              agentName: match.whiteAgent.name,
              outcome: 'WHITE',
              estimatedMultiplier: match.marketEstimates.whiteMultiplier,
            })
          }
          variant="primary"
          size="lg"
          style={styles.positionCta}
        />

        {/* Move History / Notation List */}
        <Card style={styles.pgnCard}>
          <View style={styles.tabRow}>
            <TouchableOpacity
              onPress={() => setActiveTab('commentary')}
              style={[styles.subTab, activeTab === 'commentary' && styles.activeSubTab]}
            >
              <Text
                style={[
                  styles.subTabText,
                  activeTab === 'commentary' && styles.activeSubTabText,
                ]}
              >
                Commentary
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab('pgn')}
              style={[styles.subTab, activeTab === 'pgn' && styles.activeSubTab]}
            >
              <Text
                style={[
                  styles.subTabText,
                  activeTab === 'pgn' && styles.activeSubTabText,
                ]}
              >
                PGN Moves ({match.replay?.moves?.length || 0})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab('analysis')}
              style={[styles.subTab, activeTab === 'analysis' && styles.activeSubTab]}
            >
              <Text
                style={[
                  styles.subTabText,
                  activeTab === 'analysis' && styles.activeSubTabText,
                ]}
              >
                Engine Depth
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'commentary' && (
            <View style={styles.commentaryList}>
              {(match.replay?.moves || []).slice(-4).reverse().map((m) => (
                <View key={`comm-${m.ply}`} style={styles.commItem}>
                  <View style={styles.commPly}>
                    <Text style={styles.commPlyText}>{m.ply}</Text>
                  </View>
                  <View style={styles.commTextCol}>
                    <Text style={styles.commSan}>
                      {m.san} —{' '}
                      <Text style={{ color: AppleColors.labelSecondary, fontWeight: '400' }}>
                        {m.commentary || 'Solid positional move.'}
                      </Text>
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {activeTab === 'pgn' && (
            <View style={styles.pgnGrid}>
              {(match.replay?.moves || []).map((m, idx) => {
                if (idx % 2 === 0) {
                  const blackMove = match.replay.moves[idx + 1];
                  const moveNum = Math.floor(idx / 2) + 1;
                  return (
                    <View key={`pgn-${idx}`} style={styles.pgnRow}>
                      <Text style={styles.pgnNum}>{moveNum}.</Text>
                      <Text style={styles.pgnMove}>{m.san}</Text>
                      <Text style={styles.pgnMove}>{blackMove?.san || ''}</Text>
                    </View>
                  );
                }
                return null;
              })}
            </View>
          )}

          {activeTab === 'analysis' && (
            <View style={styles.analysisBox}>
              <View style={styles.analysisRow}>
                <Text style={styles.analysisKey}>White Opening</Text>
                <Text style={styles.analysisVal}>{match.whiteAgent.stats.favoredOpening}</Text>
              </View>
              <View style={styles.analysisRow}>
                <Text style={styles.analysisKey}>Engine Evaluation</Text>
                <Text style={[styles.analysisVal, { color: AppleColors.systemBlue }]}>
                  {formatEvaluation(match.evalScore)} pawns
                </Text>
              </View>
              {(match.engineAnalysis || []).map((line) => (
                <View style={styles.analysisRow} key={`pv-${line.multiPv}`}>
                  <Text style={styles.analysisKey}>PV {line.multiPv} · Depth {line.depth}</Text>
                  <Text style={styles.analysisVal} numberOfLines={2}>
                    {line.scoreMate === null ? `${line.scoreCp ?? 0} cp` : `Mate ${line.scoreMate}`} · {line.principalVariation.slice(0, 5).join(' ')}
                  </Text>
                </View>
              ))}
              <View style={styles.analysisRow}>
                <Text style={styles.analysisKey}>Replay Status</Text>
                <Text style={styles.analysisVal}>{match.replay.terminationReason}</Text>
              </View>
            </View>
          )}
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
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xxl,
  },
  loadingContainer: {
    padding: Spacing.md,
  },
  matchMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  viewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewerCount: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    marginLeft: 4,
  },
  matchTitle: {
    ...Typography.title2,
    color: AppleColors.labelPrimary,
    marginBottom: Spacing.sm,
  },
  matchupBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    minHeight: 64,
  },
  agentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  blackAgentBox: {
    justifyContent: 'flex-end',
  },
  agentTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  blackAgentTextColumn: {
    alignItems: 'flex-end',
  },
  agentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: Spacing.sm,
  },
  agentName: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
    width: '100%',
  },
  blackAgentText: {
    textAlign: 'right',
  },
  agentMeta: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    marginTop: 1,
  },
  vsSeparator: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: {
    ...Typography.caption2,
    fontWeight: '700',
    color: AppleColors.labelTertiary,
  },
  boardWrapper: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  oddsSection: {
    marginBottom: Spacing.sm,
  },
  oddsSectionTitle: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
    marginLeft: 4,
  },
  oddsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  oddsBox: {
    flex: 1,
    marginHorizontal: 3,
  },
  positionCta: {
    marginVertical: Spacing.sm,
  },
  pgnCard: {
    marginTop: Spacing.sm,
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppleColors.separator,
    paddingBottom: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  subTab: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    marginRight: Spacing.xs,
  },
  activeSubTab: {
    borderBottomWidth: 2,
    borderBottomColor: AppleColors.systemBlue,
  },
  subTabText: {
    ...Typography.footnote,
    color: AppleColors.labelTertiary,
    fontWeight: '500',
  },
  activeSubTabText: {
    color: AppleColors.labelPrimary,
    fontWeight: '600',
  },
  commentaryList: {
    paddingVertical: Spacing.xs,
  },
  commItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  commPly: {
    backgroundColor: AppleColors.fillSecondary,
    borderRadius: Radii.xs,
    width: 24,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  commPlyText: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
    fontWeight: '700',
  },
  commTextCol: {
    flex: 1,
  },
  commSan: {
    ...Typography.footnote,
    fontWeight: '700',
    color: AppleColors.labelPrimary,
    lineHeight: 18,
  },
  pgnGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pgnRow: {
    flexDirection: 'row',
    width: '50%',
    paddingVertical: 4,
  },
  pgnNum: {
    ...Typography.caption2,
    color: AppleColors.labelTertiary,
    width: 24,
  },
  pgnMove: {
    ...Typography.footnote,
    color: AppleColors.labelPrimary,
    marginRight: Spacing.sm,
  },
  analysisBox: {
    paddingVertical: Spacing.xs,
  },
  analysisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppleColors.separator,
  },
  analysisKey: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
  },
  analysisVal: {
    ...Typography.footnote,
    fontWeight: '600',
    color: AppleColors.labelPrimary,
  },
});
