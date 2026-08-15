import { useState } from 'react'
import {
  AzureDevOpsIntegrationCard,
  BitbucketIntegrationCard,
  GiteaIntegrationCard,
  GitHubIntegrationCard,
  GitLabIntegrationCard
} from './source-control-integration-cards'
import { JiraIntegrationCard, LinearIntegrationCard } from './task-tracker-integration-cards'
import { AsanaIntegrationCard } from './asana-integration-card'
import { useIntegrationProviderStatusRefresh } from './use-integration-provider-status-refresh'
import { TelegramBridgeSettingsCard } from './TelegramBridgeSettingsCard'
import { TursoIntegrationCard } from './TursoIntegrationCard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'

export { getIntegrationsPaneSearchEntries } from './integrations-search'

type IntegrationsTab = 'remote-chat' | 'review' | 'tasks' | 'notes'

export function IntegrationsPane(): React.JSX.Element {
  useIntegrationProviderStatusRefresh()
  const [tab, setTab] = useState<IntegrationsTab>('remote-chat')

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as IntegrationsTab)}
      className="gap-4"
    >
      <TabsList variant="line" className="h-8 w-full justify-start overflow-x-auto">
        <TabsTrigger value="remote-chat" className="px-3 text-xs">
          {translate('settings.integrations.remoteChat', 'Remote chat')}
        </TabsTrigger>
        <TabsTrigger value="review" className="px-3 text-xs">
          {translate('auto.components.settings.IntegrationsPane.298c65ecac', 'Review providers')}
        </TabsTrigger>
        <TabsTrigger value="tasks" className="px-3 text-xs">
          {translate('auto.components.settings.IntegrationsPane.70e885705b', 'Task providers')}
        </TabsTrigger>
        <TabsTrigger value="notes" className="px-3 text-xs">
          {translate('settings.integrations.notes', 'Notes')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="remote-chat" className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {translate(
            'settings.integrations.remoteChatDescription',
            'Bridge live Orca agent sessions to external messengers. One Telegram bot, one forum topic per repo.'
          )}
        </p>
        <TelegramBridgeSettingsCard />
      </TabsContent>

      <TabsContent value="review" className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.IntegrationsPane.1683acbac4',
            'Connect the source hosts Orca can use for pull requests, merge requests, checks, and review status.'
          )}
        </p>
        <div className="space-y-3">
          <GitHubIntegrationCard />
          <GitLabIntegrationCard />
          <BitbucketIntegrationCard />
          <AzureDevOpsIntegrationCard />
          <GiteaIntegrationCard />
        </div>
      </TabsContent>

      <TabsContent value="tasks" className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.IntegrationsPane.3ba07f933b',
            'Connect issue trackers Orca can use to browse tasks and start workspaces with linked context.'
          )}
        </p>
        <div className="space-y-3">
          <LinearIntegrationCard />
          <JiraIntegrationCard />
          <AsanaIntegrationCard />
        </div>
      </TabsContent>

      <TabsContent value="notes" className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {translate(
            'settings.integrations.notesDescription',
            'Configure a remote database for backing up and syncing your notes.'
          )}
        </p>
        <TursoIntegrationCard />
      </TabsContent>
    </Tabs>
  )
}
