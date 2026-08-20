import type { GitStatusEntry } from '../../../../shared/git-status-types'
import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Github, Gitlab } from 'lucide-react'
import mountainLandscapeUrl from '../../../../../resources/mountain-landscape-transparent.svg?url'
import catPlayingUrl from '../../../../../resources/cat-playing.svg?url'
import catWatermelonUrl from '../../../../../resources/cat-watermelon.svg?url'
import catDanceUrl from '../../../../../resources/cat-dance.svg?url'
import { usePomodoroStore, type PomodoroPhase } from '../right-sidebar/pomodoro-timer-store'
import { parseRemoteRepo } from '../right-sidebar/source-control-remote-repo'
import { branchName } from '../../lib/git-utils'
import { useAppStore } from '../../store'

const HERO_PETS = [
  { url: catPlayingUrl, className: 'pet-hero-roam-left' },
  { url: catWatermelonUrl, className: 'pet-hero-roam-center' },
  { url: catDanceUrl, className: 'pet-hero-roam-right' }
] as const

// Why: stable reference to avoid infinite re-render when worktree has no git status yet.
const EMPTY_GIT_ENTRIES: GitStatusEntry[] = []

type PetHeroMode = 'working' | 'cooldown' | 'sleep' | 'rest'

function formatLiveTime(): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date())
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function pomodoroPhaseLabel(phase: PomodoroPhase): string {
  if (phase === 'focus') {
    return 'focus'
  }
  return phase === 'long-break' ? 'long break' : 'break'
}

export default function PetHero({ worktreeId }: { worktreeId: string }): React.JSX.Element | null {
  const workspace = useAppStore(
    useShallow((state) => {
      for (const worktrees of Object.values(state.worktreesByRepo)) {
        const worktree = worktrees.find((item) => item.id === worktreeId)
        if (worktree) {
          const repo = state.repos.find((repo) => repo.id === worktree.repoId)
          return {
            branch: branchName(worktree.branch),
            projectName: repo?.displayName ?? null,
            remoteUrl: repo?.gitRemoteIdentity?.remoteUrl ?? null
          }
        }
      }
      return null
    })
  )
  const repoHost = workspace?.remoteUrl
    ? (() => {
        const ref = parseRemoteRepo(workspace.remoteUrl)
        if (ref?.provider === 'github' || ref?.provider === 'gitlab') {
          return { provider: ref.provider as 'github' | 'gitlab', url: ref.webBaseUrl }
        }
        return null
      })()
    : null
  const petMode = useAppStore((state): PetHeroMode => {
    let hasWorkingAgent = false
    let hasWaitingAgent = false
    for (const entry of Object.values(state.agentStatusByPaneKey)) {
      if (entry.worktreeId !== worktreeId) {
        continue
      }
      if (entry.state === 'working') {
        hasWorkingAgent = true
      } else if (entry.state === 'waiting' || entry.state === 'blocked') {
        hasWaitingAgent = true
      }
    }
    const hasSleepingAgent = Object.values(state.sleepingAgentSessionsByPaneKey).some(
      (entry) => entry.worktreeId === worktreeId
    )
    if (hasWorkingAgent) {
      return 'working'
    }
    if (hasSleepingAgent) {
      return 'sleep'
    }
    if (hasWaitingAgent) {
      return 'rest'
    }
    return 'rest'
  })
  const pomodoroPhase = usePomodoroStore((state) => state.phase)
  const pomodoroSecondsLeft = usePomodoroStore((state) => state.secondsLeft)
  const pomodoroRunning = usePomodoroStore((state) => state.running)
  const gitEntries = useAppStore(
    (state) => state.gitStatusByWorktree[worktreeId] ?? EMPTY_GIT_ENTRIES
  )
  const gitDiffStats = useMemo(() => {
    let added = 0
    let removed = 0
    for (const entry of gitEntries) {
      if (entry.added != null) {
        added += entry.added
      }
      if (entry.removed != null) {
        removed += entry.removed
      }
    }
    return { added, removed }
  }, [gitEntries])

  const [currentTime, setCurrentTime] = useState(() => formatLiveTime())

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(formatLiveTime()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const hour = new Date().getHours()
  const timeOfDay = hour < 11 ? 'Pagi' : hour < 15 ? 'Siang' : hour < 18 ? 'Sore' : 'Malam'
  const greeting = `${timeOfDay}, Riza.`
  const effectiveMode: PetHeroMode =
    pomodoroPhase !== 'focus'
      ? 'cooldown'
      : pomodoroRunning || petMode === 'working'
        ? 'working'
        : petMode
  const modeLabel =
    effectiveMode === 'working'
      ? 'working'
      : effectiveMode === 'cooldown'
        ? 'cooldown'
        : effectiveMode === 'sleep'
          ? 'sleeping'
          : 'resting'

  return (
    <header className="pet-hero" data-pet-hero="true" data-pet-mode={effectiveMode}>
      <div className="pet-hero-copy">
        <p className="pet-hero-eyebrow">ORCA / WORKSPACE</p>
        <h1 className="pet-hero-title">{greeting}</h1>
        <p className="pet-hero-description">Semangat kerja ya — buat nabung rumah.</p>
        <p className="pet-hero-workspace">
          {workspace?.projectName || 'Orca project'} / {workspace?.branch || 'detached'}
          {repoHost && (
            <a
              className="pet-hero-repo-link"
              href={repoHost.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open on ${repoHost.provider}`}
            >
              {repoHost.provider === 'github' ? <Github size={14} /> : <Gitlab size={14} />}
            </a>
          )}
        </p>
      </div>
      <div className="pet-hero-scene" aria-hidden="true">
        <div className="pet-hero-stars">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="pet-hero-horizon" />
        <img className="pet-hero-mountains" src={mountainLandscapeUrl} alt="" draggable={false} />
        {HERO_PETS.map((pet) => (
          <img
            key={pet.url}
            className={`pet-hero-pet ${pet.className}`}
            src={pet.url}
            alt=""
            draggable={false}
          />
        ))}
      </div>
      <div className="pet-hero-status" aria-label={`Pets are ${modeLabel}`}>
        <span className="pet-hero-status-dot" />
        <span>
          {currentTime} · {modeLabel}
        </span>
        {(gitDiffStats.added > 0 || gitDiffStats.removed > 0) && (
          <span className="pet-hero-git-diff">
            {gitDiffStats.added > 0 && (
              <span className="pet-hero-git-added">+{gitDiffStats.added}</span>
            )}
            {gitDiffStats.removed > 0 && (
              <span className="pet-hero-git-removed">-{gitDiffStats.removed}</span>
            )}
          </span>
        )}
      </div>
      <div
        className="pet-hero-pomodoro"
        aria-label={`Pomodoro ${pomodoroPhaseLabel(pomodoroPhase)}`}
      >
        <span className="pet-hero-pomodoro-label">{pomodoroPhaseLabel(pomodoroPhase)}</span>
        <strong>{formatCountdown(pomodoroSecondsLeft)}</strong>
        <span className="pet-hero-pomodoro-state">{pomodoroRunning ? 'live' : 'paused'}</span>
      </div>
    </header>
  )
}
