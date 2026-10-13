/**
 * Apple Human Interface Guidelines - System Color Palette (Dark Mode First)
 * Designed for iOS-forward native feel, calm confidence, and high legibility.
 */

export const AppleColors = {
  // Base System Backgrounds
  background: '#000000',                  // Pure Dark background
  secondaryBackground: '#1C1C1E',         // System Grouped Secondary
  tertiaryBackground: '#2C2C2E',          // System Grouped Tertiary
  elevatedBackground: '#3A3A3C',          // Elevated cards & popovers
  glassSurface: 'rgba(28, 28, 30, 0.72)',  // Frosted material
  glassSurfaceLight: 'rgba(44, 44, 46, 0.65)',

  // Apple System Accents
  systemBlue: '#0A84FF',                  // Primary iOS Accent (Action, Selection)
  systemGreen: '#30D158',                 // Win, Favorable Odds, Positive PnL
  systemRed: '#FF453A',                   // Loss, Unfavorable Odds, Check Warning
  systemOrange: '#FF9F0A',                // Live badge, Warning, In-Progress
  systemYellow: '#FFD60A',                // Highlight, Rating, Star
  systemPurple: '#BF5AF2',                // Grandmaster / Special Tier
  systemIndigo: '#5E5CE6',                // Engine / Neural Tier
  systemTeal: '#64D2FF',                  // Experimental Tier
  systemMint: '#63E6E2',                  // Bot Speed / Low Latency

  // System Text / Labels
  labelPrimary: '#FFFFFF',                // Primary Text
  labelSecondary: '#8E8E93',              // Secondary Subheadings
  labelTertiary: '#636366',               // Footnotes & De-emphasized
  labelQuaternary: '#48484A',             // Disabled / Ghost Text

  // Separators & Borders
  separator: 'rgba(84, 84, 88, 0.45)',    // Subtle list separator
  separatorOpaque: '#38383A',             // Non-transparent divider
  cardBorder: 'rgba(255, 255, 255, 0.08)',// Crisp Apple border outline
  accentBorder: 'rgba(10, 132, 255, 0.3)',// Focused border

  // Fills & Controls
  fill: 'rgba(120, 120, 128, 0.24)',      // Inset inputs & pill backgrounds
  fillSecondary: 'rgba(120, 120, 128, 0.16)',
  fillTertiary: 'rgba(118, 118, 128, 0.12)',

  // Chessboard Cupertino Themes
  boardLight: '#ECEED2',
  boardDark: '#769656',
  boardSlateLight: '#DFE3E8',
  boardSlateDark: '#5E7083',
  boardDarkLight: '#32363E',
  boardDarkDark: '#1E2228',
  squareHighlight: 'rgba(10, 132, 255, 0.38)',
  squareLastMove: 'rgba(255, 214, 10, 0.35)',
  squareCheckRing: '#FF453A',
} as const;

export type AppleColorToken = keyof typeof AppleColors;
