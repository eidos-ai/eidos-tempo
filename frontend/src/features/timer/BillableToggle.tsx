import { DollarIcon } from '../../components/icons'

export function BillableToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      title={value ? 'Billable (click to make non-billable)' : 'Non-billable (click to make billable)'}
      className={`rounded-lg p-1.5 hover:bg-canvas ${value ? 'text-primary' : 'text-line-strong hover:text-ink-soft'}`}
    >
      <DollarIcon />
    </button>
  )
}
