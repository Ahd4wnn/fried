import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageBubble } from '../ui/MessageBubble'
import { Button } from '../ui'
import { Logo } from '../Logo'
import { useAuth } from '../../auth/auth-context'
import { api, ApiError } from '../../lib/api'
import { useReducedMotion } from '../../motion/useReducedMotion'
import {
  buildPayload,
  computeNext,
  PHASE_MESSAGES,
  QUESTION_STEPS,
  type Answers,
} from './config'
import { InputArea, type RawAnswer } from './inputs'
import { Reveal, GeneratingIndicator } from './reveal'
import { AgreementPanel, ConsentPanel, SuitabilityPanel } from './panels'
import {
  SuitabilityOffRamp,
  UnderageOffRamp,
  UnavailableOffRamp,
} from './offramp'

type Mode = 'chat' | 'underage' | 'flagged' | 'unavailable'
interface Bubble {
  key: number
  role: 'assistant' | 'user'
  text: string
}
interface HistoryEntry {
  step: string
  answers: Partial<Answers>
}
interface Saved {
  answers: Partial<Answers>
  transcript: Bubble[]
  current: string
  mode: Mode
  stepHistory: HistoryEntry[]
}

const STORAGE_KEY = 'hovio_onboarding_v1'

// In-memory/session only — never persisted server-side as partial data.
function loadSaved(): Saved | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}
function clearSaved() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

function assistantTextFor(id: string, a: Partial<Answers>): string {
  if (id in QUESTION_STEPS) {
    return QUESTION_STEPS[id].assistant.replace(
      '{name}',
      a.name?.trim() || 'there',
    )
  }
  if (id === 'agreement' || id === 'consent' || id === 'suitability') {
    return PHASE_MESSAGES[id]
  }
  return ''
}

function rawToPatch(stepId: string, raw: string | string[]): Partial<Answers> {
  const s = typeof raw === 'string' ? raw : ''
  switch (stepId) {
    case 'name':
      return { name: s }
    case 'country':
      return { country: s }
    case 'age':
      return { age: Number.parseInt(s, 10) || 0 }
    case 'gender':
      return { gender: s }
    case 'gender_self':
      return { gender: 'self_describe', gender_self_describe: s || undefined }
    case 'relationship':
      return { relationship_status: s }
    case 'tried_therapy':
      return { tried_therapy: s === 'yes' }
    case 'past_therapy_note':
      return { past_therapy_note: s || undefined }
    case 'financial':
      return { financial_situation: s }
    case 'referral':
      return { referral_source: s }
    case 'referral_other':
      return { referral_other: s || undefined }
    case 'occupation':
      return { occupation: s || undefined }
    case 'concerns':
      return { concerns: Array.isArray(raw) ? raw : [] }
    case 'concerns_other':
      return { concerns_other: s || undefined }
    case 'support':
      return { support_system: s }
    case 'medication':
      return { medication: s }
    case 'language':
      return { preferred_languages: Array.isArray(raw) ? raw : [s] }
    case 'language_other':
      return { preferred_language_other: s || undefined }
    case 'therapist_gender':
      return { therapist_gender_preference: s }
    case 'therapist_should_know':
      return { therapist_should_know: s || undefined }
    default:
      return {}
  }
}

