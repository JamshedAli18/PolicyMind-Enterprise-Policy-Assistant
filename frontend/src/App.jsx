import { useState, useRef, useEffect, useCallback } from 'react'
import './index.css'

const API_URL = 'http://localhost:8000/chat'

const SUGGESTIONS = [
  'How many sick days do I get per year?',
  'What is the meal limit for dinner during travel?',
  'What approval is needed for expenses over $2,000?',
  'How many weeks of parental leave does a primary caregiver get?',
]

// --- Speech Recognition Setup ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
const recognition = SpeechRecognition ? new SpeechRecognition() : null
if (recognition) {
  recognition.continuous = false
  recognition.interimResults = true
  recognition.lang = 'en-US'
}

// --- TTS ---
function speak(text) {
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.rate = 0.95
  utter.pitch = 0.85
  utter.volume = 1.0
  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find(v =>
    v.name.includes('Microsoft David') ||
    v.name.includes('Google UK English Male') ||
    v.name.includes('Microsoft Mark') ||
    v.name.includes('Microsoft James') ||
    (v.name.toLowerCase().includes('male') && v.lang.startsWith('en'))
  )
  if (preferred) utter.voice = preferred
  window.speechSynthesis.speak(utter)
}

function NamespaceBadge({ namespace }) {
  if (!namespace) return null
  const isFinance = namespace.includes('finance')
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '11px',
      fontWeight: '500',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      padding: '2px 8px',
      borderRadius: '3px',
      backgroundColor: isFinance ? 'var(--tag-finance)' : 'var(--tag-hr)',
      color: isFinance ? 'var(--tag-finance-text)' : 'var(--tag-hr-text)',
      marginBottom: '8px',
    }}>
      {isFinance ? 'Finance' : 'HR'}
    </span>
  )
}

function Message({ msg, onSpeak }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: '20px',
        animation: 'fadeUp 0.25s ease',
      }}>
        <div style={{
          maxWidth: '68%',
          backgroundColor: 'var(--user-bg)',
          color: 'var(--user-text)',
          padding: '12px 18px',
          borderRadius: '16px 16px 4px 16px',
          fontSize: '14px',
          lineHeight: '1.6',
        }}>
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'flex-start',
      marginBottom: '20px',
      animation: 'fadeUp 0.25s ease',
    }}>
      <div style={{ maxWidth: '78%' }}>
        <NamespaceBadge namespace={msg.namespace} />
        <div style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          padding: '14px 18px',
          borderRadius: '4px 16px 16px 16px',
          fontSize: '14px',
          lineHeight: '1.7',
          color: 'var(--text-primary)',
          position: 'relative',
        }}>
          {msg.content}
        </div>

        {/* Source tags + speak button row */}
        <div style={{
          marginTop: '8px',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '6px',
        }}>
          {msg.sources && msg.sources.map((s, i) => (
            <span key={i} style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              backgroundColor: 'var(--accent-light)',
              border: '1px solid var(--border)',
              padding: '2px 8px',
              borderRadius: '3px',
              fontFamily: 'monospace',
            }}>
              {s}
            </span>
          ))}
          {/* Speak button */}
          <button
            onClick={() => onSpeak(msg.content)}
            title="Read aloud"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '3px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              transition: 'border-color 0.15s, color 0.15s',
              fontFamily: 'DM Sans, sans-serif',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--border-dark)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
              <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"
                stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Listen
          </button>
        </div>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'flex-start',
      marginBottom: '20px',
    }}>
      <div style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        padding: '14px 18px',
        borderRadius: '4px 16px 16px 16px',
        display: 'flex',
        gap: '5px',
        alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: 'var(--text-muted)',
            display: 'inline-block',
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

