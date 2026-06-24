import { NextRequest, NextResponse } from 'next/server'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''

  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set')
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    const { messages, systemPrompt } = await req.json() as {
      messages: Message[]
      systemPrompt: string
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('Anthropic API error:', JSON.stringify(data))
      return NextResponse.json(
        { error: data?.error?.message ?? 'Anthropic API error' },
        { status: 502 }
      )
    }

    const reply = (data.content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('')

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('POST /api/ask error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
