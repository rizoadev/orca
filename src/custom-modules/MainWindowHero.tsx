/**
 * MainWindowHero — single injection point for the hero banner.
 *
 * This is the ONLY file that upstream TabGroupSplitLayout imports.
 * All custom module wiring stays inside src/custom-modules/.
 *
 * After upstream merge conflict, re-add these 2 lines to TabGroupSplitLayout.tsx:
 *
 *   import { MainWindowHero } from '../../../../custom-modules/MainWindowHero'
 *   <MainWindowHero worktreeId={worktreeId} />
 */
import React, { Suspense } from 'react'

const PetHeroBanner = React.lazy(() =>
  import('./hero/PetHeroBanner').then((m) => ({ default: m.PetHeroBanner }))
)

export function MainWindowHero({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  return (
    <Suspense fallback={<div className="h-[154px] shrink-0 border-b border-border bg-card" />}>
      <PetHeroBanner worktreeId={worktreeId} />
    </Suspense>
  )
}