// --- Mic wave animation bars ---
function MicWave() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '3px',
      height: '18px',
    }}>
      {[0, 1, 2, 3, 4].map(i => (
        <span key={i} style={{
          width: '3px',
          borderRadius: '2px',
          backgroundColor: '#ef4444',
          display: 'inline-block',
          animation: `wave 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
        }} />
      ))}
    </div>
  )
}

export default function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [autoSpeak, setAutoSpeak] = useState(true)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const started = messages.length > 0

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // --- Recognition handlers ---
  useEffect(() => {
    if (!recognition) return

    recognition.onresult = (e) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          final += e.results[i][0].transcript
        } else {
          interim += e.results[i][0].transcript
        }
      }
      if (final) {
        setInput(prev => (prev + ' ' + final).trim())
        setInterimText('')
      } else {
        setInterimText(interim)
      }
    }

    recognition.onend = () => {
      setRecording(false)
      setInterimText('')
    }

    recognition.onerror = () => {
      setRecording(false)
      setInterimText('')
    }
  }, [])

  function toggleRecording() {
    if (!recognition) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.')
      return
    }
    if (recording) {
      recognition.stop()
      setRecording(false)
    } else {
      setInput('')
      recognition.start()
      setRecording(true)
    }
  }

  async function sendMessage(text) {
    const question = text || input.trim()
    if (!question || loading) return
    if (recording) recognition.stop()

    setInput('')
    setInterimText('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await res.json()
      const answer = data.answer
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: answer,
        namespace: data.namespace,
        sources: data.sources || [],
      }])
      if (autoSpeak) speak(answer)
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Could not connect to the policy server. Please ensure the backend is running.',
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const wasRecording = useRef(false)
  useEffect(() => {
    if (wasRecording.current && !recording && input.trim() && !loading) {
      sendMessage()
    }
    wasRecording.current = recording
  }, [recording, input, loading])

  const displayText = interimText
    ? (input ? input + ' ' + interimText : interimText)
    : input

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50%       { opacity: 1;   transform: scale(1.1); }
        }
        @keyframes wave {
          from { height: 4px; }
          to   { height: 18px; }
        }
        @keyframes ripple {
          0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
          100% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        }
        textarea:focus { outline: none; }
        textarea { resize: none; }
      `}</style>

      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: '780px',
        margin: '0 auto',
        padding: '0 20px',
      }}>

        {/* Header */}
        <header style={{
          padding: '28px 0 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
            <h1 style={{
              fontFamily: 'DM Serif Display, serif',
              fontSize: '22px',
              fontWeight: '400',
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
            }}>
              Policy Assistant
            </h1>
            <span style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              letterSpacing: '0.04em',
            }}>
              HR &amp; Finance
            </span>
          </div>

          {/* Auto-speak toggle */}
          <button
            onClick={() => { window.speechSynthesis.cancel(); setAutoSpeak(p => !p) }}
            title={autoSpeak ? 'Auto-speak on' : 'Auto-speak off'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '12px',
              color: autoSpeak ? 'var(--text-primary)' : 'var(--text-muted)',
              fontFamily: 'DM Sans, sans-serif',
              transition: 'all 0.15s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              {autoSpeak ? (
                <>
                  <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <>
                  <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" />
                  <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" />
                </>
              )}
            </svg>
            {autoSpeak ? 'Auto-speak on' : 'Auto-speak off'}
          </button>
        </header>

        {/* Welcome block */}
        <div style={{
          padding: '28px 0 24px',
          borderBottom: started ? '1px solid var(--border)' : 'none',
          flexShrink: 0,
        }}>
          <p style={{
            fontFamily: 'DM Serif Display, serif',
            fontSize: '30px',
            fontWeight: '400',
            lineHeight: '1.25',
            color: 'var(--text-primary)',
            marginBottom: '8px',
            letterSpacing: '-0.02em',
          }}>
            What would you like<br />
            <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
              to know today?
            </span>
          </p>
          <p style={{
            fontSize: '14px',
            color: 'var(--text-muted)',
            marginBottom: started ? '0' : '28px',
            fontWeight: '300',
          }}>
            Ask anything about company HR or Finance policies.
          </p>

          {!started && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              animation: 'fadeUp 0.4s ease',
            }}>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    textAlign: 'left',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    lineHeight: '1.5',
                    transition: 'border-color 0.15s, color 0.15s',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--border-dark)'
                    e.currentTarget.style.color = 'var(--text-primary)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Messages */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          padding: started ? '24px 0 16px' : '0',
        }}>
          {messages.map((msg, i) => (
            <Message key={i} msg={msg} onSpeak={speak} />
          ))}
          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </main>

        {/* Input bar */}
        <div style={{ padding: '16px 0 24px', flexShrink: 0 }}>

          {/* Recording indicator */}
          {recording && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '10px',
              padding: '8px 14px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              animation: 'fadeUp 0.2s ease',
            }}>
              <MicWave />
              <span style={{
                fontSize: '13px',
                color: '#dc2626',
                fontWeight: '500',
              }}>
                Listening...
              </span>
              {interimText && (
                <span style={{
                  fontSize: '13px',
                  color: '#6b7280',
                  fontStyle: 'italic',
                  marginLeft: '4px',
                }}>
                  {interimText}
                </span>
              )}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '8px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '12px 14px',
              transition: 'border-color 0.2s',
            }}
            onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--border-dark)'}
            onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <textarea
              ref={inputRef}
              value={displayText}
              onChange={e => {
                if (!recording) {
                  setInput(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={recording ? 'Listening...' : 'Ask about a policy...'}
              rows={1}
              readOnly={recording}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                fontSize: '14px',
                color: recording ? 'var(--text-muted)' : 'var(--text-primary)',
                fontFamily: 'DM Sans, sans-serif',
                lineHeight: '1.6',
                minHeight: '24px',
                maxHeight: '120px',
                overflow: 'auto',
                fontStyle: interimText && recording ? 'italic' : 'normal',
              }}
            />

            {/* Mic button */}
            <button
              onClick={toggleRecording}
              title={recording ? 'Stop recording' : 'Start voice input'}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: recording ? '#ef4444' : 'var(--accent-light)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background-color 0.15s',
                animation: recording ? 'ripple 1s ease-out infinite' : 'none',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                {recording ? (
                  <rect x="6" y="6" width="12" height="12" rx="2"
                    fill="white" />
                ) : (
                  <>
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"
                      stroke="var(--text-secondary)" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"
                      stroke="var(--text-secondary)" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </>
                )}
              </svg>
            </button>

            {/* Send button */}
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: input.trim() && !loading ? 'var(--accent)' : 'var(--border)',
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background-color 0.15s',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 2L7.5 13M7.5 2L3 6.5M7.5 2L12 6.5"
                  stroke={input.trim() && !loading ? '#F7F6F2' : '#9C9A93'}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          <p style={{
            textAlign: 'center',
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginTop: '10px',
            letterSpacing: '0.02em',
          }}>
            Answers are based on official company policy documents only.
          </p>
        </div>
      </div>
    </>
  )
}