import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  MessageSquare,
  Headphones,
  NotebookPen,
  Send,
  Clock,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react'
import { Room, RoomEvent, Track } from 'livekit-client'
import {
  RoomContext,
  RoomAudioRenderer,
  VideoTrack,
  useTracks,
  useRemoteParticipants,
  useLocalParticipant,
  useIsSpeaking,
  useDataChannel,
} from '@livekit/components-react'
import type { Participant } from 'livekit-client'
import { api, ApiError } from '../../lib/api'
import type { LiveSessionState, SessionModality } from '../../lib/api'
import { Avatar, Spinner } from '../../components/ui'
import { NotesEditor } from '../../components/session/NotesEditor'
import { CrisisButton } from '../../components/safety/CrisisButton'
import { MessageBubble } from '../../components/ui/MessageBubble'
import { Logo } from '../../components/Logo'
import { cn } from '../../lib/cn'

type Phase = 'loading' | 'prejoin' | 'connecting' | 'insession' | 'ended' | 'error'

const MODALITY_LABEL: Record<SessionModality, string> = {
  video: 'Video session',
  audio: 'Audio session',
  chat: 'Chat session',
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso))
}

function fmtDay(iso: string) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso))
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LiveSessionPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const [phase, setPhase] = useState<Phase>('loading')
  const [session, setSession] = useState<LiveSessionState | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [endedByTherapist, setEndedByTherapist] = useState(false)
  const leftRef = useRef(false)

  useEffect(() => {
    if (!bookingId) return
    let cancelled = false
    api
      .getLiveSession(bookingId)
      .then((s) => {
        if (cancelled) return
        setSession(s)
        setPhase(s.status === 'completed' || s.status === 'no_show' ? 'ended' : 'prejoin')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'We couldn’t load this session.')
        setPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [bookingId])

  const leaveQuietly = useCallback(() => {
    if (!bookingId || leftRef.current) return
    leftRef.current = true
    api.leaveLiveSession(bookingId).catch(() => {})
  }, [bookingId])

  // If the tab closes mid-session, still record the leave (server also
  // settles overdue sessions on its own as a fallback).
  useEffect(() => {
    if (phase !== 'insession') return
    window.addEventListener('beforeunload', leaveQuietly)
    return () => window.removeEventListener('beforeunload', leaveQuietly)
  }, [phase, leaveQuietly])

  const handleJoin = useCallback(async () => {
    if (!bookingId || !session) return
    setPhase('connecting')
    setError(null)
    try {
      const grant = await api.getLiveToken(bookingId)
      const lkRoom = new Room()
      lkRoom.on(RoomEvent.Disconnected, () => {
        // Remote end (e.g. therapist ended the session for everyone).
        setEndedByTherapist(true)
        leaveQuietly()
        setPhase('ended')
      })
      await lkRoom.connect(grant.url, grant.token)
      if (session.modality === 'video') {
        await lkRoom.localParticipant.setMicrophoneEnabled(true)
        await lkRoom.localParticipant.setCameraEnabled(true)
      } else if (session.modality === 'audio') {
        await lkRoom.localParticipant.setMicrophoneEnabled(true)
      }
      leftRef.current = false
      setRoom(lkRoom)
      setPhase('insession')
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'We couldn’t connect you to the room. Please check your connection and try again.',
      )
      setPhase('prejoin')
    }
  }, [bookingId, session, leaveQuietly])

  const handleLeave = useCallback(async () => {
    room?.disconnect()
    setRoom(null)
    leaveQuietly()
    setPhase('ended')
  }, [room, leaveQuietly])

  const handleEndForAll = useCallback(async () => {
    if (!bookingId) return
    try {
      await api.endLiveSession(bookingId)
    } catch {
      // Fall through — we still leave locally.
    }
    room?.disconnect()
    setRoom(null)
    leftRef.current = true
    setPhase('ended')
  }, [bookingId, room])

  // Disconnect on unmount, whatever state we're in.
  useEffect(() => {
    return () => {
      room?.disconnect()
    }
  }, [room])

  if (phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <Spinner className="h-6 w-6 text-forest" />
      </div>
    )
  }

  if (phase === 'error' || !session || !bookingId) {
    return (
      <ShellCentered>
        <p className="text-ink-soft">{error ?? 'This session could not be found.'}</p>
        <Link
          to="/dashboard"
          className="focus-ring inline-flex items-center gap-2 rounded-sm text-sm font-medium text-forest underline underline-offset-4"
        >
          <ArrowLeft className="h-4 w-4" /> Back to your space
        </Link>
      </ShellCentered>
    )
  }

  if (phase === 'ended') {
    return (
      <EndScreen
        session={session}
        bookingId={bookingId}
        endedByTherapist={endedByTherapist}
      />
    )
  }

  if (phase === 'prejoin' || phase === 'connecting') {
    return (
      <PreJoin
        session={session}
        connecting={phase === 'connecting'}
        error={error}
        onJoin={handleJoin}
      />
    )
  }

  return (
    <RoomContext.Provider value={room!}>
      <InSession
        session={session}
        bookingId={bookingId}
        onLeave={handleLeave}
        onEndForAll={handleEndForAll}
      />
    </RoomContext.Provider>
  )
}

