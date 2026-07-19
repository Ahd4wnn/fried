import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Send, Sparkles, MoreVertical, Flag } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { api, type AIMessage, type DbHelpline, type SeekerInvitation } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { env } from '../../lib/env'
import { cn } from '../../lib/cn'
import { gsap } from '../../motion/gsap'
import { useHelplines } from '../../components/safety/useHelplines'
import { CrisisButton } from '../../components/safety/CrisisButton'

type ReportCategory =
  | 'harmful'
  | 'inappropriate'
  | 'incorrect'
  | 'unhelpful'
  | 'technical'
  | 'other'

/**
 * ChatSession Page — The seeker's private dialogue space with their AI companion.
 * Progressive token rendering, premium light-purple dot grid gradient layout, auto-scroll,
 * listening indicator, and crisis interstitial interceptor.
 */
export default function ChatSession() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const sessionId = searchParams.get('id')

  const [messages, setMessages] = useState<AIMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Message composing state
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [streamingText, setStreamingText] = useState('')

  // Crisis handler state
  const [isCrisis, setIsCrisis] = useState(false)
  const [crisisHelplines, setCrisisHelplines] = useState<DbHelpline[]>([])
  const [showConfirmEnd, setShowConfirmEnd] = useState(false)

  // Report states
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportTargetMessageId, setReportTargetMessageId] = useState<
    string | undefined
  >(undefined)
  const [reportCategory, setReportCategory] = useState<ReportCategory>('harmful')
  const [reportDescription, setReportDescription] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [showOverflow, setShowOverflow] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Handoff Matching states
  const [suggestedEscalationId, setSuggestedEscalationId] = useState<
    string | null
  >(null)
  const [showEscalationCard, setShowEscalationCard] = useState(false)
  const [escalationStatus, setEscalationStatus] = useState<
    | 'none'
    | 'confirming'
    | 'confirmed'
    | 'consenting'
    | 'matching'
    | 'awaiting_selection'
    | 'therapist_selected'
  >('none')
  const [seekerNote, setSeekerNote] = useState('')
  const [intakeSummaryText, setIntakeSummaryText] = useState('')
  const [invitations, setInvitations] = useState<SeekerInvitation[]>([])
  const [matchingLoading, setMatchingLoading] = useState(false)
  const [selectedTherapist, setSelectedTherapist] = useState<Partial<SeekerInvitation> | null>(null)

  const { helplines: dbHelplines } = useHelplines()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const composerContainerRef = useRef<HTMLDivElement>(null)
  const creationAttempted = useRef(false)

  // Scroll to bottom helper
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' })
  }

  // 1. Initial Session Resolution
  useEffect(() => {
    let active = true

    async function resolveSession() {
      setLoading(true)
      setError(null)
      try {
        if (sessionId) {
          // Fetch existing session messages
          const sessionDetail = await api.getAISession(sessionId)
          if (!active) return

          if (sessionDetail.status === 'closed_crisis') {
            setIsCrisis(true)
          }
          setMessages(sessionDetail.messages)

          // Check for active escalation
          const { data: escData, error: escErr } = await supabase
            .from('escalations')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: false })
            .limit(1)

          if (!escErr && escData && escData.length > 0 && active) {
            const esc = escData[0]
            setSuggestedEscalationId(esc.id)

            if (esc.status === 'suggested') {
              setEscalationStatus('confirming')
              setShowEscalationCard(true)
            } else if (esc.status === 'cancelled' || esc.status === 'expired') {
              setEscalationStatus('none')
              setShowEscalationCard(false)
            } else {
              // Fetch consent state from intake_summaries
              const { data: summaryData } = await supabase
                .from('intake_summaries')
                .select('*')
                .eq('escalation_id', esc.id)
                .maybeSingle()

              if (active) {
                if (summaryData?.share_consented_at) {
                  if (esc.status === 'therapist_selected') {
                    setEscalationStatus('therapist_selected')
                    setShowEscalationCard(true)
                    if (esc.selected_therapist_id) {
                      const { data: tpData } = await supabase
                        .from('therapist_profiles')
                        .select('*, profiles(display_name)')
                        .eq('id', esc.selected_therapist_id)
                        .maybeSingle()
                      if (tpData && active) {
                        setSelectedTherapist({
                          therapist_id: tpData.id,
                          display_name: tpData.profiles?.display_name,
                          bio: tpData.bio,
                          specializations: tpData.specializations,
                          languages: tpData.languages,
                          price_inr: tpData.price_inr,
                        })
                      }
                    }
                  } else {
                    const invs = await api
                      .getHandoffInvitations<SeekerInvitation>()
                      .catch(() => [] as SeekerInvitation[])
                    if (active) {
                      setInvitations(invs)
                      setEscalationStatus(
                        invs.length > 0 ? 'awaiting_selection' : 'matching',
                      )
                      setShowEscalationCard(true)
                    }
                  }
                } else {
                  setEscalationStatus('consenting')
                  setShowEscalationCard(true)
                  try {
                    const summaryRes = await api.getSharedSummary(esc.id)
                    if (active) setIntakeSummaryText(summaryRes.summary)
                  } catch (sumErr) {
                    console.error('Error loading summary:', sumErr)
                  }
                }
              }
            }
          }
        } else {
          // Guard against double creation in React StrictMode
          if (creationAttempted.current) return
          creationAttempted.current = true

          // Start a new session lazily
          const newSession = await api.startAISession()
          if (!active) return

          setSearchParams({ id: newSession.id })
          setMessages([])
        }
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load companion session.')
      } finally {
        if (active) setLoading(false)
      }
    }

    resolveSession()

    return () => {
      active = false
    }
  }, [sessionId, setSearchParams])

  // Scroll to bottom when messages list, streaming state, or loader changes
  useEffect(() => {
    scrollToBottom('smooth')
  }, [messages, streamingText, loading, sending])

  // Auto-focus composer on mount and when finished sending
  useEffect(() => {
    if (!loading && !sending && !isCrisis && composerRef.current) {
      composerRef.current.focus()
    }
  }, [loading, sending, isCrisis])

  // 2. End Session Helper
  const handleEndSession = async () => {
    if (!sessionId) return
    try {
      setLoading(true)
      await api.endAISession(sessionId)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to end session.')
    } finally {
      setLoading(false)
    }
  }

  // GSAP animation for initial structural panels entrance reveal
  useEffect(() => {
    if (!loading) {
      gsap.fromTo(
        headerRef.current,
        { y: -24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55, ease: 'power2.out' },
      )
      gsap.fromTo(
        composerContainerRef.current,
        { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55, ease: 'power2.out', delay: 0.1 },
      )
    }
  }, [loading])

  // GSAP animation for custom confirmation popup modal
  useEffect(() => {
    if (showConfirmEnd) {
      const t = setTimeout(() => {
        gsap.fromTo(
          '.confirm-modal-card',
          { scale: 0.9, opacity: 0, y: 16 },
          {
            scale: 1,
            opacity: 1,
            y: 0,
            duration: 0.4,
            ease: 'back.out(1.4)',
            overwrite: 'auto',
          },
        )
      }, 20)
      return () => clearTimeout(t)
    }
  }, [showConfirmEnd])

  // 3. Send Message / Stream Handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = inputText.trim()
    if (!text || sending || !sessionId) return

    setInputText('')
    setSending(true)
    setStreamingText('')

    if (composerRef.current) {
      composerRef.current.style.height = 'auto'
    }

    // Optimistically add user message to list
    const tempUserMsg: AIMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: text,
      safety_verdict: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUserMsg])

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const url = `${env.VITE_API_BASE_URL.replace(/\/$/, '')}/api/v1/ai/sessions/${sessionId}/messages`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text }),
      })

      if (!response.ok) {
        const errPayload = await response.json().catch(() => null)
        throw new Error(errPayload?.error?.message || 'Failed to send message.')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Streaming not supported by browser.')

      const decoder = new TextDecoder()
      let buffer = ''
      let accumulatedReply = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent = ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.replace('event:', '').trim()
          } else if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.replace('data:', '').trim()
            try {
              const data = JSON.parse(dataStr)

              if (currentEvent === 'token') {
                accumulatedReply += data.text
                setStreamingText(accumulatedReply)
              } else if (currentEvent === 'done') {
                // Finalize streaming: add real assistant turn to messages and clear buffer
                const realAssistantMsg: AIMessage = {
                  id: data.message_id,
                  role: 'assistant',
                  content: accumulatedReply,
                  safety_verdict: null,
                  created_at: new Date().toISOString(),
                }
                setMessages((prev) => [...prev, realAssistantMsg])
                setStreamingText('')
              } else if (currentEvent === 'crisis') {
                // Intercept safety crisis
                setIsCrisis(true)
                if (data.helplines && data.helplines.length > 0) {
                  setCrisisHelplines(data.helplines)
                }
                const caringContent =
                  data.caring_message ||
                  "Thank you for sharing this with me. You matter, and I'm really glad you told me. I'm concerned about you, and because I'm an AI companion and cannot provide crisis counseling, I want you to connect with someone who can support you right now. Please reach out to one of the resources below."
                setMessages((prev) => {
                  const filtered = prev.filter(
                    (m) =>
                      !m.id.startsWith('temp-user') &&
                      !m.id.startsWith('crisis-turn'),
                  )
                  const userTurn = prev.find((m) =>
                    m.id.startsWith('temp-user'),
                  )
                  const userText = userTurn ? userTurn.content : text
                  return [
                    ...filtered,
                    {
                      id: `user-${Date.now()}`,
                      role: 'user',
                      content: userText,
                      safety_verdict: 'crisis',
                      created_at: new Date().toISOString(),
                    },
                    {
                      id: data.message_id || `crisis-assist-${Date.now()}`,
                      role: 'assistant',
                      content: caringContent,
                      safety_verdict: 'crisis',
                      created_at: new Date().toISOString(),
                    },
                  ]
                })
                setStreamingText('')
                return
              } else if (currentEvent === 'escalation_suggestion') {
                setSuggestedEscalationId(data.escalation_id)
                setEscalationStatus('confirming')
                setShowEscalationCard(true)
              } else if (currentEvent === 'error') {
                throw new Error(data.message || 'Stream error.')
              }
            } catch (pErr) {
              console.error('Failed to parse SSE payload:', pErr)
            }
          }
        }
      }
    } catch (err) {
      console.error('Chat error or stream drop:', err)
      setIsCrisis(true)
      const fallbackContent =
        "Thank you for sharing this with me. You matter, and I'm really glad you told me. I'm concerned about you, and because I'm an AI companion and cannot provide crisis counseling, I want you to connect with someone who can support you right now. Please reach out to one of the resources below."
      setMessages((prev) => {
        const filtered = prev.filter(
          (m) =>
            !m.id.startsWith('temp-user') && !m.id.startsWith('error-fallback'),
        )
        const userTurn = prev.find((m) => m.id.startsWith('temp-user'))
        const userText = userTurn ? userTurn.content : text
        return [
          ...filtered,
          {
            id: `user-${Date.now()}`,
            role: 'user',
            content: userText,
            safety_verdict: 'crisis',
            created_at: new Date().toISOString(),
          },
          {
            id: `error-fallback-${Date.now()}`,
            role: 'assistant',
            content: fallbackContent,
            safety_verdict: 'crisis',
            created_at: new Date().toISOString(),
          },
        ]
      })
      setStreamingText('')
    } finally {
      setSending(false)
    }
  }

  // Handle Enter submission (Shift+Enter for new line)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e)
    }
  }

  // Handoff Matching handlers
  const handleConfirmEscalation = async () => {
    if (!sessionId) return
    setMatchingLoading(true)
    try {
      const res = await api.confirmEscalation(sessionId)
      setSuggestedEscalationId(res.escalation_id)
      setEscalationStatus('confirmed')

      // Fetch the generated summary
      const summaryRes = await api.getSharedSummary(res.escalation_id)
      setIntakeSummaryText(summaryRes.summary)
      setEscalationStatus('consenting')
    } catch (err) {
      console.error('Failed to confirm escalation:', err)
      alert(err instanceof Error ? err.message : 'Failed to prepare summary. Please try again.')
    } finally {
      setMatchingLoading(false)
    }
  }

  const handleDeclineEscalation = () => {
    setShowEscalationCard(false)
    setEscalationStatus('none')
  }

  const handleConsentSummary = async () => {
    if (!suggestedEscalationId) return
    setMatchingLoading(true)
    try {
      await api.consentSummary(suggestedEscalationId, seekerNote)
      setEscalationStatus('matching')
    } catch (err) {
      console.error('Failed to consent to summary:', err)
      alert(err instanceof Error ? err.message : 'Failed to submit consent.')
    } finally {
      setMatchingLoading(false)
    }
  }

  const handleSelectTherapist = async (
    invitationId: string,
    therapist: SeekerInvitation,
  ) => {
    setMatchingLoading(true)
    try {
      await api.selectTherapist(invitationId)
      setSelectedTherapist(therapist)
      setEscalationStatus('therapist_selected')
    } catch (err) {
      console.error('Failed to select therapist:', err)
      alert(err instanceof Error ? err.message : 'Failed to select therapist.')
    } finally {
      setMatchingLoading(false)
    }
  }

  useEffect(() => {
    if (
      escalationStatus !== 'matching' &&
      escalationStatus !== 'awaiting_selection'
    )
      return

    const pollInvitations = async () => {
      try {
        const invs = await api.getHandoffInvitations<SeekerInvitation>()
        setInvitations(invs)
        if (invs.length > 0 && escalationStatus === 'matching') {
          setEscalationStatus('awaiting_selection')
        }
      } catch (err) {
        console.error('Failed to fetch invitations:', err)
      }
    }

    pollInvitations()
    const interval = setInterval(pollInvitations, 5000)
    return () => clearInterval(interval)
  }, [escalationStatus])

  const handleOpenReportModal = (messageId?: string) => {
    setReportTargetMessageId(messageId)
    setReportCategory('harmful')
    setReportDescription('')
    setReportError(null)
    setShowReportModal(true)
  }

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault()
    setReporting(true)
    setReportError(null)
    try {
      await api.submitReport({
        session_id: sessionId || undefined,
        message_id: reportTargetMessageId,
        category: reportCategory,
        description: reportDescription.trim() || undefined,
      })
      setShowReportModal(false)
      setToastMessage('Report submitted successfully.')
      setTimeout(() => setToastMessage(null), 3000)
    } catch (err) {
      setReportError(
        err instanceof Error ? err.message : 'Failed to submit report. Please try again.',
      )
    } finally {
      setReporting(false)
    }
  }

  const helplinesList =
    crisisHelplines.length > 0 ? crisisHelplines : dbHelplines

  return (
    <div className="flex h-svh lg:h-[100vh] w-full flex-col select-none bg-transparent">
      {/* Header */}
      <header
        ref={headerRef}
        className="flex h-16 shrink-0 items-center justify-between bg-transparent px-6 py-3 select-none"
      >
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-forest/10 hover:text-forest transition-all"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-forest text-cream font-semibold shadow-md shadow-forest/10 relative">
              <span className="text-sm">H</span>
              <span
                className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#10B981] border-2 border-paper"
                title="Active"
              />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-ink leading-none">
                Hovio
              </h1>
              <p className="text-2xs text-ink-soft mt-0.5 select-none">
                Your safe AI Companion
              </p>
            </div>
          </div>
        </div>

        {sessionId && !loading && !isCrisis && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowOverflow(!showOverflow)}
              className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-forest-300/20 bg-paper/85 text-ink-soft hover:bg-forest-tint hover:text-forest transition-all shadow-sm"
              aria-label="More options"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            <AnimatePresence>
              {showOverflow && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowOverflow(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 z-20 w-44 rounded-xl border border-line/10 bg-paper py-1.5 shadow-lg flex flex-col text-left"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowOverflow(false)
                        handleOpenReportModal()
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-ink hover:bg-forest-tint transition-colors"
                    >
                      <Flag className="h-3.5 w-3.5 text-ink-soft" />
                      Report a problem
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowOverflow(false)
                        setShowConfirmEnd(true)
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-danger hover:bg-danger-tint transition-colors"
                    >
                      End session
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}
        {isCrisis && <CrisisButton variant="inline" compact={true} />}
      </header>

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-12">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="relative flex items-center justify-center">
              <div className="h-12 w-12 rounded-full border-2 border-forest-300/20 border-t-forest animate-spin" />
              <Sparkles className="absolute h-5 w-5 text-forest animate-pulse" />
            </div>
            <p className="text-xs text-ink-soft select-none animate-pulse">
              Opening your safe space...
            </p>
          </div>
        ) : error && messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-danger max-w-sm text-sm font-medium">{error}</p>
            <button
              type="button"
              onClick={() => navigate(0)}
              className="focus-ring rounded-full border border-forest bg-paper px-6 py-2 text-xs font-semibold text-forest hover:bg-forest-tint transition-colors shadow-sm"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl w-full space-y-6">
            {/* Disclaimer Nudge */}
            <div className="mx-auto max-w-lg select-none rounded-[24px] border border-forest/10 bg-paper/60 backdrop-blur-md p-6 text-center space-y-3 shadow-soft">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-forest text-cream shadow-md shadow-forest/15">
                <Sparkles className="h-5 w-5" />
              </span>
              <h2 className="text-sm font-semibold text-forest-deep">
                Your safe, private space
              </h2>
              <p className="text-xs text-ink-soft leading-relaxed max-w-sm mx-auto">
                Everything you share here is envelope-encrypted at rest and
                completely confidential. I’m here to listen, support, and help
                you explore your thoughts in a warm, non-clinical environment.
              </p>
            </div>

            {/* Conversation Messages */}
            <div className="space-y-6">
              {messages.map((msg) => {
                const isUser = msg.role === 'user'
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex w-full flex-col gap-1.5 group relative',
                      isUser ? 'items-end' : 'items-start',
                    )}
                  >
                    <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[75%]">
                      <div
                        className={cn(
                          'whitespace-pre-wrap break-words rounded-[22px] px-5 py-3.5 text-sm leading-relaxed shadow-soft transition-all duration-200 select-text',
                          isUser
                            ? 'rounded-br-[4px] bg-forest text-cream font-medium'
                            : 'rounded-bl-[4px] border border-forest-300/5 bg-paper/85 backdrop-blur-md text-ink',
                        )}
                      >
                        {msg.content}
                      </div>

                      {!isUser && !isCrisis && (
                        <button
                          type="button"
                          onClick={() => handleOpenReportModal(msg.id)}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-full hover:bg-forest/10 text-ink-soft hover:text-forest transition-all shrink-0 duration-150"
                          title="Report a problem"
                        >
                          <Flag className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {msg.created_at && (
                      <span className="px-2 text-[10px] text-ink-soft select-none opacity-60">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                )
              })}

              {/* Streaming Assistant bubble */}
              {streamingText && (
                <div className="flex w-full flex-col gap-1.5 items-start animate-fade-in">
                  <div className="max-w-[85%] sm:max-w-[75%] whitespace-pre-wrap break-words rounded-[22px] rounded-bl-[4px] border border-forest-300/5 bg-paper/85 backdrop-blur-md text-ink px-5 py-3.5 text-sm leading-relaxed shadow-soft">
                    {streamingText}
                  </div>
                  <span className="px-2 text-[10px] text-forest select-none font-medium animate-pulse">
                    Writing...
                  </span>
                </div>
              )}

              {/* Shimmer generates typing cue */}
              {sending && !streamingText && (
                <div className="flex w-full items-start gap-1 justify-start">
                  <div className="bg-paper/70 backdrop-blur-sm border border-forest-300/5 rounded-[22px] rounded-bl-[4px] px-5 py-4 shadow-sm max-w-[85%] sm:max-w-[70%]">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2 w-2 animate-bounce rounded-full bg-forest-deep/60 [animation-delay:-0.3s]" />
                      <span className="flex h-2 w-2 animate-bounce rounded-full bg-forest-deep/60 [animation-delay:-0.15s]" />
                      <span className="flex h-2 w-2 animate-bounce rounded-full bg-forest-deep/60" />
                      <span className="text-xs text-ink-soft/75 ml-1 select-none">
                        Hovio is listening...
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Composer Input Area */}
      {!loading && !isCrisis && (
        <div
          ref={composerContainerRef}
          className="shrink-0 bg-transparent px-4 pb-6 pt-2"
        >
          <form onSubmit={handleSendMessage} className="mx-auto max-w-3xl">
            <div className="flex items-center gap-3 rounded-[28px] border border-forest-300/10 bg-paper/90 backdrop-blur-md px-4 py-2.5 shadow-lg hover:shadow-xl focus-within:border-forest/30 transition-all duration-300">
              <textarea
                ref={composerRef}
                rows={1}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value)
                  // Auto-grow height helper
                  e.target.style.height = 'auto'
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
                }}
                onKeyDown={handleKeyDown}
                placeholder="Share whatever is on your mind..."
                disabled={sending}
                className="max-h-32 flex-1 resize-none overflow-hidden bg-transparent py-2 text-sm text-ink placeholder:text-ink-soft/50 border-0 outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 select-text"
                style={{ border: 'none', outline: 'none', boxShadow: 'none' }}
              />
              <button
                type="submit"
                disabled={!inputText.trim() || sending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest text-cream shadow-md transition-all hover:bg-forest-deep hover:scale-[1.05] active:scale-[0.98] disabled:bg-forest-tint disabled:text-ink-soft/40 disabled:shadow-none disabled:scale-100 cursor-pointer"
                aria-label="Send message"
              >
                <Send className="h-5 w-5 transform translate-x-[-1px] translate-y-[0.5px]" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Persistent Safety Support Panel */}
      {!loading && isCrisis && (
        <div className="shrink-0 bg-paper/95 backdrop-blur-md px-6 py-6 border-t border-danger/10 shadow-lg relative z-20 space-y-4">
          <div className="mx-auto max-w-3xl w-full space-y-4">
            <div className="flex items-center gap-2 text-danger select-none">
              <span className="flex h-2.5 w-2.5 rounded-full bg-danger animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                Resources for Support
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {helplinesList.map((help) => (
                <div
                  key={help.name}
                  className="flex flex-col justify-between p-4 rounded-2xl border border-forest-300/10 bg-cream/30 hover:border-forest/20 transition-all select-none"
                >
                  <div>
                    <h4 className="text-xs font-semibold text-ink">
                      {help.name}
                    </h4>
                    <p className="text-2xs text-ink-soft mt-0.5">
                      {help.hours || '24x7'}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {help.numbers.map((num: string) => (
                      <a
                        key={num}
                        href={`tel:${num}`}
                        className="focus-ring inline-flex items-center justify-center rounded-full bg-forest px-3 py-1.5 text-2xs font-semibold text-cream hover:bg-forest-deep transition-colors cursor-pointer"
                      >
                        Call {num}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-center select-none">
              <Link
                to="/dashboard"
                className="focus-ring rounded-full border border-forest-300/20 bg-paper px-6 py-2.5 text-xs font-semibold text-ink hover:bg-forest-tint hover:text-forest transition-colors shadow-sm cursor-pointer"
              >
                Go back to dashboard
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Popup Modal */}
      <AnimatePresence>
        {showConfirmEnd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-forest-deep/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <div className="confirm-modal-card w-full max-w-md rounded-[32px] border border-forest-300/10 bg-paper/95 p-6 md:p-8 shadow-xl text-center space-y-6 select-none">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-forest-tint text-forest shadow-sm">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-xl font-semibold text-ink leading-tight">
                  End companion session?
                </h2>
                <p className="text-xs leading-relaxed text-ink-soft max-w-sm mx-auto">
                  This will close the active chat and save a private, encrypted
                  summary to your companion's memory, helping Hovio support you
                  better in future sessions.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmEnd(false)}
                  className="focus-ring flex-1 rounded-full border border-forest-300/20 bg-paper py-3 text-xs font-semibold text-ink hover:bg-forest-tint transition-all cursor-pointer"
                >
                  Keep talking
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmEnd(false)
                    handleEndSession()
                  }}
                  className="focus-ring flex-1 rounded-full bg-forest py-3 text-xs font-semibold text-cream hover:bg-forest-deep transition-all shadow-md shadow-forest/15 cursor-pointer"
                >
                  Yes, end session
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report Sheet Modal */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-ink/30 backdrop-blur-sm px-4">
            <div
              className="absolute inset-0"
              onClick={() => setShowReportModal(false)}
            />

            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="relative z-10 w-full max-w-md rounded-t-[28px] sm:rounded-[28px] bg-paper p-6 shadow-xl border border-line/10 flex flex-col gap-4 text-left select-text"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl text-ink font-semibold">
                  Report a problem
                </h3>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="rounded-full p-1.5 text-ink-soft hover:bg-forest/10 hover:text-forest transition-colors"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmitReport} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
                    Category
                  </label>
                  <select
                    value={reportCategory}
                    onChange={(e) => setReportCategory(e.target.value as ReportCategory)}
                    className="focus-ring h-10 w-full rounded-md border border-line bg-paper px-3 text-sm text-ink cursor-pointer"
                  >
                    <option value="harmful">Harmful or unsafe</option>
                    <option value="inappropriate">Inappropriate</option>
                    <option value="incorrect">Incorrect</option>
                    <option value="unhelpful">Unhelpful</option>
                    <option value="technical">Technical issue</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
                    Description (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder="Tell us what went wrong..."
                    className="focus-ring min-h-[4.5rem] w-full resize-none rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-soft/50"
                  />
                </div>

                <p className="text-[11px] text-ink-soft/80 leading-relaxed border-t border-line/30 pt-3 select-none">
                  Reporting this lets the Hovio team review this message to
                  improve safety. The rest of your conversation stays private.
                </p>

                {reportError && (
                  <p className="text-xs text-danger" role="alert">
                    {reportError}
                  </p>
                )}

                <div className="flex gap-2 justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="focus-ring rounded-full px-4 py-2 text-xs font-semibold text-ink-soft hover:bg-forest/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={reporting}
                    className="focus-ring rounded-full bg-forest text-cream px-5 py-2 text-xs font-semibold hover:bg-forest-deep transition-all shadow-md shadow-forest/10 flex items-center gap-1.5 cursor-pointer"
                  >
                    {reporting ? 'Submitting...' : 'Submit report'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Handoff Matching Drawer */}
      <AnimatePresence>
        {showEscalationCard && escalationStatus !== 'none' && (
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              'fixed right-0 top-16 bottom-0 z-40 flex flex-col bg-paper/95 backdrop-blur-md shadow-2xl border-l border-forest-300/10 p-6 overflow-y-auto select-none transition-all duration-300',
              'w-full sm:max-w-md md:max-w-[420px]',
            )}
          >
            {/* Header of Drawer */}
            <div className="flex items-center justify-between pb-4 border-b border-forest-300/10 mb-5">
              <div className="flex items-center gap-2 text-forest">
                <Sparkles className="h-5 w-5 text-forest animate-pulse" />
                <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
                  Matching Progress
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEscalationCard(false)}
                className="rounded-full p-1.5 hover:bg-forest/10 text-ink-soft hover:text-forest transition-colors"
                aria-label="Hide panel"
              >
                ✕
              </button>
            </div>

            {/* Content states */}
            {escalationStatus === 'confirming' && (
              <div className="flex flex-col flex-1 justify-between">
                <div className="space-y-4">
                  <h4 className="font-display text-lg font-semibold text-ink leading-tight">
                    Would it help to talk to a therapist?
                  </h4>
                  <p className="text-xs leading-relaxed text-ink-soft">
                    Hovio is an AI companion, never a therapist. Only verified
                    human professionals can provide clinical care.
                  </p>
                  <p className="text-xs leading-relaxed text-ink-soft">
                    If you wish, we can compile a secure, non-identifying intake
                    summary of our chat and search for verified, bookable
                    therapists who match your preferences. This ensures you
                    won't have to repeat your story from scratch.
                  </p>
                </div>
                <div className="flex flex-col gap-3 pt-6">
                  <button
                    type="button"
                    onClick={handleConfirmEscalation}
                    disabled={matchingLoading}
                    className="focus-ring w-full rounded-full bg-forest py-3 text-xs font-semibold text-cream hover:bg-forest-deep disabled:bg-forest-tint disabled:text-ink-soft/40 transition-all shadow-md shadow-forest/15 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {matchingLoading ? (
                      <>
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-cream border-t-transparent" />
                        <span>Preparing summary...</span>
                      </>
                    ) : (
                      <span>Prepare Summary & Match</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeclineEscalation}
                    disabled={matchingLoading}
                    className="focus-ring w-full rounded-full border border-forest-300/20 bg-paper py-3 text-xs font-semibold text-ink hover:bg-forest-tint transition-all cursor-pointer"
                  >
                    No, thank you
                  </button>
                </div>
              </div>
            )}

            {escalationStatus === 'confirmed' && (
              <div className="flex flex-col flex-1 items-center justify-center text-center space-y-6">
                <div className="relative flex items-center justify-center">
                  <span className="absolute inline-flex h-20 w-20 animate-ping rounded-full bg-forest/10 opacity-75" />
                  <div className="relative h-14 w-14 rounded-full bg-forest flex items-center justify-center text-cream shadow-lg">
                    <Sparkles className="h-6 w-6 animate-pulse" />
                  </div>
                </div>
                <div className="space-y-2 max-w-xs">
                  <h4 className="font-display text-sm font-semibold text-ink select-none">
                    Generating Intake Summary...
                  </h4>
                  <p className="text-2xs text-ink-soft leading-relaxed">
                    Analyzing conversation context.
                  </p>
                </div>
              </div>
            )}

            {escalationStatus === 'consenting' && (
              <div className="flex flex-col flex-1 justify-between">
                <div className="space-y-4">
                  <h4 className="font-display text-lg font-semibold text-ink leading-tight">
                    Review your Intake Summary
                  </h4>
                  <p className="text-xs leading-relaxed text-ink-soft">
                    Below is the clinical summary of our chat. It is objective
                    and completely anonymous—no names, locations, or raw
                    messages are included.
                  </p>

                  <div className="max-h-60 overflow-y-auto rounded-2xl border border-forest-300/10 bg-cream/30 p-4 text-xs text-ink-soft leading-relaxed scrollbar-thin select-text">
                    {intakeSummaryText}
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <label className="text-2xs font-semibold text-ink-soft uppercase tracking-wider">
                      Add a personal note for your therapist (optional)
                    </label>
                    <textarea
                      rows={3}
                      value={seekerNote}
                      onChange={(e) => setSeekerNote(e.target.value)}
                      placeholder="e.g., 'I prefer weekend sessions', 'I am looking for CBT tools', or anything else you'd like to share..."
                      className="focus-ring w-full resize-none rounded-xl border border-forest-300/10 bg-cream/10 px-3 py-2 text-xs text-ink placeholder:text-ink-soft/40"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-6">
                  <button
                    type="button"
                    onClick={handleConsentSummary}
                    disabled={matchingLoading}
                    className="focus-ring w-full rounded-full bg-forest py-3 text-xs font-semibold text-cream hover:bg-forest-deep disabled:bg-forest-tint disabled:text-ink-soft/40 transition-all shadow-md shadow-forest/15 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {matchingLoading ? (
                      <>
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-cream border-t-transparent" />
                        <span>Sending request...</span>
                      </>
                    ) : (
                      <span>Share & Find Matches</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeclineEscalation}
                    disabled={matchingLoading}
                    className="focus-ring w-full rounded-full border border-forest-300/20 bg-paper py-3 text-xs font-semibold text-ink hover:bg-forest-tint transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {escalationStatus === 'matching' && (
              <div className="flex flex-col flex-1 items-center justify-center text-center space-y-6">
                <div className="relative flex items-center justify-center">
                  <span className="absolute inline-flex h-20 w-20 animate-ping rounded-full bg-forest/10 opacity-75" />
                  <div className="relative h-14 w-14 rounded-full bg-forest flex items-center justify-center text-cream shadow-lg">
                    <Sparkles className="h-6 w-6 animate-pulse" />
                  </div>
                </div>
                <div className="space-y-2 max-w-xs">
                  <h4 className="font-display text-sm font-semibold text-ink select-none">
                    Reaching out to therapists...
                  </h4>
                  <p className="text-2xs text-ink-soft leading-relaxed">
                    We are sharing your non-identifying request card with
                    verified, bookable therapists matching your criteria.
                  </p>
                </div>
                <div className="pt-4 w-full">
                  <button
                    type="button"
                    onClick={handleDeclineEscalation}
                    className="focus-ring w-full rounded-full border border-forest-300/20 bg-paper py-2.5 text-xs font-semibold text-ink hover:bg-forest-tint transition-all cursor-pointer"
                  >
                    Cancel Matching
                  </button>
                </div>
              </div>
            )}

            {escalationStatus === 'awaiting_selection' && (
              <div className="flex flex-col flex-1 justify-between">
                <div className="space-y-4">
                  <h4 className="font-display text-lg font-semibold text-ink leading-tight">
                    Select your therapist
                  </h4>
                  <p className="text-xs leading-relaxed text-ink-soft">
                    The following therapists have reviewed your non-identifying
                    request card and accepted the invitation. Choose one to
                    securely share your intake summary.
                  </p>

                  <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
                    {invitations.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-4 rounded-2xl border border-forest-300/10 bg-cream/20 hover:border-forest/20 transition-all space-y-3"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h5 className="text-xs font-semibold text-ink">
                              {inv.display_name}
                            </h5>
                            <p className="text-[10px] text-ink-soft mt-0.5">
                              {inv.gender || 'Therapist'}
                            </p>
                          </div>
                          <span className="text-xs font-bold text-forest">
                            ₹{inv.price_inr || 'N/A'}
                            <span className="text-[10px] font-normal text-ink-soft">
                              /session
                            </span>
                          </span>
                        </div>
                        {inv.bio && (
                          <p className="text-2xs text-ink-soft line-clamp-2 leading-relaxed">
                            {inv.bio}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {inv.specializations?.map((spec: string) => (
                            <span
                              key={spec}
                              className="text-[9px] font-medium text-forest border border-forest/15 rounded-md px-1.5 py-0.5 bg-forest-tint/30"
                            >
                              {spec}
                            </span>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectTherapist(inv.id, inv)}
                          disabled={matchingLoading}
                          className="focus-ring w-full rounded-full bg-forest py-2 text-2xs font-semibold text-cream hover:bg-forest-deep disabled:bg-forest-tint transition-all cursor-pointer"
                        >
                          Select & Share Summary
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={handleDeclineEscalation}
                    className="focus-ring w-full rounded-full border border-forest-300/20 bg-paper py-3 text-xs font-semibold text-ink hover:bg-forest-tint transition-all cursor-pointer"
                  >
                    Cancel Matching
                  </button>
                </div>
              </div>
            )}

            {escalationStatus === 'therapist_selected' && (
              <div className="flex flex-col flex-1 justify-between">
                <div className="space-y-5 text-center">
                  <div className="mx-auto h-12 w-12 rounded-full bg-forest-tint text-forest flex items-center justify-center shadow-sm">
                    ✓
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-display text-lg font-semibold text-ink leading-tight">
                      Successfully Matched!
                    </h4>
                    <p className="text-xs leading-relaxed text-ink-soft">
                      Your anonymous intake summary and note have been securely
                      shared with your selected therapist.
                    </p>
                  </div>

                  {selectedTherapist && (
                    <div className="p-4 rounded-2xl border border-forest-300/10 bg-cream/30 text-left space-y-2">
                      <h5 className="text-xs font-semibold text-ink">
                        {selectedTherapist.display_name}
                      </h5>
                      {selectedTherapist.bio && (
                        <p className="text-2xs text-ink-soft leading-relaxed">
                          {selectedTherapist.bio}
                        </p>
                      )}
                      <div className="flex justify-between text-2xs pt-1 border-t border-forest-300/5 text-ink-soft">
                        <span>
                          Price: ₹{selectedTherapist.price_inr}/session
                        </span>
                        <span>
                          Languages: {selectedTherapist.languages?.join(', ')}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-forest-300/10 bg-cream/10 p-3 text-2xs text-ink-soft leading-relaxed text-left">
                    <strong>Note:</strong> Scheduling integrations are coming
                    soon. Your therapist has received your contact details and
                    will reach out to you directly to set up your first
                    appointment.
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEscalationCard(false)
                      setEscalationStatus('none')
                    }}
                    className="focus-ring w-full rounded-full bg-forest py-3 text-xs font-semibold text-cream hover:bg-forest-deep transition-all cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Match Badge when card is minimized */}
      {!showEscalationCard && escalationStatus !== 'none' && (
        <button
          onClick={() => setShowEscalationCard(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-forest text-cream px-5 py-3 text-xs font-semibold shadow-2xl hover:bg-forest-deep transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Sparkles className="h-4 w-4 text-cream animate-pulse" />
          <span>Active Match in Progress</span>
        </button>
      )}

      {/* Success Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-forest text-cream px-5 py-2.5 text-xs font-semibold shadow-xl flex items-center gap-2 border border-forest/20 select-none"
          >
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
