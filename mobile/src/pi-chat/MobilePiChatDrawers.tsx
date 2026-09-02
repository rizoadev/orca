import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react-native'
import { BottomDrawer } from '../components/BottomDrawer'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import type { PiModelOption, PiSessionInfo } from '../../../src/shared/pi-chat-types'

export function MobilePiChatDrawers(props: {
  modelPickerOpen: boolean
  historyOpen: boolean
  modelOptions: PiModelOption[]
  sessions: PiSessionInfo[]
  sessionsLoading: boolean
  onCloseModelPicker: () => void
  onCloseHistory: () => void
  onSelectModel: (value: string) => void
  onNewSession: () => void
  onSwitchSession: (path: string) => void
  onDeleteSession: (path: string) => void
}): ReactNode {
  const groupedModels = Object.groupBy(props.modelOptions, (model) => model.provider)
  return (
    <>
      <BottomDrawer visible={props.modelPickerOpen} onClose={props.onCloseModelPicker}>
        <View style={{ padding: spacing.lg }}>
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: typography.bodySize,
              fontWeight: '600',
              marginBottom: spacing.md
            }}
          >
            Select model
          </Text>
          {Object.entries(groupedModels).map(([provider, models]) => (
            <View key={provider}>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: typography.metaSize,
                  fontFamily: typography.monoFamily,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: spacing.xs,
                  marginTop: spacing.sm
                }}
              >
                {provider}
              </Text>
              {models?.map((model) => (
                <Pressable
                  key={model.ref}
                  style={({ pressed }) => ({
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    backgroundColor: pressed ? colors.bgRaised : 'transparent',
                    borderRadius: radii.row,
                    marginBottom: 2
                  })}
                  onPress={() => props.onSelectModel(model.ref)}
                >
                  <Text
                    style={{ color: colors.textPrimary, fontSize: typography.bodySize }}
                    numberOfLines={1}
                  >
                    {model.name !== model.modelId
                      ? `${model.name} (${model.modelId})`
                      : model.modelId}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: typography.metaSize }}>
                    {Math.round(model.contextWindow / 1000)}k ctx · {model.provider}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
          {props.modelOptions.length === 0 ? (
            <Text
              style={{
                color: colors.textMuted,
                fontSize: typography.metaSize,
                textAlign: 'center',
                paddingVertical: spacing.lg
              }}
            >
              No models available
            </Text>
          ) : null}
        </View>
      </BottomDrawer>

      <BottomDrawer visible={props.historyOpen} onClose={props.onCloseHistory}>
        <View style={{ padding: spacing.lg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: spacing.md
            }}
          >
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: typography.bodySize,
                fontWeight: '600'
              }}
            >
              Session History
            </Text>
            <Pressable
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.sm,
                borderRadius: radii.button,
                backgroundColor: pressed ? colors.bgRaised : 'transparent'
              })}
              onPress={props.onNewSession}
            >
              <Plus size={14} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: typography.metaSize }}>
                New chat
              </Text>
            </Pressable>
          </View>
          {props.sessionsLoading ? (
            <ActivityIndicator color={colors.textMuted} style={{ paddingVertical: spacing.lg }} />
          ) : props.sessions.length === 0 ? (
            <Text
              style={{
                color: colors.textMuted,
                fontSize: typography.metaSize,
                textAlign: 'center',
                paddingVertical: spacing.lg
              }}
            >
              No saved sessions
            </Text>
          ) : (
            props.sessions.map((session) => (
              <Pressable
                key={session.path}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  backgroundColor: pressed || session.isActive ? colors.bgRaised : 'transparent',
                  borderRadius: radii.row,
                  marginBottom: 2
                })}
                onPress={() => props.onSwitchSession(session.path)}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: colors.textPrimary, fontSize: typography.bodySize }}
                    numberOfLines={1}
                  >
                    {session.firstMessage || '(empty session)'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: typography.metaSize }}>
                    {new Date(session.createdAt).toLocaleDateString()}
                    {session.isActive ? ' · active' : ''}
                  </Text>
                </View>
                <Pressable
                  style={{ padding: spacing.xs }}
                  onPress={() => props.onDeleteSession(session.path)}
                  hitSlop={8}
                >
                  <Trash2 size={14} color={colors.textMuted} />
                </Pressable>
              </Pressable>
            ))
          )}
        </View>
      </BottomDrawer>
    </>
  )
}
