/**
 * Styles for the native Pi chat screen (Paseo-like mobile Pi assistant).
 * Uses the same design tokens as the rest of the mobile app.
 */
import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

export const PI_CHAT_TEXT_SIZE = 17

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgBase
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  headerBack: {
    padding: spacing.xs
  },
  headerTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600',
    marginRight: spacing.xs
  },
  headerButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs
  },
  headerButtonDisabled: {
    opacity: 0.4
  },
  modelLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: typography.monoFamily,
    maxWidth: 120
  },
  list: {
    flex: 1
  },
  listContent: {
    paddingVertical: spacing.sm
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl
  },
  emptyTitle: {
    color: colors.textSecondary,
    fontSize: typography.bodySize,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.xs
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: typography.metaSize,
    textAlign: 'center'
  },
  errorText: {
    color: colors.statusRed,
    fontSize: typography.metaSize,
    textAlign: 'center',
    marginBottom: spacing.sm
  },
  messageRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  userBubble: {
    maxWidth: '88%',
    alignSelf: 'flex-end',
    backgroundColor: colors.textPrimary,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  userText: {
    color: colors.bgBase,
    fontSize: PI_CHAT_TEXT_SIZE,
    lineHeight: PI_CHAT_TEXT_SIZE + 6,
    fontWeight: '500'
  },
  assistantRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  assistantIcon: {
    marginTop: 2
  },
  assistantContent: {
    flex: 1
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: 3
  },
  toolChipText: {
    color: colors.textMuted,
    fontFamily: typography.monoFamily,
    fontSize: typography.metaSize - 1
  },
  systemError: {
    color: colors.statusRed,
    fontSize: typography.metaSize,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.bgRaised,
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle
  },
  composerSend: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  composerSendDisabled: {
    backgroundColor: colors.bgRaised
  },
  composerStop: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.statusRed,
    alignItems: 'center',
    justifyContent: 'center'
  },
  streamingSpinner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs
  },
  streamingText: {
    color: colors.textMuted,
    fontSize: typography.metaSize,
    fontStyle: 'italic'
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 80,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgRaised,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle
  },
  headerModelPicker: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  headerModelText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: typography.monoFamily,
    maxWidth: 100
  }
})
