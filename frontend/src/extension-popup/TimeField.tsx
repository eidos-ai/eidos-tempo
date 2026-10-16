import { useState } from 'react'
import { parseClockText, toTwelveHour, type Meridiem } from './time'

interface TimeFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
}

export function TimeField({ label, value, onChange }: TimeFieldProps) {
  const [text, setText] = useState(() => toTwelveHour(value).text)
  const [meridiem, setMeridiem] = useState<Meridiem>(() => toTwelveHour(value).meridiem)

  const update = (nextText: string, nextMeridiem: Meridiem) => {
    setText(nextText)
    setMeridiem(nextMeridiem)
    onChange(parseClockText(nextText, nextMeridiem)?.value ?? '')
  }

  const normalize = () => {
    const parsed = parseClockText(text, meridiem)
    if (!parsed) return
    setText(toTwelveHour(parsed.value).text)
    setMeridiem(parsed.meridiem)
  }

  return (
    <div className="flex h-9 items-center rounded-lg border border-line-strong bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      <input
        aria-label={label}
        value={text}
        placeholder="h:mm"
        autoComplete="off"
        onChange={(event) => update(event.target.value, meridiem)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={normalize}
        className="w-12 bg-transparent pl-2 text-sm tabular-nums outline-none"
      />
      <button
        type="button"
        aria-label={`${label}: switch to ${meridiem === 'AM' ? 'PM' : 'AM'}`}
        onClick={() => update(text, meridiem === 'AM' ? 'PM' : 'AM')}
        className="mr-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-ink-soft hover:bg-primary-soft hover:text-accent"
      >
        {meridiem}
      </button>
    </div>
  )
}
