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
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getAllMatches } from '@/services/api/matches';
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
import { claimDevnetFaucetSol } from '@/services/solana/swapService';

const CATEGORIES = ['ALL', 'CHAMPIONSHIP', 'GRAND_PRIX', 'HIGH_STAKES'] as const;

export default function HomeScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [isClaimingFaucet, setIsClaimingFaucet] = useState<boolean>(false);

  const openPositionSheet = useFerasStore((state) => state.openPositionSheet);
  const openAuthSheet = useFerasStore((state) => state.openAuthSheet);
  const wallet = useFerasStore((state) => state.wallet);
  const refreshWallet = useFerasStore((state) => state.refreshWallet);
  const showToast = useFerasStore((state) => state.showToast);

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

  const handleClaimFaucet = async () => {
    if (!wallet.isConnected) {
      openAuthSheet();
      return;
    }

    if (Platform.OS !== 'web') {
      try {
        Haptics.selectionAsync();
      } catch {}
    }

    setIsClaimingFaucet(true);
    try {
      if (wallet.address) {
        await claimDevnetFaucetSol(wallet.address);
        await refreshWallet();
        showToast({
          type: 'success',
          title: 'Faucet Claimed',
          message: '+1.00 Devnet SOL credited to your wallet.',
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: 'Faucet Error',
        message: 'Could not claim Devnet SOL. Please try again.',
      });
    } finally {
      setIsClaimingFaucet(false);
    }
  };

  const handlePlusAction = () => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.selectionAsync();
      } catch {}
    }
    if (!wallet.isConnected) {
      openAuthSheet();
      return;
    }
    if (heroMatch) {
      openPositionSheet({
        match: heroMatch,
        agentId: heroMatch.whiteAgent.id,
        agentName: heroMatch.whiteAgent.name,
        outcome: 'WHITE',
        estimatedMultiplier: heroMatch.marketEstimates.whiteMultiplier,
      });
    }
  };

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
        {/* Zenvest Minimalist Header: Brand Logo Left, Bell & Profile Right */}
        <View style={styles.zenHeaderRow}>
          <View style={styles.zenBrandLeft}>
            <View style={styles.zenLogoBox}>
              <Image
                source={require('@/assets/logo.png')}
                style={styles.zenLogoImg}
                resizeMode="contain"
              />
            </View>
            <View>
              <Text style={styles.zenBrandTitle}>FERAS</Text>
              <Text style={styles.zenBrandSub}>AUTONOMOUS CHESS</Text>
            </View>
          </View>

          <View style={styles.zenHeaderRight}>
            <TouchableOpacity
              style={styles.zenIconPill}
              activeOpacity={0.7}
              onPress={() => router.push('/(tabs)/activity')}
            >
              <Ionicons name="notifications-outline" size={18} color={AppleColors.labelPrimary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.zenProfilePill}
              activeOpacity={0.8}
              onPress={() => (wallet.isConnected ? router.push('/(tabs)/profile') : openAuthSheet())}
            >
              <View style={[styles.zenStatusDot, wallet.isConnected && styles.zenStatusDotActive]} />
              <Text style={styles.zenProfileText}>
                {wallet.isConnected ? 'Wallet' : 'Sign In'}
              </Text>
              <Ionicons
                name={wallet.isConnected ? 'checkmark-circle' : 'person-circle-outline'}
                size={16}
                color={wallet.isConnected ? AppleColors.brandEmerald : AppleColors.labelSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Welcome Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingSub}>Your Autonomous Arena Overview</Text>
          <Text style={styles.greetingTitle}>Welcome to Feras</Text>
        </View>

        {/* Zenvest Hero Frosted Glass Balance Card */}
        <View style={styles.zenCard}>
          {/* Subtle Ambient Color Glow Wave */}
          <View style={styles.zenCardGlowWave} pointerEvents="none" />

          {/* Card Top: Currency Badge + Eye Toggle */}
          <View style={styles.zenCardTop}>
            <View style={styles.zenCurrencyBadge}>
              <View style={styles.solanaMintDot} />
              <Text style={styles.zenCurrencyText}>DEVNET USDC</Text>
            </View>

            <TouchableOpacity
              onPress={() => setShowBalance(!showBalance)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.zenEyeBtn}
              activeOpacity={0.7}
            >
              <Ionicons
                name={showBalance ? 'eye-outline' : 'eye-off-outline'}
                size={18}
                color={AppleColors.labelSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Card Middle: Balance */}
          <View style={styles.zenBalanceContainer}>
            <Text style={styles.zenBalanceLabel}>Your balance</Text>
            <View style={styles.zenBalanceRow}>
              <Text style={styles.zenBalanceCurrency}>$</Text>
              <Text style={styles.zenBalanceValue}>
                {wallet.isConnected
                  ? showBalance
                    ? wallet.usdcBalance.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : '••••••••'
                  : '0.00'}
              </Text>
            </View>

            <Text style={styles.zenSubBalance}>
              {wallet.isConnected
                ? showBalance
                  ? `≈ ${wallet.solBalance.toFixed(3)} SOL`
                  : '••••'
                : 'Connect with Google for instant Devnet SOL & USDC'}
            </Text>
          </View>

          {/* Card Bottom: Masked Address / Cluster */}
          <View style={styles.zenCardFooter}>
            <View>
              <Text style={styles.zenFooterLabel}>Account Number</Text>
              <Text style={styles.zenFooterVal}>
                {wallet.isConnected && wallet.address
                  ? `•••• ${wallet.address.slice(-4)}`
                  : '•••• GUEST'}
              </Text>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.zenFooterLabel}>Network</Text>
              <Text style={[styles.zenFooterVal, { color: AppleColors.brandEmerald }]}>
                Solana Devnet
              </Text>
            </View>
          </View>
        </View>

        {/* Zenvest Action Pill Bar: Send / Faucet, Swap, Positions, Floating + Button */}
        <View style={styles.zenActionBar}>
          <TouchableOpacity
            style={styles.zenActionPill}
            onPress={handleClaimFaucet}
            activeOpacity={0.8}
            disabled={isClaimingFaucet}
          >
            {isClaimingFaucet ? (
              <ActivityIndicator size="small" color={AppleColors.brandEmerald} />
            ) : (
              <>
                <Text style={styles.zenActionPillText}>Faucet 🌢</Text>
                <Ionicons name="arrow-up-outline" size={13} color={AppleColors.labelPrimary} />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.zenActionPill}
            onPress={() => {
              if (!wallet.isConnected) {
                openAuthSheet();
              } else if (heroMatch) {
                openPositionSheet({
                  match: heroMatch,
                  agentId: heroMatch.whiteAgent.id,
                  agentName: heroMatch.whiteAgent.name,
                  outcome: 'WHITE',
                  estimatedMultiplier: heroMatch.marketEstimates.whiteMultiplier,
                });
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.zenActionPillText}>Auto-Swap ⇄</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.zenActionPill}
            onPress={() => router.push('/(tabs)/activity')}
            activeOpacity={0.8}
          >
            <Text style={styles.zenActionPillText}>Positions ☵</Text>
          </TouchableOpacity>

          {/* Floating High-Contrast Circular Action Button */}
          <TouchableOpacity
            style={styles.zenPlusButton}
            onPress={handlePlusAction}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Zenvest Floating Rounded Bottom Container: Live Autonomous Matches */}
        <View style={styles.zenSheetContainer}>
          <View style={styles.zenSheetHeader}>
            <View>
              <Text style={styles.zenSheetTitle}>Live Autonomous Matches</Text>
              <Text style={styles.zenSheetSubtitle}>Verifiable on-chain prediction pools</Text>
            </View>
            <TouchableOpacity
              style={styles.zenSearchIconBtn}
              onPress={() => router.push('/(tabs)/arena')}
            >
              <Ionicons name="search" size={18} color={AppleColors.labelSecondary} />
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
              <Skeleton height={200} borderRadius={Radii.lg} style={{ marginBottom: Spacing.md }} />
              <Skeleton height={120} borderRadius={Radii.lg} style={{ marginBottom: Spacing.md }} />
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

          {/* Featured Live Match Card */}
          {!isLoading && heroMatch && (
            <Card
              style={styles.heroCard}
              onPress={() => router.push(`/match/${heroMatch.id}`)}
            >
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

                <View style={styles.vsBadge}>
                  <Text style={styles.vsText}>VS</Text>
                  <Text style={styles.timeControlText}>{heroMatch.timeControl}</Text>
                </View>

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

              {/* 1-Tap Odds Quotes */}
              <View style={styles.oddsContainer}>
                <MarketQuote
                  label={heroMatch.whiteAgent.name.split('-')[0]}
                  estimatedMultiplier={heroMatch.marketEstimates.whiteMultiplier}
                  onPress={() => {
                    if (!wallet.isConnected) {
                      openAuthSheet();
                      return;
                    }
                    openPositionSheet({
                      match: heroMatch,
                      agentId: heroMatch.whiteAgent.id,
                      agentName: heroMatch.whiteAgent.name,
                      outcome: 'WHITE',
                      estimatedMultiplier: heroMatch.marketEstimates.whiteMultiplier,
                    });
                  }}
                  style={styles.oddsBox}
                />
                <MarketQuote
                  label="DRAW"
                  estimatedMultiplier={heroMatch.marketEstimates.drawMultiplier}
                  onPress={() => {
                    if (!wallet.isConnected) {
                      openAuthSheet();
                      return;
                    }
                    openPositionSheet({
                      match: heroMatch,
                      agentId: 'draw',
                      agentName: 'Draw Outcome',
                      outcome: 'DRAW',
                      estimatedMultiplier: heroMatch.marketEstimates.drawMultiplier,
                    });
                  }}
                  style={styles.oddsBox}
                />
                <MarketQuote
                  label={heroMatch.blackAgent.name.split('-')[0]}
                  estimatedMultiplier={heroMatch.marketEstimates.blackMultiplier}
                  onPress={() => {
                    if (!wallet.isConnected) {
                      openAuthSheet();
                      return;
                    }
                    openPositionSheet({
                      match: heroMatch,
                      agentId: heroMatch.blackAgent.id,
                      agentName: heroMatch.blackAgent.name,
                      outcome: 'BLACK',
                      estimatedMultiplier: heroMatch.marketEstimates.blackMultiplier,
                    });
                  }}
                  style={styles.oddsBox}
                />
              </View>

              <Button
                title="Spectate & Replay"
                onPress={() => router.push(`/match/${heroMatch.id}`)}
                variant="tinted"
                size="md"
                style={styles.heroCta}
              />
            </Card>
          )}

          {/* Upcoming Matches */}
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
    paddingTop: Platform.OS === 'android' ? 32 : Spacing.sm,
    paddingBottom: Spacing.xxl,
  },
  zenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  zenBrandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  zenLogoBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: AppleColors.cardElevated,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zenLogoImg: {
    width: 26,
    height: 26,
  },
  zenBrandTitle: {
    ...Typography.title3,
    color: AppleColors.labelPrimary,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  zenBrandSub: {
    fontSize: 9,
    color: AppleColors.brandEmerald,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 1,
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
  zenProfilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppleColors.cardElevated,
    borderWidth: 1,
    borderColor: AppleColors.border,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radii.pill,
    gap: 6,
  },
  zenStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppleColors.labelQuaternary,
  },
  zenStatusDotActive: {
    backgroundColor: AppleColors.brandEmerald,
  },
  zenProfileText: {
    ...Typography.caption1,
    color: AppleColors.labelPrimary,
    fontWeight: '700',
  },
  greetingSection: {
    marginBottom: Spacing.md,
  },
  greetingSub: {
    ...Typography.caption1,
    color: AppleColors.labelSecondary,
    fontWeight: '500',
  },
  greetingTitle: {
    ...Typography.title1,
    color: AppleColors.labelPrimary,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  zenCard: {
    position: 'relative',
    backgroundColor: AppleColors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: Spacing.lg,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  zenCardGlowWave: {
    position: 'absolute',
    bottom: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  zenCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  zenCurrencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 6,
  },
  solanaMintDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: AppleColors.brandCyan,
  },
  zenCurrencyText: {
    fontSize: 10,
    fontWeight: '700',
    color: AppleColors.labelPrimary,
    letterSpacing: 0.5,
  },
  zenEyeBtn: {
    padding: 4,
  },
  zenBalanceContainer: {
    marginVertical: Spacing.xs,
  },
  zenBalanceLabel: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    fontWeight: '500',
  },
  zenBalanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  zenBalanceCurrency: {
    fontSize: 22,
    color: AppleColors.labelSecondary,
    fontWeight: '600',
    marginTop: 2,
    marginRight: 4,
  },
  zenBalanceValue: {
    fontSize: 34,
    fontWeight: '800',
    color: AppleColors.labelPrimary,
    letterSpacing: -0.8,
  },
  zenSubBalance: {
    ...Typography.footnote,
    color: AppleColors.brandEmerald,
    fontWeight: '600',
    marginTop: 4,
  },
  zenCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  zenFooterLabel: {
    fontSize: 10,
    color: AppleColors.labelTertiary,
    fontWeight: '500',
  },
  zenFooterVal: {
    ...Typography.footnote,
    color: AppleColors.labelPrimary,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  zenActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.lg,
  },
  zenActionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppleColors.cardElevated,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: AppleColors.border,
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 4,
  },
  zenActionPillText: {
    ...Typography.caption1,
    color: AppleColors.labelPrimary,
    fontWeight: '700',
  },
  zenPlusButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zenSheetContainer: {
    backgroundColor: AppleColors.secondaryBackground,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
    padding: Spacing.md,
  },
  zenSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  zenSheetTitle: {
    ...Typography.title3,
    color: AppleColors.labelPrimary,
    fontWeight: '800',
  },
  zenSheetSubtitle: {
    ...Typography.caption2,
    color: AppleColors.labelSecondary,
    marginTop: 1,
  },
  zenSearchIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: AppleColors.cardElevated,
    borderWidth: 1,
    borderColor: AppleColors.border,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: Radii.pill,
    backgroundColor: AppleColors.cardElevated,
    marginRight: Spacing.xs,
    borderWidth: 1,
    borderColor: AppleColors.border,
  },
  categoryChipActive: {
    backgroundColor: AppleColors.brandEmerald,
    borderColor: AppleColors.brandEmerald,
  },
  categoryText: {
    ...Typography.caption2,
    fontWeight: '700',
    color: AppleColors.labelSecondary,
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    paddingVertical: Spacing.md,
  },
  heroCard: {
    marginBottom: Spacing.md,
    backgroundColor: AppleColors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: AppleColors.border,
    padding: Spacing.md,
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
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AppleColors.cardElevated,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
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
    backgroundColor: AppleColors.cardElevated,
    borderWidth: 1,
    borderColor: AppleColors.border,
  },
  agentName: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
    fontWeight: '700',
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
    fontWeight: '800',
    color: AppleColors.labelTertiary,
  },
  timeControlText: {
    ...Typography.caption2,
    color: AppleColors.brandCyan,
    marginTop: 2,
    fontWeight: '600',
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
    ...Typography.headline,
    color: AppleColors.labelPrimary,
    fontWeight: '700',
  },
  sectionBadge: {
    ...Typography.caption2,
    color: AppleColors.brandEmerald,
    marginLeft: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  upcomingCard: {
    marginBottom: Spacing.sm,
    backgroundColor: AppleColors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: AppleColors.border,
    padding: Spacing.md,
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
    fontWeight: '700',
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
    borderTopWidth: 1,
    borderTopColor: AppleColors.border,
    paddingTop: Spacing.sm,
  },
  timeText: {
    ...Typography.caption1,
    color: AppleColors.labelTertiary,
  },
});