// ─── Shared chrome ───────────────────────────────────────────────────────────

function ShellCentered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-6 text-center">
      <Logo className="h-7" />
      {children}
    </div>
  )
}

// ─── Pre-join: device check + a calm "ready to begin" moment ─────────────────

function PreJoin({
  session,
  connecting,
  error,
  onJoin,
}: {
  session: LiveSessionState
  connecting: boolean
  error: string | null
  onJoin: () => void
}) {
  const needsCamera = session.modality === 'video'
  const needsMic = session.modality !== 'chat'
  const [deviceReady, setDeviceReady] = useState(!needsMic)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!needsMic) return
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: needsCamera, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current && needsCamera) {
          videoRef.current.srcObject = stream
        }
        setDeviceReady(true)
      })
      .catch(() => {
        if (!cancelled) {
          setDeviceError(
            needsCamera
              ? 'We need access to your camera and microphone for this session. Please allow access in your browser and refresh.'
              : 'We need access to your microphone for this session. Please allow access in your browser and refresh.',
          )
        }
      })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [needsCamera, needsMic])

  const stopPreviewAndJoin = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    onJoin()
  }

  const otherName = session.other_party_name ?? 'your therapist'
  const isTherapist = session.my_role === 'therapist'

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="flex items-center justify-between px-6 py-5">
        <Logo className="h-7" />
        {session.my_role === 'seeker' && <CrisisButton />}
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-6 px-6 pb-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full space-y-6"
        >
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              {MODALITY_LABEL[session.modality]}
            </p>
            <h1 className="font-display text-4xl text-ink">
              {isTherapist ? (
                <>A moment before you meet {otherName}</>
              ) : (
                <>Take a breath. {otherName} will meet you here.</>
              )}
            </h1>
            <p className="text-sm text-ink-soft">
              {fmtDay(session.starts_at)} · {fmtTime(session.starts_at)}–
              {fmtTime(session.ends_at)} IST
            </p>
          </div>

          {needsCamera && (
            <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-3xl border border-line/60 bg-ink/90 shadow-soft">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full -scale-x-100 object-cover"
              />
              {!deviceReady && !deviceError && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-cream/70">
                  Getting your camera ready…
                </div>
              )}
            </div>
          )}

          {deviceError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {deviceError}
            </div>
          ) : (
            needsMic && (
              <div
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium',
                  deviceReady
                    ? 'border-forest/20 bg-forest-tint text-forest'
                    : 'border-line bg-paper text-ink-soft',
                )}
              >
                {deviceReady ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Spinner className="h-3.5 w-3.5" />
                )}
                {deviceReady
                  ? needsCamera
                    ? 'Camera and microphone ready'
                    : 'Microphone ready'
                  : 'Checking your devices…'}
              </div>
            )
          )}

          {session.modality === 'chat' && (
            <p className="mx-auto max-w-sm text-sm text-ink-soft">
              A live written conversation — just the two of you, in real time.
              This conversation isn’t saved.
            </p>
          )}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {session.can_join ? (
            <button
              type="button"
              onClick={stopPreviewAndJoin}
              disabled={connecting || (!deviceReady && needsMic)}
              className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-full bg-forest px-8 text-sm font-semibold text-white shadow-soft transition-all hover:bg-forest-deep active:scale-[0.98] disabled:opacity-50"
            >
              {connecting ? (
                <>
                  <Spinner className="h-4 w-4" /> Joining…
                </>
              ) : (
                'Begin session'
              )}
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-5 py-2.5 text-sm text-ink-soft">
              <Clock className="h-4 w-4" />
              The room opens at {fmtTime(session.join_opens_at)} IST
            </div>
          )}
        </motion.div>
      </main>
    </div>
  )
}

