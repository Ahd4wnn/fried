import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'

import { useAuth } from '../../auth/auth-context'
import { api, ApiError } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { MessageBubble } from '../ui/MessageBubble'
import { Button } from '../ui'
import { Logo } from '../Logo'
import { Reveal, ChipsReveal, GeneratingIndicator } from './reveal'
import { useReducedMotion } from '../../motion/useReducedMotion'

interface Bubble {
  key: number
  role: 'assistant' | 'user'
  text: string
}

type OnboardingStep =
  | 'legal_name'
  | 'whatsapp_number'
  | 'professional_title'
  | 'professional_title_other'
  | 'registration_body'
  | 'registration_body_other'
  | 'registration_number'
  | 'qualification'
  | 'institution_and_year'
  | 'years_experience'
  | 'specializations'
  | 'languages'
  | 'gender'
  | 'session_modes'
  | 'price_inr'
  | 'practice_setting'
  | 'bio'
  | 'document_upload'
  | 'declarations'
  | 'finished'

export function TherapistOnboardingChat() {
  const navigate = useNavigate()
  const { me, refreshMe, signOut } = useAuth()
  const reduced = useReducedMotion()

  const [step, setStep] = useState<OnboardingStep>('legal_name')
  const [stepHistory, setStepHistory] = useState<OnboardingStep[]>(['legal_name'])
  const [transcript, setTranscript] = useState<Bubble[]>([])
  const [generating, setGenerating] = useState(false)
  const [inputReady, setInputReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Form answers state
  const [legalName, setLegalName] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [professionalTitle, setProfessionalTitle] = useState('')
  const [professionalTitleOther, setProfessionalTitleOther] = useState('')
  const [registrationBody, setRegistrationBody] = useState('')
  const [registrationBodyOther, setRegistrationBodyOther] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [qualification, setQualification] = useState('')
  const [institution, setInstitution] = useState('')
  const [qualificationYear, setQualificationYear] = useState('')
  const [yearsExperience, setYearsExperience] = useState<
    '<2' | '2–5' | '5–10' | '10+' | ''
  >('')
  const [specializations, setSpecializations] = useState<string[]>([])
  const [specializationsOther, setSpecializationsOther] = useState('')
  const [languages, setLanguages] = useState<string[]>([])
  const [languagesOther, setLanguagesOther] = useState('')
  const [gender, setGender] = useState<
    'male' | 'female' | 'non_binary' | 'prefer_not_to_say' | ''
  >('')
  const [sessionModes, setSessionModes] = useState<
    Array<'video' | 'audio' | 'chat'>
  >([])
  const [priceInr, setPriceInr] = useState('1500')
  const [practiceSetting, setPracticeSetting] = useState('')
  const [bio, setBio] = useState('')

  // Uploaded documents state (storage paths)
  const [degreeCert, setDegreeCert] = useState<string | null>(null)
  const [degreeFile, setDegreeFile] = useState<File | null>(null)
  const [degreeUploading, setDegreeUploading] = useState(false)

  const [regCert, setRegCert] = useState<string | null>(null)
  const [regFile, setRegFile] = useState<File | null>(null)
  const [regUploading, setRegUploading] = useState(false)

  const [govId, setGovId] = useState<string | null>(null)
  const [govFile, setGovFile] = useState<File | null>(null)
  const [govUploading, setGovUploading] = useState(false)

  const [profilePhoto, setProfilePhoto] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)

  // Declarations checklist
  const [credentialsGenuine, setCredentialsGenuine] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [consentData, setConsentData] = useState(false)
  const [confirmHuman, setConfirmHuman] = useState(false)

  const textInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const keyRef = useRef(0)
  const startedRef = useRef(false)
  const mountedRef = useRef(true)

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

  const delayTime = useCallback(
    () => (reduced ? 100 : 300 + Math.random() * 150),
    [reduced],
  )

  const askQuestion = useCallback(
    async (nextStep: OnboardingStep, promptText: string) => {
      setStep(nextStep)
      setStepHistory((prev) => {
        if (prev[prev.length - 1] === nextStep) return prev
        return [...prev, nextStep]
      })
      setInputReady(false)
      setGenerating(true)
      await new Promise((r) => setTimeout(r, delayTime()))
      if (!mountedRef.current) return
      setGenerating(false)
      pushBubble('assistant', promptText)
      setInputReady(true)
    },
    [pushBubble, delayTime],
  )

  const handleGoBack = () => {
    if (generating || submitting || stepHistory.length <= 1) return
    const newHistory = [...stepHistory]
    newHistory.pop() // remove current step
    const prevStep = newHistory[newHistory.length - 1]

    setStep(prevStep)
    setStepHistory(newHistory)
    setTranscript((t) => t.slice(0, -2))
    setInputReady(true)
    setGenerating(false)
  }

  // Kick off first question
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void askQuestion(
      'legal_name',
      'Welcome to Hovio. To begin setting up your therapist profile, please enter your full legal name as it appears on your professional credentials.',
    )
  }, [askQuestion])

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'end',
    })
  }, [transcript, generating, inputReady, step, reduced])

  // Focus helper
  useEffect(() => {
    if (inputReady && !generating) {
      textInputRef.current?.focus()
      textareaRef.current?.focus()
    }
  }, [inputReady, generating, step])

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (generating || !inputReady) return

    let userVal: string
    if (step === 'legal_name') {
      userVal = legalName.trim()
      if (!userVal) return
      pushBubble('user', userVal)
      await askQuestion(
        'whatsapp_number',
        `Thank you, ${userVal}. What is your WhatsApp number? We use this for manual credentials verification and transactional session alerts. (Your number is envelope-encrypted and never shared.)`,
      )
    } else if (step === 'whatsapp_number') {
      userVal = whatsappNumber.trim()
      if (!userVal) return
      pushBubble('user', userVal)
      await askQuestion(
        'professional_title',
        'What is your professional title?',
      )
    } else if (step === 'professional_title_other') {
      userVal = professionalTitleOther.trim()
      if (!userVal) return
      pushBubble('user', userVal)
      setProfessionalTitle(userVal)
      await askQuestion(
        'registration_body',
        'Are you registered with a professional licensing body?',
      )
    } else if (step === 'registration_body_other') {
      userVal = registrationBodyOther.trim()
      if (!userVal) return
      pushBubble('user', userVal)
      setRegistrationBody(userVal)
      await askQuestion(
        'registration_number',
        `Please share your registration number for ${userVal}.`,
      )
    } else if (step === 'registration_number') {
      userVal = registrationNumber.trim()
      if (!userVal) return
      pushBubble('user', userVal)
      await askQuestion(
        'qualification',
        'What is your highest relevant qualification? (e.g. M.Phil in Clinical Psychology, M.Sc in Counselling Psychology)',
      )
    } else if (step === 'qualification') {
      userVal = qualification.trim()
      if (!userVal) return
      pushBubble('user', userVal)
      await askQuestion(
        'institution_and_year',
        'Which institution did you receive this qualification from, and in which year?',
      )
    } else if (step === 'institution_and_year') {
      const inst = institution.trim()
      const yr = qualificationYear.trim()
      if (!inst || !yr) return
      userVal = `${inst}, ${yr}`
      pushBubble('user', userVal)
      await askQuestion(
        'years_experience',
        'How many years of clinical experience do you have?',
      )
    } else if (step === 'price_inr') {
      userVal = priceInr.trim()
      if (!userVal) return
      pushBubble('user', `₹${userVal}`)
      await askQuestion(
        'practice_setting',
        'Where do you currently practice? (e.g., Hospital name, Clinic, or Independent/Private practice)',
      )
    } else if (step === 'practice_setting') {
      userVal = practiceSetting.trim()
      if (!userVal) return
      pushBubble('user', userVal)
      await askQuestion(
        'bio',
        'Please provide a short professional bio. Seekers will see this public bio on your profile when they match with you.',
      )
    } else if (step === 'bio') {
      userVal = bio.trim()
      if (userVal.length < 10) return
      pushBubble('user', userVal)
      await askQuestion(
        'declarations',
        'Please review and check the legal declarations below to submit your application.',
      )
    }
  }

  const handleChipSelect = async (value: string, label: string) => {
    pushBubble('user', label)
    if (step === 'professional_title') {
      if (value === 'Other') {
        await askQuestion(
          'professional_title_other',
          'Please specify your professional title.',
        )
      } else {
        setProfessionalTitle(value)
        await askQuestion(
          'registration_body',
          'Are you registered with a professional licensing body?',
        )
      }
    } else if (step === 'registration_body') {
      if (value === 'RCI') {
        setRegistrationBody('RCI')
        await askQuestion(
          'registration_number',
          'Please enter your Rehabilitation Council of India (RCI) registration number.',
        )
      } else if (value === 'Other') {
        await askQuestion(
          'registration_body_other',
          'Which professional body are you registered with?',
        )
      } else {
        setRegistrationBody('None')
        setRegistrationNumber('')
        await askQuestion(
          'qualification',
          'What is your highest relevant qualification? (e.g. M.Phil in Clinical Psychology)',
        )
      }
    } else if (step === 'years_experience') {
      setYearsExperience(value as '<2' | '2–5' | '5–10' | '10+')
      await askQuestion(
        'specializations',
        'Select your areas of focus or specializations. You can choose multiple.',
      )
    } else if (step === 'gender') {
      setGender(value as 'male' | 'female' | 'non_binary' | 'prefer_not_to_say')
      await askQuestion(
        'session_modes',
        'Which session modes do you offer? Select all that apply.',
      )
    }
  }

  // Multi-select submit helpers
  const handleMultiSubmit = async () => {
    if (step === 'specializations') {
      const displaySpecs = [...specializations]
      if (specializationsOther.trim()) {
        displaySpecs.push(specializationsOther.trim())
      }
      pushBubble('user', displaySpecs.join(', '))
      await askQuestion(
        'languages',
        'What languages can you conduct sessions in? Select all that apply.',
      )
    } else if (step === 'languages') {
      const displayLangs = [...languages]
      if (languagesOther.trim()) {
        displayLangs.push(languagesOther.trim())
      }
      pushBubble('user', displayLangs.join(', '))
      await askQuestion(
        'gender',
        'What is your gender? (We use this for seeker gender preference matching.)',
      )
    } else if (step === 'session_modes') {
      pushBubble('user', sessionModes.join(', '))
      await askQuestion('price_inr', 'What is your fee per session in INR?')
    }
  }

  // Supabase Storage file upload helper
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    docType:
      | 'degree_certificate'
      | 'registration_certificate'
      | 'government_id'
      | 'profile_photo',
  ) => {
    if (!me || !e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]

    if (docType === 'profile_photo') {
      if (file.size > 5 * 1024 * 1024) {
        alert('Profile photo size exceeds the 5MB limit.')
        return
      }
      setPhotoFile(file)
      setProfilePhoto(file.name)
      return
    }

    // Local validation
    if (file.size > 15 * 1024 * 1024) {
      alert('File size exceeds the 15MB limit.')
      return
    }

    const setUploading = (val: boolean) => {
      if (docType === 'degree_certificate') setDegreeUploading(val)
      else if (docType === 'registration_certificate') setRegUploading(val)
      else if (docType === 'government_id') setGovUploading(val)
      else if (docType === 'profile_photo') setPhotoUploading(val)
    }

    const setPath = (val: string) => {
      if (docType === 'degree_certificate') setDegreeCert(val)
      else if (docType === 'registration_certificate') setRegCert(val)
      else if (docType === 'government_id') setGovId(val)
      else if (docType === 'profile_photo') setProfilePhoto(val)
    }

    const setFileState = (val: File) => {
      if (docType === 'degree_certificate') setDegreeFile(val)
      else if (docType === 'registration_certificate') setRegFile(val)
      else if (docType === 'government_id') setGovFile(val)
      else if (docType === 'profile_photo') setPhotoFile(val)
    }

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const storagePath = `${me.id}/${docType}_${Date.now()}.${ext}`

      const { error } = await supabase.storage
        .from('therapist-credentials')
        .upload(storagePath, file)

      if (error) throw error

      setPath(storagePath)
      setFileState(file)
    } catch (err) {
      console.error('Upload error:', err)
      const message = err instanceof Error ? err.message : String(err)
      alert(`Upload failed: ${message}`)
    } finally {
      setUploading(false)
    }
  }

  const handleDocsDone = async () => {
    if (!degreeCert || !govId) {
      alert('Degree Certificate and Government ID are required.')
      return
    }
    pushBubble('user', 'Documents uploaded successfully.')
    await askQuestion(
      'declarations',
      'Please review and check the legal declarations below to submit your application.',
    )
  }

  // Submit onboarding details to backend
  const handleFinalSubmit = async () => {
    setSubmitting(true)
    setSubmitError(null)

    // Construct documents payload
    const docsPayload: Array<{ doc_type: string; storage_path: string }> = []
    if (degreeCert) {
      docsPayload.push({
        doc_type: 'degree_certificate',
        storage_path: degreeCert,
      })
    }
    if (govId) {
      docsPayload.push({
        doc_type: 'government_id',
        storage_path: govId,
      })
    }
    if (regCert) {
      docsPayload.push({
        doc_type: 'registration_certificate',
        storage_path: regCert,
      })
    }

    const finalSpecs = [...specializations]
    if (specializationsOther.trim()) {
      finalSpecs.push(specializationsOther.trim())
    }

    const finalLangs = [...languages]
    if (languagesOther.trim()) {
      finalLangs.push(languagesOther.trim())
    }

    const onboardingPayload = {
      legal_name: legalName,
      whatsapp_number: whatsappNumber,
      professional_title: professionalTitle,
      registration_body: registrationBody,
      registration_number: registrationNumber || null,
      qualification,
      institution,
      qualification_year: Number.parseInt(qualificationYear, 10),
      years_experience: yearsExperience as '<2' | '2–5' | '5–10' | '10+',
      specializations: finalSpecs,
      languages: finalLangs,
      gender: gender as 'male' | 'female' | 'non_binary' | 'prefer_not_to_say',
      session_modes: sessionModes,
      price_inr: Number.parseInt(priceInr, 10),
      practice_setting: practiceSetting,
      bio,
      documents: docsPayload,
      declarations: {
        credentials_genuine: credentialsGenuine,
        agree_terms_conduct: agreeTerms,
        consent_data_processing: consentData,
        confirm_human_professional: confirmHuman,
      },
    }

    try {
      await api.submitTherapistOnboarding(onboardingPayload)
      if (photoFile) {
        try {
          await api.uploadProfilePhoto(photoFile)
        } catch (uploadErr) {
          console.error('Failed to upload profile photo to Cloudinary:', uploadErr)
        }
      }
      setStep('finished')
      pushBubble(
        'assistant',
        'Thanks — your application is in review. We verify every therapist manually and will be in touch.',
      )
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : 'Submission failed. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleDashboardRedirect = async () => {
    await refreshMe()
    navigate('/therapist/dashboard', { replace: true })
  }

  const isMultiValid = () => {
    if (step === 'specializations')
      return (
        specializations.length > 0 || specializationsOther.trim().length > 0
      )
    if (step === 'languages')
      return languages.length > 0 || languagesOther.trim().length > 0
    if (step === 'session_modes') return sessionModes.length > 0
    return false
  }

  const isFormValid = () => {
    if (step === 'legal_name') return legalName.trim().length >= 2
    if (step === 'whatsapp_number') return whatsappNumber.trim().length >= 8
    if (step === 'professional_title_other')
      return professionalTitleOther.trim().length >= 2
    if (step === 'registration_body_other')
      return registrationBodyOther.trim().length >= 2
    if (step === 'registration_number')
      return registrationNumber.trim().length >= 2
    if (step === 'qualification') return qualification.trim().length >= 2
    if (step === 'institution_and_year')
      return (
        institution.trim().length >= 2 && qualificationYear.trim().length === 4
      )
    if (step === 'price_inr')
      return priceInr.trim().length > 0 && !Number.isNaN(Number(priceInr))
    if (step === 'practice_setting') return practiceSetting.trim().length >= 2
    if (step === 'bio') return bio.trim().length >= 10
    return false
  }

  const toggleMultiSelect = (
    val: string,
    type: 'specs' | 'langs' | 'modes',
  ) => {
    if (type === 'specs') {
      setSpecializations((s) =>
        s.includes(val) ? s.filter((x) => x !== val) : [...s, val],
      )
    } else if (type === 'langs') {
      setLanguages((l) =>
        l.includes(val) ? l.filter((x) => x !== val) : [...l, val],
      )
    } else if (type === 'modes') {
      setSessionModes((m) =>
        m.includes(val as 'video' | 'audio' | 'chat')
          ? m.filter((x) => x !== val)
          : [...m, val as 'video' | 'audio' | 'chat'],
      )
    }
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <main className="flex h-svh flex-col bg-cream select-none">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between px-6 py-3 select-none">
        <Logo />
        <Button variant="quiet" size="sm" onClick={handleLogout}>
          Log out
        </Button>
      </header>

      {/* Main chat view */}
      <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin select-text">
        <div className="mx-auto max-w-xl space-y-6">
          {transcript.map((bubble) => (
            <Reveal key={bubble.key}>
              <MessageBubble variant={bubble.role}>{bubble.text}</MessageBubble>
            </Reveal>
          ))}

          <AnimatePresence initial={false}>
            {generating && (
              <GeneratingIndicator key="typing" label="Hovio is typing..." />
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input Composer Panel */}
      <div className="shrink-0 bg-transparent px-4 pb-6 pt-2">
        <div className="mx-auto max-w-xl">
          <AnimatePresence mode="wait">
            {inputReady && !generating && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="w-full bg-paper rounded-2xl border border-forest-300/10 p-4 shadow-lg"
              >
                {step !== 'legal_name' && step !== 'finished' && (
                  <div className="flex justify-start mb-3 border-b border-line/30 pb-2">
                    <button
                      type="button"
                      onClick={handleGoBack}
                      className="text-xs text-ink-soft hover:text-forest transition-colors font-medium flex items-center gap-1 select-none focus:outline-none"
                    >
                      <span className="text-sm">←</span> Go back to previous question
                    </button>
                  </div>
                )}
                {/* Text Answers */}
                {(step === 'legal_name' ||
                  step === 'whatsapp_number' ||
                  step === 'professional_title_other' ||
                  step === 'registration_body_other' ||
                  step === 'registration_number' ||
                  step === 'qualification' ||
                  step === 'practice_setting') && (
                  <form onSubmit={handleTextSubmit} className="flex gap-2">
                    <input
                      ref={textInputRef}
                      type="text"
                      value={
                        step === 'legal_name'
                          ? legalName
                          : step === 'whatsapp_number'
                            ? whatsappNumber
                            : step === 'professional_title_other'
                              ? professionalTitleOther
                              : step === 'registration_body_other'
                                ? registrationBodyOther
                                : step === 'registration_number'
                                  ? registrationNumber
                                  : step === 'qualification'
                                    ? qualification
                                    : practiceSetting
                      }
                      onChange={(e) => {
                        if (step === 'legal_name') setLegalName(e.target.value)
                        else if (step === 'whatsapp_number')
                          setWhatsappNumber(e.target.value)
                        else if (step === 'professional_title_other')
                          setProfessionalTitleOther(e.target.value)
                        else if (step === 'registration_body_other')
                          setRegistrationBodyOther(e.target.value)
                        else if (step === 'registration_number')
                          setRegistrationNumber(e.target.value)
                        else if (step === 'qualification')
                          setQualification(e.target.value)
                        else setPracticeSetting(e.target.value)
                      }}
                      placeholder={
                        step === 'legal_name'
                          ? 'Enter legal name'
                          : step === 'whatsapp_number'
                            ? 'Enter WhatsApp number'
                            : 'Type your answer...'
                      }
                      className="flex-1 bg-transparent border-none outline-none focus:border-none focus:outline-none focus:ring-0 focus-visible:ring-0 text-sm text-ink placeholder:text-ink-soft/40 px-1 py-2"
                      style={{
                        border: 'none',
                        outline: 'none',
                        boxShadow: 'none',
                      }}
                    />
                    <Button type="submit" disabled={!isFormValid()} size="sm">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </form>
                )}

                {/* Session fee slider (₹750–₹3,000) */}
                {step === 'price_inr' && (
                  <form onSubmit={handleTextSubmit} className="space-y-4 px-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-ink-soft">
                        Fee per session
                      </span>
                      <span className="font-display text-2xl text-forest">
                        ₹{Number(priceInr).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={750}
                      max={3000}
                      step={50}
                      value={priceInr}
                      onChange={(e) => setPriceInr(e.target.value)}
                      aria-label="Fee per session in rupees"
                      className="w-full cursor-pointer accent-forest"
                    />
                    <div className="flex justify-between text-xs text-ink-soft">
                      <span>₹750</span>
                      <span>₹3,000</span>
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" size="sm">
                        Continue
                      </Button>
                    </div>
                  </form>
                )}

                {/* Double Text Input for Institution + Year */}
                {step === 'institution_and_year' && (
                  <form onSubmit={handleTextSubmit} className="space-y-3">
                    <div className="flex flex-col gap-2">
                      <input
                        ref={textInputRef}
                        type="text"
                        value={institution}
                        onChange={(e) => setInstitution(e.target.value)}
                        placeholder="Institution name (e.g. NIMHANS)"
                        className="bg-transparent border-t-0 border-x-0 border-b border-line outline-none text-sm text-ink placeholder:text-ink-soft/40 py-2 px-1 focus:border-forest focus:ring-0 focus-visible:ring-0 focus:border-t-0 focus:border-x-0"
                        style={{
                          borderTop: 'none',
                          borderLeft: 'none',
                          borderRight: 'none',
                          outline: 'none',
                          boxShadow: 'none',
                        }}
                      />
                      <input
                        type="text"
                        maxLength={4}
                        value={qualificationYear}
                        onChange={(e) =>
                          setQualificationYear(
                            e.target.value.replace(/\D/g, ''),
                          )
                        }
                        placeholder="Graduation Year (e.g. 2018)"
                        className="bg-transparent border-t-0 border-x-0 border-b border-line outline-none text-sm text-ink placeholder:text-ink-soft/40 py-2 px-1 focus:border-forest focus:ring-0 focus-visible:ring-0 focus:border-t-0 focus:border-x-0"
                        style={{
                          borderTop: 'none',
                          borderLeft: 'none',
                          borderRight: 'none',
                          outline: 'none',
                          boxShadow: 'none',
                        }}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" disabled={!isFormValid()} size="sm">
                        Continue
                      </Button>
                    </div>
                  </form>
                )}

                {/* Textarea for public bio */}
                {step === 'bio' && (
                  <form onSubmit={handleTextSubmit} className="space-y-3">
                    <textarea
                      ref={textareaRef}
                      rows={3}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Write your professional bio..."
                      className="w-full resize-none bg-transparent border border-line rounded-lg outline-none text-sm text-ink placeholder:text-ink-soft/40 p-3 focus:border-forest"
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-ink-soft/60">
                        Min 10 characters
                      </span>
                      <Button type="submit" disabled={!isFormValid()} size="sm">
                        Continue
                      </Button>
                    </div>
                  </form>
                )}

                {/* Single Choice Chips */}
                {step === 'professional_title' && (
                  <ChipsReveal className="flex flex-wrap gap-2 justify-center">
                    {[
                      'Clinical Psychologist',
                      'Counselling Psychologist',
                      'Psychotherapist',
                      'Counsellor',
                      'Other',
                    ].map((title) => (
                      <button
                        key={title}
                        type="button"
                        onClick={() => handleChipSelect(title, title)}
                        className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-semibold hover:bg-forest-tint transition-all"
                      >
                        {title}
                      </button>
                    ))}
                  </ChipsReveal>
                )}

                {step === 'registration_body' && (
                  <ChipsReveal className="flex flex-wrap gap-2 justify-center">
                    {[
                      {
                        value: 'RCI',
                        label: 'RCI (Rehabilitation Council of India)',
                      },
                      { value: 'Other', label: 'Other body' },
                      { value: 'None', label: 'Not registered' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleChipSelect(opt.value, opt.label)}
                        className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-semibold hover:bg-forest-tint transition-all"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </ChipsReveal>
                )}

                {step === 'years_experience' && (
                  <ChipsReveal className="flex flex-wrap gap-2 justify-center">
                    {['<2', '2–5', '5–10', '10+'].map((yr) => (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => handleChipSelect(yr, `${yr} years`)}
                        className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-semibold hover:bg-forest-tint transition-all"
                      >
                        {yr} years
                      </button>
                    ))}
                  </ChipsReveal>
                )}

                {step === 'gender' && (
                  <ChipsReveal className="flex flex-wrap gap-2 justify-center">
                    {[
                      { value: 'female', label: 'Woman' },
                      { value: 'male', label: 'Man' },
                      { value: 'non_binary', label: 'Non-binary' },
                      {
                        value: 'prefer_not_to_say',
                        label: 'Prefer not to say',
                      },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleChipSelect(opt.value, opt.label)}
                        className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-semibold hover:bg-forest-tint transition-all"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </ChipsReveal>
                )}

                {/* Multi Select Chips */}
                {step === 'specializations' && (
                  <div className="space-y-4">
                    <p className="text-[10px] font-semibold text-ink-soft uppercase tracking-wider">
                      Select specializations
                    </p>
                    <ChipsReveal className="flex flex-wrap gap-1.5">
                      {[
                        'anxiety',
                        'depression',
                        'relationships',
                        'trauma',
                        'stress',
                        'grief',
                        'work/career',
                        'family',
                        'self-esteem',
                      ].map((spec) => {
                        const isSel = specializations.includes(spec)
                        return (
                          <button
                            key={spec}
                            type="button"
                            onClick={() => toggleMultiSelect(spec, 'specs')}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                              isSel
                                ? 'border-forest bg-forest text-cream'
                                : 'border-line bg-paper text-ink hover:bg-forest-tint'
                            }`}
                          >
                            {spec}
                          </button>
                        )
                      })}
                    </ChipsReveal>
                    <input
                      type="text"
                      value={specializationsOther}
                      onChange={(e) => setSpecializationsOther(e.target.value)}
                      placeholder="Other specializations (comma-separated)..."
                      className="w-full bg-transparent border-b border-line outline-none text-xs text-ink placeholder:text-ink-soft/40 py-2"
                    />
                    <div className="flex justify-end pt-1">
                      <Button
                        onClick={handleMultiSubmit}
                        disabled={!isMultiValid()}
                        size="sm"
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                )}

                {step === 'languages' && (
                  <div className="space-y-4">
                    <p className="text-[10px] font-semibold text-ink-soft uppercase tracking-wider">
                      Select languages
                    </p>
                    <ChipsReveal className="flex flex-wrap gap-1.5">
                      {[
                        'English',
                        'Hindi',
                        'Malayalam',
                        'Tamil',
                        'Telugu',
                        'Kannada',
                        'Bengali',
                      ].map((lang) => {
                        const isSel = languages.includes(lang)
                        return (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => toggleMultiSelect(lang, 'langs')}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                              isSel
                                ? 'border-forest bg-forest text-cream'
                                : 'border-line bg-paper text-ink hover:bg-forest-tint'
                            }`}
                          >
                            {lang}
                          </button>
                        )
                      })}
                    </ChipsReveal>
                    <input
                      type="text"
                      value={languagesOther}
                      onChange={(e) => setLanguagesOther(e.target.value)}
                      placeholder="Other languages (comma-separated)..."
                      className="w-full bg-transparent border-b border-line outline-none text-xs text-ink placeholder:text-ink-soft/40 py-2"
                    />
                    <div className="flex justify-end pt-1">
                      <Button
                        onClick={handleMultiSubmit}
                        disabled={!isMultiValid()}
                        size="sm"
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                )}

                {step === 'session_modes' && (
                  <div className="space-y-4">
                    <p className="text-[10px] font-semibold text-ink-soft uppercase tracking-wider">
                      Select session modes
                    </p>
                    <ChipsReveal className="flex flex-wrap gap-1.5 justify-center">
                      {[
                        { value: 'video', label: 'Video' },
                        { value: 'audio', label: 'Audio' },
                        { value: 'chat', label: 'Chat' },
                      ].map((opt) => {
                        const isSel = sessionModes.includes(
                          opt.value as 'video' | 'audio' | 'chat',
                        )
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              toggleMultiSelect(opt.value, 'modes')
                            }
                            className={`rounded-full border px-4 py-2 text-xs font-semibold transition-all ${
                              isSel
                                ? 'border-forest bg-forest text-cream'
                                : 'border-line bg-paper text-ink hover:bg-forest-tint'
                            }`}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </ChipsReveal>
                    <div className="flex justify-end pt-1">
                      <Button
                        onClick={handleMultiSubmit}
                        disabled={!isMultiValid()}
                        size="sm"
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                )}

                {/* Upload Credentials Flow */}
                {step === 'document_upload' && (
                  <div className="space-y-5">
                    <p className="text-[10px] font-semibold text-ink-soft uppercase tracking-wider text-center">
                      Upload verification documents (Max 15MB each)
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Degree Upload */}
                      <div className="p-3 border border-dashed border-line rounded-xl flex flex-col justify-between h-28 bg-cream/20">
                        <div>
                          <p className="text-xs font-semibold text-ink">
                            Degree Certificate *
                          </p>
                          <p className="text-[10px] text-ink-soft mt-0.5">
                            {degreeFile ? degreeFile.name : 'No file selected'}
                          </p>
                        </div>
                        <label className="focus-ring block text-center rounded-full bg-forest-tint text-forest py-1.5 text-2xs font-semibold cursor-pointer hover:bg-forest/10 select-none">
                          {degreeUploading
                            ? 'Uploading...'
                            : degreeCert
                              ? 'Change File'
                              : 'Select PDF/Image'}
                          <input
                            type="file"
                            onChange={(e) =>
                              handleFileUpload(e, 'degree_certificate')
                            }
                            accept="application/pdf,image/*"
                            className="hidden"
                            disabled={degreeUploading}
                          />
                        </label>
                      </div>

                      {/* RCI / Reg Upload */}
                      <div className="p-3 border border-dashed border-line rounded-xl flex flex-col justify-between h-28 bg-cream/20">
                        <div>
                          <p className="text-xs font-semibold text-ink">
                            Registration Certificate
                          </p>
                          <p className="text-[10px] text-ink-soft mt-0.5">
                            {regFile ? regFile.name : 'No file selected'}
                          </p>
                        </div>
                        <label className="focus-ring block text-center rounded-full bg-forest-tint text-forest py-1.5 text-2xs font-semibold cursor-pointer hover:bg-forest/10 select-none">
                          {regUploading
                            ? 'Uploading...'
                            : regCert
                              ? 'Change File'
                              : 'Select PDF/Image'}
                          <input
                            type="file"
                            onChange={(e) =>
                              handleFileUpload(e, 'registration_certificate')
                            }
                            accept="application/pdf,image/*"
                            className="hidden"
                            disabled={regUploading}
                          />
                        </label>
                      </div>

                      {/* Government ID Upload */}
                      <div className="p-3 border border-dashed border-line rounded-xl flex flex-col justify-between h-28 bg-cream/20">
                        <div>
                          <p className="text-xs font-semibold text-ink">
                            Government ID *
                          </p>
                          <p className="text-[10px] text-ink-soft mt-0.5">
                            {govFile ? govFile.name : 'No file selected'}
                          </p>
                        </div>
                        <label className="focus-ring block text-center rounded-full bg-forest-tint text-forest py-1.5 text-2xs font-semibold cursor-pointer hover:bg-forest/10 select-none">
                          {govUploading
                            ? 'Uploading...'
                            : govId
                              ? 'Change File'
                              : 'Select PDF/Image'}
                          <input
                            type="file"
                            onChange={(e) =>
                              handleFileUpload(e, 'government_id')
                            }
                            accept="application/pdf,image/*"
                            className="hidden"
                            disabled={govUploading}
                          />
                        </label>
                      </div>

                      {/* Profile Photo Upload */}
                      <div className="p-3 border border-dashed border-line rounded-xl flex flex-col justify-between h-28 bg-cream/20">
                        <div>
                          <p className="text-xs font-semibold text-ink">
                            Profile Photo
                          </p>
                          <p className="text-[10px] text-ink-soft mt-0.5">
                            {photoFile ? photoFile.name : 'No file selected'}
                          </p>
                        </div>
                        <label className="focus-ring block text-center rounded-full bg-forest-tint text-forest py-1.5 text-2xs font-semibold cursor-pointer hover:bg-forest/10 select-none">
                          {photoUploading
                            ? 'Uploading...'
                            : profilePhoto
                              ? 'Change File'
                              : 'Select Image'}
                          <input
                            type="file"
                            onChange={(e) =>
                              handleFileUpload(e, 'profile_photo')
                            }
                            accept="image/*"
                            className="hidden"
                            disabled={photoUploading}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button
                        onClick={handleDocsDone}
                        disabled={
                          !degreeCert ||
                          !govId ||
                          degreeUploading ||
                          regUploading ||
                          govUploading ||
                          photoUploading
                        }
                        size="sm"
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                )}

                {/* Declarations Checklist */}
                {step === 'declarations' && (
                  <div className="space-y-4 select-none">
                    <p className="text-xs font-bold text-ink uppercase tracking-wider text-center">
                      Declarations
                    </p>
                    <div className="space-y-3">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={credentialsGenuine}
                          onChange={(e) =>
                            setCredentialsGenuine(e.target.checked)
                          }
                          className="h-4.5 w-4.5 rounded border-line text-forest focus:ring-forest mt-0.5 cursor-pointer"
                        />
                        <span className="text-xs text-ink-soft leading-relaxed">
                          I confirm that all uploaded documents and credentials
                          are genuine and currently valid.
                        </span>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={agreeTerms}
                          onChange={(e) => setAgreeTerms(e.target.checked)}
                          className="h-4.5 w-4.5 rounded border-line text-forest focus:ring-forest mt-0.5 cursor-pointer"
                        />
                        <span className="text-xs text-ink-soft leading-relaxed">
                          I agree to the Terms of Service and commit to a
                          professional code of ethical conduct.
                        </span>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={consentData}
                          onChange={(e) => setConsentData(e.target.checked)}
                          className="h-4.5 w-4.5 rounded border-line text-forest focus:ring-forest mt-0.5 cursor-pointer"
                        />
                        <span className="text-xs text-ink-soft leading-relaxed">
                          I consent to the processing of my credential
                          verification details and documents.
                        </span>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={confirmHuman}
                          onChange={(e) => setConfirmHuman(e.target.checked)}
                          className="h-4.5 w-4.5 rounded border-line text-forest focus:ring-forest mt-0.5 cursor-pointer"
                        />
                        <span className="text-xs text-ink-soft leading-relaxed">
                          I confirm that I am a real, qualified human
                          professional (not an AI or bot).
                        </span>
                      </label>
                    </div>

                    {submitError && (
                      <p
                        className="text-xs text-danger text-center"
                        role="alert"
                      >
                        {submitError}
                      </p>
                    )}

                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={handleFinalSubmit}
                        disabled={
                          submitting ||
                          !credentialsGenuine ||
                          !agreeTerms ||
                          !consentData ||
                          !confirmHuman
                        }
                        size="sm"
                        className="w-full flex items-center justify-center gap-2"
                      >
                        {submitting
                          ? 'Submitting Application...'
                          : 'Submit Application'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Finished State */}
                {step === 'finished' && (
                  <div className="space-y-4 text-center">
                    <p className="text-sm text-ink-soft leading-relaxed">
                      Your application has been received and is currently under
                      manual credentials review. We will contact you once
                      verification is complete.
                    </p>
                    <Button
                      onClick={handleDashboardRedirect}
                      className="w-full justify-center"
                    >
                      Go to Dashboard
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  )
}
