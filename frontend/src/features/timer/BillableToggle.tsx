import { DollarIcon } from '../../components/icons'
import { Tooltip } from '../../components/Tooltip'

interface BillableToggleProps {
  value: boolean
  onChange: (value: boolean) => void
  padding?: 'p-1.5' | 'p-2'
}

export function BillableToggle({ value, onChange, padding = 'p-1.5' }: BillableToggleProps) {
  return (
    <Tooltip label={value ? 'Mark as non-billable' : 'Mark as billable'}>
      <button
        type="button"
        aria-pressed={value}
        onClick={() => onChange(!value)}
        className={`rounded-lg ${padding} hover:bg-canvas ${value ? 'text-primary' : 'text-muted hover:text-primary'}`}
      >
        <DollarIcon />
      </button>
    </Tooltip>
  )
}