// ─── In-session ──────────────────────────────────────────────────────────────

function InSession({
  session,
  bookingId,
  onLeave,
  onEndForAll,
}: {
  session: LiveSessionState
  bookingId: string
  onLeave: () => void
  onEndForAll: () => void
}) {
  const remotes = useRemoteParticipants()
  const waiting = remotes.length === 0
  const otherName = session.other_party_name ?? 'the other participant'
  const [notesOpen, setNotesOpen] = useState(false)
  const isTherapist = session.my_role === 'therapist'

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <RoomAudioRenderer />

      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Logo className="h-6" />
          <span className="hidden rounded-full border border-line bg-paper px-3 py-1 text-[11px] font-medium text-ink-soft sm:inline-flex">
            {MODALITY_LABEL[session.modality]} · until {fmtTime(session.ends_at)} IST
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isTherapist && (
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              className={cn(
                'focus-ring inline-flex h-10 items-center gap-2 rounded-full border px-4 text-xs font-medium transition-colors',
                notesOpen
                  ? 'border-forest/30 bg-forest-tint text-forest'
                  : 'border-line bg-paper text-ink-soft hover:bg-forest-tint',
              )}
            >
              <NotebookPen className="h-4 w-4" /> Private notes
            </button>
          )}
          {session.my_role === 'seeker' && <CrisisButton compact />}
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-28 sm:px-6">
        {session.modality === 'video' && (
          <VideoStage waiting={waiting} otherName={otherName} />
        )}
        {session.modality === 'audio' && (
          <AudioStage waiting={waiting} otherName={otherName} session={session} />
        )}
        {session.modality === 'chat' && (
          <ChatStage waiting={waiting} otherName={otherName} session={session} />
        )}
      </main>

      <ControlBar
        modality={session.modality}
        isTherapist={isTherapist}
        onLeave={onLeave}
        onEndForAll={onEndForAll}
      />

      <AnimatePresence>
        {notesOpen && isTherapist && (
          <NotesDrawer bookingId={bookingId} onClose={() => setNotesOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}

function WaitingCard({ otherName }: { otherName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-forest-tint text-forest"
      >
        <Clock className="h-7 w-7" />
      </motion.div>
      <div className="space-y-1">
        <h2 className="font-display text-2xl text-ink">
          Waiting for {otherName} to join
        </h2>
        <p className="text-sm text-ink-soft">
          You’re in the right place — they’ll be here soon.
        </p>
      </div>
    </div>
  )
}

// ─── Video ───────────────────────────────────────────────────────────────────

function VideoStage({ waiting, otherName }: { waiting: boolean; otherName: string }) {
  const tracks = useTracks([Track.Source.Camera])
  const remoteTrack = tracks.find((t) => !t.participant.isLocal)
  const localTrack = tracks.find((t) => t.participant.isLocal)

  return (
    <div className="relative flex flex-1 flex-col">
      <div className="relative flex-1 overflow-hidden rounded-3xl border border-line/60 bg-ink shadow-soft">
        {remoteTrack ? (
          <VideoTrack trackRef={remoteTrack} className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-forest-deep/95">
            <div className="text-center text-cream">
              <WaitingCard otherName={otherName} />
            </div>
          </div>
        )}
        {!waiting && remoteTrack === undefined && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-cream/80">
            {otherName}’s camera is off
          </div>
        )}

        {/* Local preview, tucked into a corner */}
        {localTrack && (
          <div className="absolute bottom-4 right-4 aspect-video w-36 overflow-hidden rounded-2xl border border-cream/20 shadow-soft sm:w-48">
            <VideoTrack
              trackRef={localTrack}
              className="h-full w-full -scale-x-100 object-cover"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Audio ───────────────────────────────────────────────────────────────────

function SpeakingAvatar({
  participant,
  name,
  size,
}: {
  participant: Participant
  name: string
  size: 'lg' | 'md'
}) {
  const speaking = useIsSpeaking(participant)
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={cn(
          'rounded-full p-1.5 transition-all duration-300',
          speaking ? 'bg-forest/25 ring-4 ring-forest/20' : 'bg-transparent',
        )}
      >
        <Avatar
          name={name}
          size={size}
          className={cn(
            'bg-forest-tint text-forest font-medium',
            size === 'lg' ? 'h-28 w-28 text-3xl' : 'h-20 w-20 text-xl',
          )}
        />
      </div>
      <p className="text-sm font-medium text-ink">{name}</p>
    </div>
  )
}

function AudioStage({
  waiting,
  otherName,
  session,
}: {
  waiting: boolean
  otherName: string
  session: LiveSessionState
}) {
  const remotes = useRemoteParticipants()
  const { localParticipant } = useLocalParticipant()

  if (waiting) return <WaitingCard otherName={otherName} />

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10">
      <div className="flex items-end gap-12">
        {remotes[0] && (
          <SpeakingAvatar participant={remotes[0]} name={otherName} size="lg" />
        )}
        <SpeakingAvatar
          participant={localParticipant}
          name={session.my_role === 'seeker' ? 'You' : 'You'}
          size="md"
        />
      </div>
      <div className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-1.5 text-xs text-ink-soft">
        <Headphones className="h-3.5 w-3.5" /> Audio session in progress
      </div>
    </div>
  )
}

// ─── Chat (LiveKit data channel — ephemeral, never persisted) ────────────────

interface LiveChatMessage {
  id: string
  mine: boolean
  text: string
  at: number
}

function ChatStage({
  waiting,
  otherName,
  session,
}: {
  waiting: boolean
  otherName: string
  session: LiveSessionState
}) {
  const [messages, setMessages] = useState<LiveChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { send } = useDataChannel('chat', (msg) => {
    const text = new TextDecoder().decode(msg.payload)
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), mine: false, text, at: Date.now() },
    ])
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const text = draft.trim()
    if (!text) return
    send(new TextEncoder().encode(text), { reliable: true })
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), mine: true, text, at: Date.now() },
    ])
    setDraft('')
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Clearly a live human conversation — not the AI companion. */}
      <div className="mx-auto mb-4 flex items-center gap-2 rounded-full border border-forest/20 bg-forest-tint px-4 py-1.5 text-[11px] font-medium text-forest">
        <MessageSquare className="h-3.5 w-3.5" />
        Live conversation with {otherName}
        {session.my_role === 'seeker' ? ', your therapist' : ''} · not saved
      </div>

      {waiting ? (
        <WaitingCard otherName={otherName} />
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto rounded-3xl border border-line/60 bg-paper/60 p-4 sm:p-6">
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-soft">
              Say hello when you’re ready. Nothing here is stored after the
              session ends.
            </p>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              variant={m.mine ? 'user' : 'assistant'}
              timestamp={new Date(m.at).toLocaleTimeString('en-IN', {
                hour: 'numeric',
                minute: '2-digit',
              })}
            >
              {m.text}
            </MessageBubble>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="mt-4 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          rows={1}
          placeholder={waiting ? `Waiting for ${otherName}…` : 'Write a message…'}
          disabled={waiting}
          aria-label="Message"
          className="focus-ring max-h-32 min-h-[3rem] flex-1 resize-none rounded-2xl border border-line bg-paper px-4 py-3 text-[0.9375rem] text-ink placeholder:text-ink-soft/60 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={waiting || !draft.trim()}
          aria-label="Send message"
          className="focus-ring flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-forest text-white transition-all hover:bg-forest-deep active:scale-[0.96] disabled:opacity-40"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

// ─── Controls ────────────────────────────────────────────────────────────────

function ControlBar({
  modality,
  isTherapist,
  onLeave,
  onEndForAll,
}: {
  modality: SessionModality
  isTherapist: boolean
  onLeave: () => void
  onEndForAll: () => void
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant()
  const [confirmEnd, setConfirmEnd] = useState(false)

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center pb-5">
      <div className="flex items-center gap-2 rounded-full border border-line/60 bg-paper/95 px-3 py-2 shadow-soft backdrop-blur">
        {modality !== 'chat' && (
          <ControlButton
            active={isMicrophoneEnabled}
            onClick={() =>
              localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
            }
            label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            {isMicrophoneEnabled ? (
              <Mic className="h-5 w-5" />
            ) : (
              <MicOff className="h-5 w-5" />
            )}
          </ControlButton>
        )}
        {modality === 'video' && (
          <ControlButton
            active={isCameraEnabled}
            onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
            label={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
          >
            {isCameraEnabled ? (
              <VideoIcon className="h-5 w-5" />
            ) : (
              <VideoOff className="h-5 w-5" />
            )}
          </ControlButton>
        )}

        <button
          type="button"
          onClick={onLeave}
          className="focus-ring ml-1 inline-flex h-11 items-center gap-2 rounded-full bg-red-600/90 px-5 text-sm font-semibold text-white transition-all hover:bg-red-700 active:scale-[0.98]"
        >
          <PhoneOff className="h-4 w-4" /> Leave
        </button>

        {isTherapist &&
          (confirmEnd ? (
            <button
              type="button"
              onClick={onEndForAll}
              className="focus-ring inline-flex h-11 items-center rounded-full border border-red-300 bg-red-50 px-4 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
            >
              End for everyone?
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmEnd(true)}
              className="focus-ring inline-flex h-11 items-center rounded-full border border-line bg-paper px-4 text-xs font-medium text-ink-soft transition-colors hover:bg-red-50 hover:text-red-700"
            >
              End session
            </button>
          ))}
      </div>
    </div>
  )
}

function ControlButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'focus-ring flex h-11 w-11 items-center justify-center rounded-full transition-colors',
        active
          ? 'bg-forest-tint text-forest hover:bg-forest/15'
          : 'bg-ink/10 text-ink-soft hover:bg-ink/15',
      )}
    >
      {children}
    </button>
  )
}

