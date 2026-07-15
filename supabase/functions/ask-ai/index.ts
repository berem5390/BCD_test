const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type RequestFile = {
  name: string
  mimeType: string
  data: string
}

type AskRequest = {
  question?: string
  file?: RequestFile | null
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'POST 요청만 허용됩니다.' }, 405)

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'Gemini API 키가 설정되지 않았습니다.' }, 500)

    const { question = '', file = null } = await request.json() as AskRequest
    if (!question.trim() && !file) return jsonResponse({ error: '질문 또는 파일이 필요합니다.' }, 400)

    // Base64는 원본보다 약 33% 커지므로 인코딩된 크기를 기준으로 약 10MB를 제한합니다.
    if (file?.data && file.data.length > 14_000_000) {
      return jsonResponse({ error: '파일 크기는 10MB 이하여야 합니다.' }, 413)
    }

    const parts: Array<Record<string, unknown>> = []
    if (question.trim()) parts.push({ text: question.trim() })
    if (file) {
      parts.push({
        inlineData: {
          mimeType: file.mimeType || 'application/octet-stream',
          data: file.data,
        },
      })
      parts.push({ text: `첨부 파일명: ${file.name}` })
    }

    const geminiResponse = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
        }),
      },
    )

    const result = await geminiResponse.json()
    if (!geminiResponse.ok) {
      console.error('Gemini API error:', result)
      return jsonResponse({ error: result?.error?.message ?? 'Gemini API 요청에 실패했습니다.' }, geminiResponse.status)
    }

    const answer = result?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? '')
      .join('\n')
      .trim()

    if (!answer) return jsonResponse({ error: 'Gemini가 답변을 생성하지 못했습니다.' }, 502)
    return jsonResponse({ answer, model: 'gemini-3.1-flash-lite' })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: error instanceof Error ? error.message : '서버 오류가 발생했습니다.' }, 500)
  }
})
