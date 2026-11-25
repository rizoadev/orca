import { useAppStore } from '../../../store/index'
import { MobileAutoRestoreFitSection } from './MobileAutoRestoreFitSection'

/** Self-contained settings row so MobilePane stays under its line budget. */
export function MobileAutoRestoreFitRow(): React.JSX.Element {
  const autoRestoreFitMs = useAppStore((s) => s.settings?.mobileAutoRestoreFitMs ?? null)
  const updateSettings = useAppStore((s) => s.updateSettings)
  return (
    <div data-settings-row="" className="py-4">
      <MobileAutoRestoreFitSection
        autoRestoreFitMs={autoRestoreFitMs}
        onAutoRestoreFitChange={(ms) => void updateSettings({ mobileAutoRestoreFitMs: ms })}
      />
    </div>
  )
}
