/**
 * Mobile Pi Chat screen — a Paseo-like native chat interface for Pi sessions.
 * Full-screen route under /h/[hostId]/pi-chat/[worktreeId].
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ArrowDown,
  ArrowUp,
  Bot,
  ChevronLeft,
  ChevronDown,
  History,
  Plus,
  Square,
  SquareTerminal,
  Wrench
} from 'lucide-react-native'
import { useHostClient } from '../../../../src/transport/client-context'
import { firstParam } from '../../../../src/source-control/mobile-source-control-screen-state'
import { colors, spacing } from '../../../../src/theme/mobile-theme'
import { MobileMarkdown } from '../../../../src/components/MobileMarkdown'
import { useMobilePiChatController } from '../../../../src/pi-chat/use-mobile-pi-chat-controller'
import { MobilePiChatDrawers } from '../../../../src/pi-chat/MobilePiChatDrawers'
import type { PiChatMessage } from '../../../../../src/shared/pi-chat-types'
import { styles } from '../../../../src/pi-chat/mobile-pi-chat-styles'

export default function MobilePiChatScreen() {
  const params = useLocalSearchParams<{
    hostId?: string | string[]
    worktreeId?: string | string[]
    name?: string | string[]
  }>()
  const hostId = firstParam(params.hostId) ?? ''
  const worktreeId = firstParam(params.worktreeId) ?? ''
  const worktreeName = firstParam(params.name) ?? ''
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { client } = useHostClient(hostId)
  const sessionId = `pi-chat:${worktreeId}`

  const controller = useMobilePiChatController({
    client,
    worktreeId,
    sessionId
  })

  const {
    session: chatSession,
    send,
    stop,
    newSession,
    switchSession,
    listModels,
    setModel,
    listSessions,
    deleteSession
  } = controller
  const { messages, status, error, agentWorking, streamingText } = chatSession

  const [composerText, setComposerText] = useState('')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [modelLabel, setModelLabel] = useState<string | null>(null)
  const [modelOptions, setModelOptions] = useState<
    Array<{ value: string; label: string; subtitle?: string }>
  >([])
  const [sessions, setSessions] = useState<
    Array<{ path: string; id: string; firstMessage: string; createdAt: number; isActive: boolean }>
  >([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const listRef = useRef<FlatList<PiChatMessage>>(null)
  const [atBottom, setAtBottom] = useState(true)

  // Load models once.
  useEffect(() => {
    if (!client) {
      return
    }
    void listModels().then((list) => {
      setModelOptions(
        list.map((m) => ({
          value: m.ref,
          label: m.name !== m.modelId ? `${m.name} (${m.modelId})` : m.modelId,
          subtitle: `${Math.round(m.contextWindow / 1000)}k ctx · ${m.provider}`
        }))
      )
    })
  }, [client, listModels])

  // Refresh sessions when history opens.
  useEffect(() => {
    if (!historyOpen || !client) {
      return
    }
    setSessionsLoading(true)
    void listSessions().then((s) => {
      setSessions(s)
      setSessionsLoading(false)
    })
  }, [historyOpen, client, listSessions])

  const handleSend = useCallback(async () => {
    const text = composerText.trim()
    if (!text || sending || agentWorking) {
      return
    }
    setSending(true)
    setComposerText('')
    await send(text)
    setSending(false)
  }, [composerText, send, sending, agentWorking])

  const handleModelSelect = useCallback(
    async (value: string) => {
      setModelPickerOpen(false)
      try {
        const label = await setModel(value)
        setModelLabel(label)
      } catch {
        // Best-effort
      }
    },
    [setModel]
  )

  const handleNewSession = useCallback(async () => {
    setHistoryOpen(false)
    await newSession()
  }, [newSession])

  const handleSwitchSession = useCallback(
    async (path: string) => {
      setHistoryOpen(false)
      await switchSession(path)
    },
    [switchSession]
  )

  const handleDeleteSession = useCallback(
    async (path: string) => {
      await deleteSession(path)
      setSessions((prev) => prev.filter((s) => s.path !== path))
    },
    [deleteSession]
  )

  // Scroll to bottom on new messages when at bottom.
  useEffect(() => {
    if (atBottom && messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60)
    }
  }, [messages.length, atBottom])

  const renderMessage = useCallback(({ item }: { item: PiChatMessage }) => {
    if (item.role === 'user') {
      return (
        <View style={styles.messageRow}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{item.content}</Text>
          </View>
        </View>
      )
    }
    if (item.role === 'tool') {
      return (
        <View style={styles.toolChip}>
          <Wrench size={12} color={colors.textMuted} />
          <Text style={styles.toolChipText}>{item.toolName ?? item.content}</Text>
        </View>
      )
    }
    if (item.role === 'system') {
      return <Text style={styles.systemError}>{item.content}</Text>
    }
    // Assistant
    return (
      <View style={styles.assistantRow}>
        <Bot size={16} color={colors.textSecondary} style={styles.assistantIcon} />
        <View style={styles.assistantContent}>
          <MobileMarkdown content={item.content} textScale={1.1} />
        </View>
      </View>
    )
  }, [])

  const canSend = composerText.trim().length > 0 && !agentWorking && !sending

  const emptyState = (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>Start a chat with Pi</Text>
      <Text style={styles.emptySubtitle}>
        Ask about your code, run commands, or edit files in this workspace.
      </Text>
    </View>
  )

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top > 0 ? 0 : spacing.sm }]}>
        <Pressable style={styles.headerBack} onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {worktreeName || 'Pi Chat'}
        </Text>

        {/* New chat */}
        <Pressable
          style={styles.headerButton}
          onPress={handleNewSession}
          hitSlop={8}
          disabled={agentWorking}
        >
          <Plus size={18} color={agentWorking ? colors.textMuted : colors.textSecondary} />
        </Pressable>

        {/* Session history */}
        <Pressable style={styles.headerButton} onPress={() => setHistoryOpen(true)} hitSlop={8}>
          <History size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Model picker row */}
      <Pressable style={styles.headerModelPicker} onPress={() => setModelPickerOpen(true)}>
        <SquareTerminal size={14} color={colors.textMuted} />
        <Text style={styles.headerModelText} numberOfLines={1}>
          {modelLabel ?? 'Auto'}
        </Text>
        <ChevronDown size={12} color={colors.textMuted} />
      </Pressable>

      {/* Messages */}
      {status === 'error' && error ? <Text style={styles.errorText}>{error}</Text> : null}
      <FlatList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        ListEmptyComponent={emptyState}
        ListFooterComponent={
          agentWorking && streamingText ? (
            <View style={styles.assistantRow}>
              <Bot size={16} color={colors.textSecondary} style={styles.assistantIcon} />
              <View style={styles.assistantContent}>
                <MobileMarkdown content={streamingText} textScale={1.1} />
              </View>
            </View>
          ) : null
        }
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
          setAtBottom(contentSize.height - (contentOffset.y + layoutMeasurement.height) < 80)
        }}
        scrollEventThrottle={32}
      />

      {/* Vertical spacer for composer */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Composer */}
        <View style={styles.composerBar}>
          <TextInput
            style={styles.composerInput}
            value={composerText}
            onChangeText={setComposerText}
            placeholder="Ask Pi about this workspace…"
            placeholderTextColor={colors.textMuted}
            multiline
            editable={!agentWorking}
            selectionColor={colors.accentBlue}
          />
          {agentWorking ? (
            <Pressable style={styles.composerStop} onPress={stop}>
              <Square size={16} color={colors.onAccent} fill={colors.onAccent} />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.composerSend, !canSend && styles.composerSendDisabled]}
              onPress={handleSend}
              disabled={!canSend}
            >
              <ArrowUp
                size={18}
                color={canSend ? colors.bgBase : colors.textMuted}
                strokeWidth={2.6}
              />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      <MobilePiChatDrawers
        modelPickerOpen={modelPickerOpen}
        historyOpen={historyOpen}
        modelOptions={modelOptions.map((option) => ({
          ref: option.value,
          name: option.label,
          modelId: option.value.split('/').pop() ?? option.value,
          provider: option.value.split('/')[0] ?? 'other',
          contextWindow: 0
        }))}
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        onCloseModelPicker={() => setModelPickerOpen(false)}
        onCloseHistory={() => setHistoryOpen(false)}
        onSelectModel={handleModelSelect}
        onNewSession={handleNewSession}
        onSwitchSession={handleSwitchSession}
        onDeleteSession={handleDeleteSession}
      />

      {/* Jump-to-bottom FAB */}
      {!atBottom && messages.length > 0 ? (
        <Pressable
          style={styles.fab}
          onPress={() => listRef.current?.scrollToEnd({ animated: true })}
        >
          <ArrowDown size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </SafeAreaView>
  )
}
