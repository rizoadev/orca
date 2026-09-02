import { ListChecks } from 'lucide-react-native'
import { MobileAgentSessionHistoryIcon } from '../agent-history/MobileAgentSessionHistoryIcon'
import { MobilePiChatIcon } from '../pi-chat/MobilePiChatIcon'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { colors } from '../theme/mobile-theme'

type Props = {
  visible: boolean
  showAgentSessionHistory: boolean
  showChecks: boolean
  showPiChat: boolean
  onOpenAgentSessionHistory: () => void
  onOpenChecks: () => void
  onOpenPiChat: () => void
  onClose: () => void
}

export function MobileSessionHeaderMoreActionsSheet({
  visible,
  showAgentSessionHistory,
  showChecks,
  showPiChat,
  onOpenAgentSessionHistory,
  onOpenChecks,
  onOpenPiChat,
  onClose
}: Props) {
  return (
    <ActionSheetModal
      visible={visible}
      actions={[
        ...(showPiChat
          ? [
              {
                label: 'Pi Chat',
                hint: 'Chat with the Pi agent in this workspace',
                renderIcon: () => (
                  <MobilePiChatIcon size={16} color={colors.textSecondary} strokeWidth={2.1} />
                ),
                onPress: onOpenPiChat
              }
            ]
          : []),
        ...(showAgentSessionHistory
          ? [
              {
                label: 'Agent History',
                hint: 'Browse and resume agent sessions',
                renderIcon: () => (
                  <MobileAgentSessionHistoryIcon
                    size={16}
                    color={colors.textSecondary}
                    strokeWidth={2.1}
                  />
                ),
                onPress: onOpenAgentSessionHistory
              }
            ]
          : []),
        ...(showChecks
          ? [
              {
                label: 'Checks',
                hint: 'Open pull request checks',
                icon: ListChecks,
                onPress: onOpenChecks
              }
            ]
          : [])
      ]}
      onClose={onClose}
    />
  )
}
