export interface Helpline {
  name: string
  /** Human-readable number, e.g. "14416". */
  number: string
  /** Short, supportive line about who this is for / availability. */
  description?: string
}

/*
 * TODO(Prompt 6): wire to app_config helplines + safety detection. These are
 * static placeholders for layout only — the real, verified numbers must be read
 * from config (never hardcoded in components) and re-verified on a schedule.
 * See docs/safety-and-privacy.md.
 */
export const PLACEHOLDER_HELPLINES: Helpline[] = [
  {
    name: 'Tele-MANAS',
    number: '14416',
    description: 'National government mental health helpline · 24×7',
  },
  {
    name: 'Tele-MANAS (toll-free)',
    number: '1-800-891-4416',
    description: 'Alternate national line · 24×7',
  },
  {
    name: 'Vandrevala Foundation',
    number: '1860-2662-345',
    description: 'Free counselling support · 24×7',
  },
  {
    name: 'iCall (TISS)',
    number: '9152987821',
    description: 'Psychosocial helpline · Mon–Sat, 8am–10pm',
  },
  {
    name: 'AASRA',
    number: '9820466726',
    description: 'Emotional support & crisis intervention · 24×7',
  },
]
