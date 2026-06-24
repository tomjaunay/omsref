'use client'
import { useState, useRef } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  thinking?: boolean
}

interface AskClaudeProps {
  systemPrompt: string
}

const SUGGESTIONS = [
  'Who are my top 5 referrers this year?',
  'Which practices are growing fastest?',
  'Which dentists have dropped off recently?',
  'Who sends the most complex cases?',
  'Which practices have the highest value cases?',
  'Summarise the key trends across all quarters',
]

function simpleMarkdown(text: string): string {
  // Convert list items first, then wrap consecutive <li> blocks
  const withLi = text.replace(/^- (.+)$/gm, '<li>$1</li>')
  const withUl = withLi.replace(/((<li>[^]*?<\/li>\n?)+)/g, '<ul>$1</ul>')
  return withUl
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.)/, '<p>$1')
    .replace(/(.)$/, '$1</p>')
    .replace(/<p><ul>/g, '<ul>')
    .replace(/<\/ul><\/p>/g, '</ul>')
}

export default function AskClaude({ systemPrompt }: AskClaudeProps) {
  const [open, setOpen] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [history, setHistory] = useState<{ role: string; content: string }[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  async function send(q: string) {
    if (!q.trim() || loading) return
    const question = q.trim()
    setInput('')
    setLoading(true)
    setShowSuggestions(false)
    if (!open) setOpen(true)

    setMessages(prev => [...prev, { role: 'user', content: question }])
    setMessages(prev => [...prev, { role: 'assistant', content: '', thinking: true }])

    const newHistory = [...history, { role: 'user', content: question }]

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistory, systemPrompt }),
      })
      const data = await res.json()
      const reply = data.reply ?? 'Sorry, I could not generate a response.'
      setHistory([...newHistory, { role: 'assistant', content: reply }])
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: reply },
      ])
    } catch {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'Error connecting to Claude. Please try again.' },
      ])
    }
    setLoading(false)
    setTimeout(scrollToBottom, 50)
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, marginBottom: 22, overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 16px', borderBottom: open ? '1px solid var(--divider)' : 'none',
          cursor: 'pointer', userSelect: 'none',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#fafaf8')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>Ask Claude about your referral data</span>
        <span style={{ fontSize: 12, color: 'var(--muted)', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </div>

      {/* Body */}
      {open && (
        <div style={{ padding: '14px 16px' }}>
          {/* Suggestions */}
          {showSuggestions && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    padding: '5px 11px', fontSize: 12, borderRadius: 20,
                    border: '1px solid var(--border)', background: 'transparent',
                    cursor: 'pointer', color: 'var(--muted)', whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--accent)'
                    e.currentTarget.style.color = 'var(--accent-d)'
                    e.currentTarget.style.background = 'var(--accent-l)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.color = 'var(--muted)'
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
              placeholder="Ask anything about your referral data…"
              rows={1}
              style={{
                flex: 1, padding: '8px 12px', fontSize: 13,
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--bg)', color: 'var(--text)',
                resize: 'none', lineHeight: 1.4,
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                border: 'none', background: loading || !input.trim() ? 'var(--border)' : 'var(--accent)',
                color: loading || !input.trim() ? 'var(--muted)' : '#fff',
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              Ask ↗
            </button>
          </div>

          {/* Messages */}
          {messages.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 600, marginTop: 1,
                    background: m.role === 'user' ? 'var(--blue-l)' : 'var(--accent-l)',
                    color: m.role === 'user' ? 'var(--blue)' : 'var(--accent-d)',
                  }}>
                    {m.role === 'user' ? 'You' : 'AI'}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.65, color: m.role === 'user' ? 'var(--muted)' : 'var(--text)' }}>
                    {m.thinking ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
                        {[0, 200, 400].map(delay => (
                          <span key={delay} style={{
                            width: 5, height: 5, borderRadius: '50%', background: 'var(--muted)',
                            animation: `blink 1.2s infinite ${delay}ms`,
                            display: 'inline-block',
                          }} />
                        ))}
                      </div>
                    ) : (
                      <span dangerouslySetInnerHTML={{ __html: simpleMarkdown(m.content) }} />
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
