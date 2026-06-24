import { NextRequest, NextResponse } from 'next/server'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: NextRequest) {
  try {
    const { messages, systemPrompt } = await req.json() as {
      messages: Message[]
      systemPrompt: string
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Anthropic API error:', err)
      return NextResponse.json({ error: 'Claude API error' }, { status: 502 })
    }

    const data = await res.json()
    const reply = (data.content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('')

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('POST /api/ask error:', err)
    return NextResponse.json({ error: 'Ask failed' }, { status: 500 })
  }
}
