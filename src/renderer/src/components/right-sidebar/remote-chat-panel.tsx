/**
 * Remote Chat panel: tab switcher between Telegram and pi agent chat.
 * Pi chat session is scoped to the active worktree (not an issue).
 */
import { lazy, Suspense, useState } from 'react'
import { MessageCircle, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActiveWorktree } from '@/store/selectors'
import { translate } from '@/i18n/i18n'

const TelegramBridgePanel = lazy(() => import('./TelegramBridgePanel'))
const PiChatPanel = lazy(() => import('./remote-pi-chat-panel'))

type RemoteChatTab = 'telegram' | 'pi'

export default function RemoteChatPanel({
  isVisible
}: {
  isVisible: boolean
}): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<RemoteChatTab>('telegram')
  const activeWorktree = useActiveWorktree()

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Tab switcher */}
      <div className="flex shrink-0 items-center border-b border-border/50 px-2 pt-1">
        <button
          className={cn(
            'flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'telegram'
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('telegram')}
        >
          <MessageCircle className="size-3.5" />
          {translate('auto.components.right.sidebar.RemoteChatPanel.telegram', 'Telegram')}
        </button>
        <button
          className={cn(
            'flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'pi'
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('pi')}
        >
          <Bot className="size-3.5" />
          {translate('auto.components.right.sidebar.RemoteChatPanel.piChat', 'Pi Chat')}
        </button>
      </div>

      {/* Panel content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Loading…
            </div>
          }
        >
          {activeTab === 'telegram' && (
            <TelegramBridgePanel isVisible={isVisible && activeTab === 'telegram'} />
          )}
          {activeTab === 'pi' && activeWorktree && (
            <PiChatPanel
              isVisible={isVisible && activeTab === 'pi'}
              worktreeId={activeWorktree.worktreeId}
              cwd={activeWorktree.localPath ?? ''}
            />
          )}
          {activeTab === 'pi' && !activeWorktree && (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              {translate(
                'auto.components.right.sidebar.RemoteChatPanel.noWorktree',
                'Open a workspace to start a pi chat session.'
              )}
            </div>
          )}
        </Suspense>
      </div>
    </div>
  )
}