// ─── Therapist private notes (encrypted server-side, therapist-only) ─────────

function NotesDrawer({
  bookingId,
  onClose,
}: {
  bookingId: string
  onClose: () => void
}) {
  return (
    <motion.aside
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-line/60 bg-cream p-6 shadow-xl"
      role="dialog"
      aria-label="Private session notes"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl text-ink">Private notes</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close notes"
          className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-line bg-paper text-ink-soft hover:bg-forest-tint"
        >
          ×
        </button>
      </div>
      <NotesEditor bookingId={bookingId} />
    </motion.aside>
  )
}

// ─── Post-session ────────────────────────────────────────────────────────────

function EndScreen({
  session,
  bookingId,
  endedByTherapist,
}: {
  session: LiveSessionState
  bookingId: string
  endedByTherapist: boolean
}) {
  const navigate = useNavigate()
  const isTherapist = session.my_role === 'therapist'
  const wasNoShow = session.status === 'no_show'

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="flex items-center justify-between px-6 py-5">
        <Logo className="h-7" />
        {session.my_role === 'seeker' && <CrisisButton />}
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-6 px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full space-y-6 text-center"
        >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-forest-tint text-forest">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <div className="space-y-2">
            <h1 className="font-display text-4xl text-ink">
              {wasNoShow
                ? 'This session didn’t take place'
                : endedByTherapist && !isTherapist
                  ? 'Your session has ended'
                  : 'Thank you for showing up'}
            </h1>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-ink-soft">
              {wasNoShow
                ? 'It looks like this session was missed. If something went wrong, our support team can help you reschedule.'
                : isTherapist
                  ? 'Take a moment for yourself before your next session. Your private notes are below.'
                  : 'Sessions like this take courage. Be gentle with yourself for the rest of the day.'}
            </p>
            {session.duration_minutes != null && !wasNoShow && (
              <p className="text-xs text-ink-soft">
                {MODALITY_LABEL[session.modality]} · {session.duration_minutes} min
              </p>
            )}
          </div>

          {isTherapist && !wasNoShow && (
            <div className="rounded-3xl border border-line/60 bg-paper p-5 text-left shadow-soft">
              <NotesEditor bookingId={bookingId} />
            </div>
          )}

          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() =>
                navigate(isTherapist ? '/therapist/dashboard' : '/dashboard')
              }
              className="focus-ring inline-flex h-12 items-center justify-center rounded-full bg-forest px-8 text-sm font-semibold text-white shadow-soft transition-all hover:bg-forest-deep active:scale-[0.98]"
            >
              Back to your space
            </button>
            {!isTherapist && !wasNoShow && (
              <Link
                to="/dashboard/session"
                className="focus-ring rounded-sm text-sm font-medium text-forest underline underline-offset-4"
              >
                Reflect with your AI companion
              </Link>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  )
}