export function OnboardingChat() {
  const navigate = useNavigate()
  const { refreshMe, signOut } = useAuth()
  const reduced = useReducedMotion()

  const saved0 = useMemo(() => loadSaved(), [])
  const answersRef = useRef<Partial<Answers>>(saved0?.answers ?? {})
  const [transcript, setTranscript] = useState<Bubble[]>(
    saved0?.transcript ?? [],
  )
  const [current, setCurrent] = useState<string>(saved0?.current ?? 'name')
  const [stepHistory, setStepHistory] = useState<HistoryEntry[]>(
    saved0?.stepHistory ?? [{ step: 'name', answers: {} }],
  )
  const [mode, setMode] = useState<Mode>(saved0?.mode ?? 'chat')
  const [generating, setGenerating] = useState(false)
  const [inputReady, setInputReady] = useState<boolean>(!!saved0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const keyRef = useRef(saved0?.transcript.length ?? 0)
  const startedRef = useRef(!!saved0)
  const mountedRef = useRef(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const pushBubble = useCallback((role: Bubble['role'], text: string) => {
    keyRef.current += 1
    const key = keyRef.current
    setTranscript((t) => [...t, { key, role, text }])
  }, [])

  const revealAssistant = useCallback(
    async (id: string) => {
      setCurrent(id)
      setStepHistory((prev) => {
        if (prev[prev.length - 1]?.step === id) return prev
        return [
          ...prev,
          {
            step: id,
            answers: JSON.parse(JSON.stringify(answersRef.current)),
          },
        ]
      })
      setInputReady(false)
      const text = assistantTextFor(id, answersRef.current)
      setGenerating(true)
      await delay(reduced ? 150 : 600 + Math.random() * 400)
      if (!mountedRef.current) return
      setGenerating(false)
      if (text) pushBubble('assistant', text)
      setInputReady(true)
    },
    [reduced, pushBubble],
  )

  const handleGoBack = () => {
    if (generating || submitting || stepHistory.length <= 1) return
    const newHistory = [...stepHistory]
    newHistory.pop() // remove current step entry
    const prevEntry = newHistory[newHistory.length - 1]

    setCurrent(prevEntry.step)
    setStepHistory(newHistory)
    answersRef.current = JSON.parse(JSON.stringify(prevEntry.answers))
    setTranscript((t) => t.slice(0, -2))
    setInputReady(true)
    setGenerating(false)
  }

  // First question (guarded against React StrictMode double-invoke + hydration).
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void revealAssistant('name')
  }, [revealAssistant])

  // Persist progress to sessionStorage (client-only).
  useEffect(() => {
    try {
      const payload: Saved = {
        answers: answersRef.current,
        transcript,
        current,
        mode,
        stepHistory,
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // ignore quota / serialization errors
    }
  }, [transcript, current, mode, stepHistory])

  // Smooth auto-scroll to the latest content.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'end',
    })
  }, [transcript, generating, inputReady, mode, reduced])

  const exit = useCallback(async () => {
    clearSaved()
    await signOut()
    navigate('/login', { replace: true })
  }, [navigate, signOut])

  const submit = useCallback(
    async (noneApply: boolean) => {
      setSubmitting(true)
      setSubmitError(null)
      try {
        const result = await api.submitOnboarding(
          buildPayload(answersRef.current, noneApply),
        )
        if (!result.onboarding_completed || result.suitability_flagged) {
          setMode('flagged')
          setInputReady(false)
        } else {
          clearSaved()
          await refreshMe()
          navigate('/dashboard', { replace: true })
        }
      } catch (err) {
        setSubmitError(
          err instanceof ApiError
            ? err.message
            : 'We couldn’t save that just now. Please try again.',
        )
      } finally {
        if (mountedRef.current) setSubmitting(false)
      }
    },
    [navigate, refreshMe],
  )

  const onQuestionAnswer = useCallback(
    (answer: RawAnswer) => {
      const patch = rawToPatch(current, answer.raw)
      answersRef.current = { ...answersRef.current, ...patch }
      pushBubble('user', answer.label)

      if (current === 'country') {
        const selectedCountry = typeof answer.raw === 'string' ? answer.raw : ''
        // Persist country immediately
        void api.updateMe({ country: selectedCountry }).catch((err) => {
          console.warn('Failed to update country in profile:', err)
        })

        if (selectedCountry !== 'IN') {
          setMode('unavailable')
          setInputReady(false)
          return
        }
      }

      const next = computeNext(current, answersRef.current)
      if (next === 'underage_offramp') {
        setMode('underage')
        setInputReady(false)
        return
      }
      void revealAssistant(next)
    },
    [current, pushBubble, revealAssistant],
  )

  const onAgree = useCallback(() => {
    answersRef.current = {
      ...answersRef.current,
      agreement: { age_confirmed: true, terms: true, privacy: true },
    }
    pushBubble('user', 'I agree to the Terms and Privacy Policy.')
    void revealAssistant('consent')
  }, [pushBubble, revealAssistant])

  const onConsent = useCallback(
    (result: {
      ai_memory: boolean
      notifications_whatsapp: boolean
      notifications_email: boolean
      whatsapp_number?: string
    }) => {
      answersRef.current = {
        ...answersRef.current,
        consents: {
          data_processing: true,
          ai_memory: result.ai_memory,
          notifications_whatsapp: result.notifications_whatsapp,
          notifications_email: result.notifications_email,
        },
        whatsapp_number: result.whatsapp_number,
      }
      pushBubble('user', 'Saved my privacy preferences.')
      void revealAssistant('suitability')
    },
    [pushBubble, revealAssistant],
  )

  const onSuitability = useCallback(
    (noneApply: boolean) => {
      pushBubble(
        'user',
        noneApply ? 'No, none of these apply.' : 'One or more applies to me.',
      )
      void submit(noneApply)
    },
    [pushBubble, submit],
  )

  const renderInput = () => {
    if (!inputReady || generating) return null
    if (current in QUESTION_STEPS) {
      return (
        <InputArea
          key={current}
          spec={QUESTION_STEPS[current].input}
          onSubmit={onQuestionAnswer}
        />
      )
    }
    if (current === 'agreement') return <AgreementPanel onConfirm={onAgree} />
    if (current === 'consent') return <ConsentPanel onConfirm={onConsent} />
    if (current === 'suitability') {
      return (
        <SuitabilityPanel
          onChoose={onSuitability}
          submitting={submitting}
          error={submitError}
        />
      )
    }
    return null
  }

  return (
    <div className="flex h-svh flex-col bg-cream text-ink">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <Button variant="quiet" size="sm" onClick={() => void exit()}>
          Log out
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-10 pt-2 sm:px-6">
          {mode === 'chat' ? (
            <>
              {transcript.map((b) => (
                <Reveal key={b.key}>
                  <MessageBubble variant={b.role}>{b.text}</MessageBubble>
                </Reveal>
              ))}
              {generating && <GeneratingIndicator label="Hovio is typing…" />}
              {inputReady && !generating && current !== 'name' && (
                <div className="flex justify-start px-2 mb-1">
                  <button
                    type="button"
                    onClick={handleGoBack}
                    className="text-xs text-ink-soft hover:text-forest transition-colors font-medium flex items-center gap-1 select-none focus:outline-none"
                  >
                    <span>←</span> Go back to previous question
                  </button>
                </div>
              )}
              {renderInput()}
            </>
          ) : mode === 'underage' ? (
            <UnderageOffRamp onExit={() => void exit()} />
          ) : mode === 'unavailable' ? (
            <UnavailableOffRamp onExit={() => void exit()} />
          ) : (
            <SuitabilityOffRamp onExit={() => void exit()} />
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
