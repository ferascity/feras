import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Stepper } from '@/components/ui/Stepper';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { submitAgent } from '@/services/api/agents';
import { useFerasStore } from '@/store/useFerasStore';
import { AppleColors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { Radii, Spacing } from '@/theme/spacing';

const WIZARD_STEPS = ['Identity', 'Engine', 'Stake', 'Review'];

const MODEL_CHOICES = [
  { label: 'DeepSeek-R1', value: 'DeepSeek-R1-Distill-32B' },
  { label: 'Llama 3.3', value: 'Llama-3.3-70B-Instruct' },
  { label: 'Custom API', value: 'Custom Endpoint API' },
];

const SEARCH_CHOICES = [
  { label: 'MCTS Guided', value: 'MCTS + Value Net Guided' },
  { label: 'Alpha-Beta', value: 'Alpha-Beta + Quiescence' },
];

export default function SubmitAgentWizard() {
  const router = useRouter();
  const showToast = useFerasStore((state) => state.showToast);

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [tagline, setTagline] = useState('');
  const [badgeEmoji, setBadgeEmoji] = useState('🤖');

  const [baseModel, setBaseModel] = useState('DeepSeek-R1-Distill-32B');
  const [searchAlgorithm, setSearchAlgorithm] = useState('MCTS + Value Net Guided');
  const [evalDepth, setEvalDepth] = useState('24');

  const [stakeSol, setStakeSol] = useState('1.0');
  const [acceptedRules, setAcceptedRules] = useState(false);

  const triggerHaptic = () => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.selectionAsync();
      } catch {}
    }
  };

  const handleNext = () => {
    triggerHaptic();
    setCurrentStep((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
  };

  const handleBack = () => {
    triggerHaptic();
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleDeploy = async () => {
    try {
      setLoading(true);
      const newAgent = await submitAgent({
        name: name || 'Neural-Vanguard-v1',
        handle: handle || '@vanguard_agent',
        tagline: tagline || 'Autonomous positional chess agent powered by custom neural weights.',
        badgeEmoji,
        baseModel,
        searchAlgorithm,
        evalDepth: parseInt(evalDepth, 10) || 24,
        stakeSol: parseFloat(stakeSol) || 1.0,
      });

      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
      }

      showToast({
        type: 'success',
        title: 'Agent Deployed!',
        message: `${newAgent.name} is now registered in the Arena.`,
      });

      router.replace('/(tabs)/my-agents');
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Deployment Failed',
        message: err.message || 'Unable to deploy agent.',
      });
    } finally {
      setLoading(false);
    }
  };

  const isStep1Valid = name.trim().length > 0;
  const isStep2Valid = evalDepth.trim().length > 0;
  const isStep3Valid = acceptedRules;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Wizard Stepper */}
        <Stepper
          steps={WIZARD_STEPS}
          currentStep={currentStep}
          style={styles.stepper}
        />

        {/* STEP 1: IDENTITY */}
        {currentStep === 0 && (
          <View>
            <Text style={styles.stepTitle}>Agent Identity</Text>
            <Text style={styles.stepSub}>
              Give your autonomous chess competitor a name, identifier, and avatar emoji.
            </Text>

            <Input
              label="Agent Name"
              placeholder="e.g. Sovereign-Gambit-v2"
              value={name}
              onChangeText={setName}
            />

            <Input
              label="Handle / Tag"
              placeholder="e.g. @sovereign_chess"
              value={handle}
              onChangeText={setHandle}
            />

            <Input
              label="Tagline & Strategy Description"
              placeholder="e.g. Relentless tactical attacker favoring kingside sacrifices."
              value={tagline}
              onChangeText={setTagline}
              multiline
              numberOfLines={2}
            />

            <View style={styles.emojiRow}>
              <Text style={styles.emojiLabel}>Choose Avatar Badge</Text>
              <View style={styles.emojiChips}>
                {['🤖', '🧠', '⚡️', '👑', '🛡️', '🐎', '⚔️', '👾'].map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    onPress={() => setBadgeEmoji(emoji)}
                    style={[
                      styles.emojiChip,
                      badgeEmoji === emoji && styles.emojiChipActive,
                    ]}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Button
              title="Continue to Engine Setup"
              onPress={handleNext}
              disabled={!isStep1Valid}
              variant="primary"
              size="lg"
              style={styles.nextBtn}
            />
          </View>
        )}

        {/* STEP 2: ENGINE ARCHITECTURE */}
        {currentStep === 1 && (
          <View>
            <Text style={styles.stepTitle}>Engine & Model Config</Text>
            <Text style={styles.stepSub}>
              Select the backbone model and search parameters used during match evaluation.
            </Text>

            <Text style={styles.fieldLabel}>Foundation Model</Text>
            <SegmentedControl
              values={MODEL_CHOICES}
              selectedValue={baseModel}
              onChange={setBaseModel}
              style={styles.segmented}
            />

            <Text style={styles.fieldLabel}>Search Algorithm</Text>
            <SegmentedControl
              values={SEARCH_CHOICES}
              selectedValue={searchAlgorithm}
              onChange={setSearchAlgorithm}
              style={styles.segmented}
            />

            <Input
              label="Evaluation Depth (Plies)"
              placeholder="24"
              value={evalDepth}
              onChangeText={setEvalDepth}
              keyboardType="numeric"
            />

            <View style={styles.wizardBtnRow}>
              <Button
                title="Back"
                onPress={handleBack}
                variant="secondary"
                size="lg"
                style={styles.backBtn}
              />
              <Button
                title="Continue to Stake"
                onPress={handleNext}
                disabled={!isStep2Valid}
                variant="primary"
                size="lg"
                style={styles.forwardBtn}
              />
            </View>
          </View>
        )}

        {/* STEP 3: STAKE & RULES */}
        {currentStep === 2 && (
          <View>
            <Text style={styles.stepTitle}>Validator Stake & Rules</Text>
            <Text style={styles.stepSub}>
              All deployed agents lock a mock bond to guarantee fair play and prevent anti-timeout exploits.
            </Text>

            <Input
              label="Validator Bond (SOL)"
              value={stakeSol}
              onChangeText={setStakeSol}
              keyboardType="numeric"
            />

            <Card style={styles.rulesCard}>
              <Text style={styles.rulesTitle}>Arena Fair Play Protocol</Text>
              <Text style={styles.ruleItem}>
                • Move timeout: Max 10.0 seconds per ply
              </Text>
              <Text style={styles.ruleItem}>
                • Illegal move: Instant forfeit of match & bond slash
              </Text>
              <Text style={styles.ruleItem}>
                • 10% of match spectator fees automatically routed to agent owner
              </Text>
            </Card>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setAcceptedRules((prev) => !prev)}
              style={styles.checkboxRow}
            >
              <View
                style={[
                  styles.checkbox,
                  acceptedRules && styles.checkboxChecked,
                ]}
              >
                {acceptedRules && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>
                I accept the Arena Fair Play Protocol and understand the mock slash rules.
              </Text>
            </TouchableOpacity>

            <View style={styles.wizardBtnRow}>
              <Button
                title="Back"
                onPress={handleBack}
                variant="secondary"
                size="lg"
                style={styles.backBtn}
              />
              <Button
                title="Review Agent"
                onPress={handleNext}
                disabled={!isStep3Valid}
                variant="primary"
                size="lg"
                style={styles.forwardBtn}
              />
            </View>
          </View>
        )}

        {/* STEP 4: REVIEW & DEPLOY */}
        {currentStep === 3 && (
          <View>
            <Text style={styles.stepTitle}>Review & Deploy</Text>
            <Text style={styles.stepSub}>
              Confirm your agent specifications before publishing to the Arena leaderboard.
            </Text>

            <Card style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewEmoji}>{badgeEmoji}</Text>
                <View>
                  <Text style={styles.reviewName}>{name || 'Unnamed Agent'}</Text>
                  <Text style={styles.reviewHandle}>{handle || '@agent'}</Text>
                </View>
              </View>

              <View style={styles.reviewDivider} />

              <View style={styles.reviewRow}>
                <Text style={styles.reviewKey}>Base Model</Text>
                <Text style={styles.reviewVal}>{baseModel}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewKey}>Search Method</Text>
                <Text style={styles.reviewVal}>{searchAlgorithm}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewKey}>Search Depth</Text>
                <Text style={styles.reviewVal}>{evalDepth} plies</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewKey}>Validator Bond</Text>
                <Text style={[styles.reviewVal, { color: AppleColors.systemGreen }]}>
                  {stakeSol} SOL
                </Text>
              </View>
            </Card>

            <View style={styles.wizardBtnRow}>
              <Button
                title="Back"
                onPress={handleBack}
                variant="secondary"
                size="lg"
                style={styles.backBtn}
              />
              <Button
                title="Deploy to Arena"
                onPress={handleDeploy}
                loading={loading}
                variant="primary"
                size="lg"
                style={styles.forwardBtn}
              />
            </View>
          </View>
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
  stepper: {
    marginBottom: Spacing.lg,
  },
  stepTitle: {
    ...Typography.title2,
    color: AppleColors.labelPrimary,
  },
  stepSub: {
    ...Typography.subhead,
    color: AppleColors.labelSecondary,
    marginTop: 4,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  emojiRow: {
    marginBottom: Spacing.lg,
  },
  emojiLabel: {
    ...Typography.subhead,
    color: AppleColors.labelSecondary,
    marginBottom: Spacing.xs,
  },
  emojiChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emojiChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppleColors.fillSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: AppleColors.cardBorder,
  },
  emojiChipActive: {
    borderColor: AppleColors.systemBlue,
    backgroundColor: 'rgba(10, 132, 255, 0.2)',
  },
  emojiText: {
    fontSize: 20,
  },
  nextBtn: {
    marginTop: Spacing.md,
    width: '100%',
  },
  fieldLabel: {
    ...Typography.subhead,
    color: AppleColors.labelSecondary,
    marginBottom: Spacing.xs,
  },
  segmented: {
    marginBottom: Spacing.md,
  },
  wizardBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  backBtn: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  forwardBtn: {
    flex: 2,
  },
  rulesCard: {
    backgroundColor: AppleColors.fillSecondary,
    marginBottom: Spacing.md,
  },
  rulesTitle: {
    ...Typography.headline,
    color: AppleColors.labelPrimary,
    marginBottom: Spacing.xs,
  },
  ruleItem: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
    marginVertical: 2,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: AppleColors.labelTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  checkboxChecked: {
    backgroundColor: AppleColors.systemBlue,
    borderColor: AppleColors.systemBlue,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  checkboxLabel: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
    flex: 1,
    lineHeight: 18,
  },
  reviewCard: {
    marginBottom: Spacing.md,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewEmoji: {
    fontSize: 32,
    marginRight: Spacing.md,
  },
  reviewName: {
    ...Typography.title3,
    color: AppleColors.labelPrimary,
  },
  reviewHandle: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
  },
  reviewDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: AppleColors.separator,
    marginVertical: Spacing.md,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  reviewKey: {
    ...Typography.footnote,
    color: AppleColors.labelSecondary,
  },
  reviewVal: {
    ...Typography.footnote,
    color: AppleColors.labelPrimary,
    fontWeight: '600',
  },
});
