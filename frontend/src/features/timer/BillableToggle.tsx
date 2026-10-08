import { DollarIcon } from '../../components/icons'
import { Tooltip } from '../../components/Tooltip'

export function BillableToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Tooltip label={value ? 'Mark as non-billable' : 'Mark as billable'}>
      <button
        type="button"
        aria-pressed={value}
        onClick={() => onChange(!value)}
        className={`rounded-lg p-1.5 hover:bg-canvas ${value ? 'text-primary' : 'text-line-strong hover:text-ink-soft'}`}
      >
        <DollarIcon />
      </button>
    </Tooltip>
  )
}
