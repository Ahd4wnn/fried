import { useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '../ui'
import { cn } from '../../lib/cn'
import { ChipsReveal } from './reveal'
import type { ChipOption, InputSpec } from './config'

export interface RawAnswer {
  raw: string | string[]
  label: string
}

const SKIPPED = '(skipped)'

const chipClass = (selected: boolean) =>
  cn(
    'focus-ring rounded-full border px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-95',
    selected
      ? 'border-forest bg-forest text-cream shadow-soft'
      : 'border-line/70 bg-paper text-ink hover:border-forest/25 hover:bg-forest-tint/60',
  )

function SingleChips({
  options,
  onSubmit,
}: {
  options: ChipOption[]
  onSubmit: (a: RawAnswer) => void
}) {
  return (
    <ChipsReveal className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={chipClass(false)}
          onClick={() => onSubmit({ raw: opt.value, label: opt.label })}
        >
          {opt.label}
        </button>
      ))}
    </ChipsReveal>
  )
}

function MultiChips({
  options,
  optional,
  onSubmit,
}: {
  options: ChipOption[]
  optional?: boolean
  onSubmit: (a: RawAnswer) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const toggle = (v: string) =>
    setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))

  const submit = () => {
    if (selected.length === 0) {
      onSubmit({ raw: [], label: SKIPPED })
      return
    }
    const labels = options
      .filter((o) => selected.includes(o.value))
      .map((o) => o.label)
    onSubmit({ raw: selected, label: labels.join(', ') })
  }

  return (
    <div className="space-y-3">
      <ChipsReveal className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected.includes(opt.value)}
            className={chipClass(selected.includes(opt.value))}
            onClick={() => toggle(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </ChipsReveal>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit}>
          {selected.length > 0 ? 'Continue' : optional ? 'Skip' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}

function TextAnswer({
  spec,
  onSubmit,
}: {
  spec: Extract<InputSpec, { kind: 'text' }>
  onSubmit: (a: RawAnswer) => void
}) {
  const [value, setValue] = useState('')
  const trimmed = value.trim()

  const send = (e?: FormEvent) => {
    e?.preventDefault()
    if (!trimmed) return
    onSubmit({ raw: trimmed, label: trimmed })
  }

  return (
    <div className="space-y-3">
      <form onSubmit={send} className="flex items-end gap-2">
        {spec.long ? (
          <textarea
            autoFocus
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={spec.placeholder}
            className="focus-ring min-h-[3rem] flex-1 resize-y rounded-xl border border-line/70 bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink-soft/50 transition-all focus:border-forest/30 focus:ring-1 focus:ring-forest/10"
          />
        ) : (
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={spec.placeholder}
            className="focus-ring h-11 flex-1 rounded-xl border border-line/70 bg-paper px-4 text-sm text-ink placeholder:text-ink-soft/50 transition-all focus:border-forest/30 focus:ring-1 focus:ring-forest/10"
          />
        )}
        <Button type="submit" size="md" disabled={!trimmed} aria-label="Send">
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
      {spec.optional && (
        <Button
          variant="quiet"
          size="sm"
          onClick={() => onSubmit({ raw: '', label: SKIPPED })}
        >
          Skip
        </Button>
      )}
    </div>
  )
}

function NumberAnswer({
  spec,
  onSubmit,
}: {
  spec: Extract<InputSpec, { kind: 'number' }>
  onSubmit: (a: RawAnswer) => void
}) {
  const [value, setValue] = useState('')
  const send = (e?: FormEvent) => {
    e?.preventDefault()
    if (value.trim() === '') return
    onSubmit({ raw: value.trim(), label: value.trim() })
  }
  return (
    <div>
      <form onSubmit={send} className="flex items-end gap-2">
        <input
          autoFocus
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={spec.placeholder}
          className="focus-ring h-11 w-40 rounded-xl border border-line/70 bg-paper px-4 text-sm text-ink placeholder:text-ink-soft/50 transition-all focus:border-forest/30 focus:ring-1 focus:ring-forest/10"
        />
        <Button
          type="submit"
          size="md"
          disabled={value.trim() === ''}
          aria-label="Send"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}

const COUNTRIES = [
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'AF', name: 'Afghanistan', flag: '🇦🇫' },
  { code: 'AL', name: 'Albania', flag: '🇦🇱' },
  { code: 'DZ', name: 'Algeria', flag: '🇩🇿' },
  { code: 'AD', name: 'Andorra', flag: '🇦🇩' },
  { code: 'AO', name: 'Angola', flag: '🇦🇴' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
  { code: 'AM', name: 'Armenia', flag: '🇦🇲' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹' },
  { code: 'AZ', name: 'Azerbaijan', flag: '🇦🇿' },
  { code: 'BS', name: 'Bahamas', flag: '🇧🇸' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩' },
  { code: 'BY', name: 'Belarus', flag: '🇧🇾' },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪' },
  { code: 'BT', name: 'Bhutan', flag: '🇧🇹' },
  { code: 'BO', name: 'Bolivia', flag: '🇧🇴' },
  { code: 'BA', name: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  { code: 'BW', name: 'Botswana', flag: '🇧🇼' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'BN', name: 'Brunei', flag: '🇧🇳' },
  { code: 'BG', name: 'Bulgaria', flag: '🇧🇬' },
  { code: 'KH', name: 'Cambodia', flag: '🇰🇭' },
  { code: 'CM', name: 'Cameroon', flag: '🇨🇲' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
  { code: 'CR', name: 'Costa Rica', flag: '🇨🇷' },
  { code: 'HR', name: 'Croatia', flag: '🇭🇷' },
  { code: 'CU', name: 'Cuba', flag: '🇨🇺' },
  { code: 'CY', name: 'Cyprus', flag: '🇨🇾' },
  { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰' },
  { code: 'DO', name: 'Dominican Republic', flag: '🇩🇴' },
  { code: 'EC', name: 'Ecuador', flag: '🇪🇨' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
  { code: 'SV', name: 'El Salvador', flag: '🇸🇻' },
  { code: 'EE', name: 'Estonia', flag: '🇪🇪' },
  { code: 'ET', name: 'Ethiopia', flag: '🇪🇹' },
  { code: 'FI', name: 'Finland', flag: '🇫🇮' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'GE', name: 'Georgia', flag: '🇬🇪' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭' },
  { code: 'GR', name: 'Greece', flag: '🇬🇷' },
  { code: 'GT', name: 'Guatemala', flag: '🇬🇹' },
  { code: 'HN', name: 'Honduras', flag: '🇭🇳' },
  { code: 'HK', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'HU', name: 'Hungary', flag: '🇭🇺' },
  { code: 'IS', name: 'Iceland', flag: '🇮🇸' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'IR', name: 'Iran', flag: '🇮🇷' },
  { code: 'IQ', name: 'Iraq', flag: '🇮🇶' },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪' },
  { code: 'IL', name: 'Israel', flag: '🇮🇱' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'JM', name: 'Jamaica', flag: '🇯🇲' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'JO', name: 'Jordan', flag: '🇯🇴' },
  { code: 'KZ', name: 'Kazakhstan', flag: '🇰🇿' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪' },
  { code: 'KR', name: 'Korea, South', flag: '🇰🇷' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼' },
  { code: 'KG', name: 'Kyrgyzstan', flag: '🇰🇬' },
  { code: 'LA', name: 'Laos', flag: '🇱🇦' },
  { code: 'LV', name: 'Latvia', flag: '🇱🇻' },
  { code: 'LB', name: 'Lebanon', flag: '🇱🇧' },
  { code: 'LR', name: 'Liberia', flag: '🇱🇷' },
  { code: 'LY', name: 'Libya', flag: '🇱🇾' },
  { code: 'LI', name: 'Liechtenstein', flag: '🇱🇮' },
  { code: 'LT', name: 'Lithuania', flag: '🇱🇹' },
  { code: 'LU', name: 'Luxembourg', flag: '🇱🇺' },
  { code: 'MO', name: 'Macao', flag: '🇲🇴' },
  { code: 'MK', name: 'Macedonia', flag: '🇲🇰' },
  { code: 'MG', name: 'Madagascar', flag: '🇲🇬' },
  { code: 'MW', name: 'Malawi', flag: '🇲🇼' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'MV', name: 'Maldives', flag: '🇲🇻' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱' },
  { code: 'MT', name: 'Malta', flag: '🇲🇹' },
  { code: 'MU', name: 'Mauritius', flag: '🇲🇺' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'MD', name: 'Moldova', flag: '🇲🇩' },
  { code: 'MC', name: 'Monaco', flag: '🇲🇨' },
  { code: 'MN', name: 'Mongolia', flag: '🇲🇳' },
  { code: 'ME', name: 'Montenegro', flag: '🇲🇪' },
  { code: 'MA', name: 'Morocco', flag: '🇲🇦' },
  { code: 'MZ', name: 'Mozambique', flag: '🇲🇿' },
  { code: 'MM', name: 'Myanmar', flag: '🇲🇲' },
  { code: 'NA', name: 'Namibia', flag: '🇳🇦' },
  { code: 'NP', name: 'Nepal', flag: '🇳🇵' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
  { code: 'NI', name: 'Nicaragua', flag: '🇳🇮' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'PS', name: 'Palestine', flag: '🇵🇸' },
  { code: 'PA', name: 'Panama', flag: '🇵🇦' },
  { code: 'PG', name: 'Papua New Guinea', flag: '🇵🇬' },
  { code: 'PY', name: 'Paraguay', flag: '🇵🇾' },
  { code: 'PE', name: 'Peru', flag: '🇵🇪' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦' },
  { code: 'RO', name: 'Romania', flag: '🇷🇴' },
  { code: 'RU', name: 'Russia', flag: '🇷🇺' },
  { code: 'RW', name: 'Rwanda', flag: '🇷🇼' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'SN', name: 'Senegal', flag: '🇸🇳' },
  { code: 'RS', name: 'Serbia', flag: '🇷🇸' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'SK', name: 'Slovakia', flag: '🇸🇰' },
  { code: 'SI', name: 'Slovenia', flag: '🇸🇮' },
  { code: 'SO', name: 'Somalia', flag: '🇸🇴' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰' },
  { code: 'SD', name: 'Sudan', flag: '🇸🇩' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭' },
  { code: 'SY', name: 'Syria', flag: '🇸🇾' },
  { code: 'TW', name: 'Taiwan', flag: '🇹🇼' },
  { code: 'TJ', name: 'Tajikistan', flag: '🇹🇯' },
  { code: 'TZ', name: 'Tanzania', flag: '🇹🇿' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
  { code: 'TN', name: 'Tunisia', flag: '🇹🇳' },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷' },
  { code: 'UG', name: 'Uganda', flag: '🇺🇬' },
  { code: 'UA', name: 'Ukraine', flag: '🇺🇦' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'UY', name: 'Uruguay', flag: '🇺🇾' },
  { code: 'UZ', name: 'Uzbekistan', flag: '🇺🇿' },
  { code: 'VE', name: 'Venezuela', flag: '🇻🇪' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'YE', name: 'Yemen', flag: '🇾🇪' },
  { code: 'ZM', name: 'Zambia', flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabwe', flag: '🇿🇼' },
]

function CountryAnswer({ onSubmit }: { onSubmit: (a: RawAnswer) => void }) {
  const [search, setSearch] = useState('')

  const filtered = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()),
  )

  const handleSelect = (code: string, name: string, flag: string) => {
    onSubmit({ raw: code, label: `${flag} ${name}` })
  }

  return (
    <div className="space-y-2.5 w-full max-w-sm">
      {/* Search input */}
      <div className="relative">
        <input
          autoFocus
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search country…"
          className="focus-ring h-11 w-full rounded-xl border border-line/70 bg-paper pl-4 pr-14 text-sm text-ink placeholder:text-ink-soft/50 transition-all focus:border-forest/30 focus:ring-1 focus:ring-forest/10"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-soft/60 hover:text-ink bg-line/40 hover:bg-line rounded-md px-2 py-0.5 transition-all"
          >
            Clear
          </button>
        )}
      </div>

      {/* Floating results panel */}
      <ul className="max-h-52 overflow-y-auto rounded-2xl border border-line/70 bg-paper shadow-lift scrollbar-thin divide-y divide-line/30">
        {filtered.length > 0 ? (
          filtered.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                onClick={() => handleSelect(c.code, c.name, c.flag)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink hover:bg-cream transition-colors"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cream/80 text-base shadow-soft" aria-hidden="true">
                  {c.flag}
                </span>
                <span className="font-medium">{c.name}</span>
              </button>
            </li>
          ))
        ) : (
          <li className="px-4 py-4 text-sm text-ink-soft text-center">
            No countries found
          </li>
        )}
      </ul>
    </div>
  )
}

/** Renders the right input for a step and reports the raw answer + a label. */
export function InputArea({
  spec,
  onSubmit,
}: {
  spec: InputSpec
  onSubmit: (a: RawAnswer) => void
}) {
  switch (spec.kind) {
    case 'single':
      return <SingleChips options={spec.options} onSubmit={onSubmit} />
    case 'multi':
      return (
        <MultiChips
          options={spec.options}
          optional={spec.optional}
          onSubmit={onSubmit}
        />
      )
    case 'text':
      return <TextAnswer spec={spec} onSubmit={onSubmit} />
    case 'number':
      return <NumberAnswer spec={spec} onSubmit={onSubmit} />
    case 'country':
      return <CountryAnswer onSubmit={onSubmit} />
  }
}
