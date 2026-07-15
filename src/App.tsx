import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import Board from './components/Board'
import ChargingStationMap from './components/ChargingStationMap'
import MyPage from './components/MyPage'

type AuthMode = 'login' | 'signup'

const authErrorMessage = (message: string) => {
  const messages: Record<string, string> = {
    'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'Email not confirmed': '이메일 인증을 완료한 뒤 다시 로그인해주세요.',
    'User already registered': '이미 가입된 이메일입니다.',
    'Password should be at least 6 characters': '비밀번호는 6자 이상이어야 합니다.',
  }
  return messages[message] ?? message
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [answerStatus, setAnswerStatus] = useState('')
  const [asking, setAsking] = useState(false)
  const [activePage, setActivePage] = useState<'home' | 'board' | 'locations' | 'mypage'>('home')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setError('')
    setMessage('')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: name.trim() },
            emailRedirectTo: window.location.origin,
          },
        })
        if (signUpError) throw signUpError

        if (data.session) {
          setMessage('회원가입이 완료되었습니다.')
        } else {
          setMessage('가입 확인 메일을 보냈습니다. 이메일의 인증 링크를 확인해주세요.')
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
      }
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : '요청을 처리하지 못했습니다.'
      setError(authErrorMessage(text))
    } finally {
      setSubmitting(false)
    }
  }

  const handleSignOut = async () => {
    setSubmitting(true)
    setError('')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(authErrorMessage(signOutError.message))
    setSubmitting(false)
  }

  const selectFile = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('파일 크기는 10MB 이하여야 합니다.')
      return
    }
    setError('')
    setSelectedFile(file)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    selectFile(event.dataTransfer.files)
  }

  const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })

  const handleQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!question.trim() && !selectedFile) return
    setAsking(true)
    setError('')
    setAnswerStatus('')

    try {
      const file = selectedFile
        ? {
            name: selectedFile.name,
            mimeType: selectedFile.type || 'application/octet-stream',
            data: await fileToBase64(selectedFile),
          }
        : null

      const { data, error: functionError } = await supabase.functions.invoke('ask-ai', {
        body: { question: question.trim(), file },
      })

      if (functionError) throw functionError
      if (!data?.answer) throw new Error('AI 답변을 받지 못했습니다.')
      setAnswerStatus(data.answer as string)
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : 'AI 요청을 처리하지 못했습니다.'
      setError(text)
    } finally {
      setAsking(false)
    }
  }

  if (authLoading) {
    return <main className="page"><div className="loader" aria-label="로그인 상태 확인 중" /></main>
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="page">
        <section className="card setup-card">
          <span className="brand-mark">S</span>
          <p className="eyebrow">설정이 필요합니다</p>
          <h1>Supabase를 연결해주세요</h1>
          <p className="subtitle"><code>.env.example</code>을 <code>.env.local</code>로 복사한 뒤 프로젝트 URL과 anon key를 입력하세요.</p>
        </section>
      </main>
    )
  }

  if (session) {
    const displayName = session.user.user_metadata.name as string | undefined
    return (
      <div className="app-shell">
        <header className="topbar">
          <button className="logo" type="button" onClick={() => setActivePage('home')} aria-label="홈으로 이동"><span className="logo-mark">S</span><span>Studio</span></button>
          <nav aria-label="주 메뉴">
            <button className={`nav-item${activePage === 'home' ? ' active' : ''}`} type="button" onClick={() => setActivePage('home')}>홈</button>
            <button className={`nav-item${activePage === 'board' ? ' active' : ''}`} type="button" onClick={() => setActivePage('board')}>게시판</button>
            <button className="nav-item" type="button" title="준비 중인 페이지입니다">대시보드</button>
            <button className={`nav-item nav-location-item${activePage === 'locations' ? ' active' : ''}`} type="button" onClick={() => setActivePage('locations')}>전국전동휠체어급속충전기 위치</button>
            <button className={`nav-item${activePage === 'mypage' ? ' active' : ''}`} type="button" onClick={() => setActivePage('mypage')}>마이페이지</button>
          </nav>
          <div className="user-menu">
            <div className="mini-avatar">{(displayName || session.user.email || 'U')[0].toUpperCase()}</div>
            <button className="logout-button" onClick={handleSignOut} disabled={submitting}>
              {submitting ? '로그아웃 중…' : '로그아웃'}
            </button>
          </div>
        </header>

        {activePage === 'board' ? <Board user={session.user} /> : activePage === 'locations' ? <ChargingStationMap /> : activePage === 'mypage' ? <MyPage user={session.user} /> : <main className="home-page" id="home">
          <section className="request-panel">
            <div className="request-content">
              <p className="eyebrow">WELCOME HOME</p>
              <h1>{displayName ? `${displayName}님, 환영합니다.` : '환영합니다.'}</h1>
              <p className="question-heading">AI에게 무엇을 요청할까요?</p>

              <form className="question-form" onSubmit={handleQuestion}>
                <label className="sr-only" htmlFor="question">AI에게 요청할 내용</label>
                <textarea
                  id="question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="궁금한 내용이나 필요한 작업을 자세히 입력해주세요."
                  rows={6}
                />

                <div
                  className={`dropzone${isDragging ? ' dragging' : ''}`}
                  onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click() }}
                >
                  <input ref={fileInputRef} type="file" onChange={(event) => selectFile(event.target.files)} hidden />
                  <span className="upload-icon" aria-hidden="true">↑</span>
                  {selectedFile ? (
                    <div><strong>{selectedFile.name}</strong><span>{(selectedFile.size / 1024).toFixed(1)} KB</span></div>
                  ) : (
                    <div><strong>파일을 여기에 놓아주세요</strong><span>또는 클릭하여 파일 선택</span></div>
                  )}
                </div>

                {error && <p className="notice error" role="alert">{error}</p>}
                <button className="ask-button" type="submit" disabled={asking || (!question.trim() && !selectedFile)}>
                  {asking ? '답변 생성 중…' : '질문하기'} {!asking && <span>→</span>}
                </button>
              </form>
            </div>
          </section>

          <section className="answer-panel" aria-live="polite">
            <div className="answer-header"><span className="answer-dot" />AI 대답:</div>
            <div className="answer-content">
              {asking ? (
                <div className="answer-loading"><div className="loader" /><p>Gemini가 답변을 작성하고 있습니다.</p></div>
              ) : answerStatus ? (
                <p className="answer-text">{answerStatus}</p>
              ) : (
                <div className="empty-answer"><span>✦</span><p>질문을 입력하면<br />AI의 답변이 여기에 표시됩니다.</p></div>
              )}
            </div>
          </section>
        </main>}
      </div>
    )
  }

  return (
    <main className="page">
      <section className="card">
        <div className="heading">
          <span className="brand-mark">S</span>
          <p className="eyebrow">WELCOME</p>
          <h1>{mode === 'login' ? '다시 만나 반가워요' : '새 계정을 만들어보세요'}</h1>
          <p className="subtitle">
            {mode === 'login' ? '계정에 로그인하고 계속 진행하세요.' : '몇 가지 정보만 입력하면 바로 시작할 수 있어요.'}
          </p>
        </div>

        <div className="tabs" role="tablist" aria-label="인증 방식">
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>로그인</button>
          <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => changeMode('signup')}>회원가입</button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <label>
              이름
              <input type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="홍길동" required />
            </label>
          )}
          <label>
            이메일
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required />
          </label>
          <label>
            비밀번호
            <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6자 이상 입력" minLength={6} required />
          </label>

          {error && <p className="notice error" role="alert">{error}</p>}
          {message && <p className="notice success" role="status">{message}</p>}

          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? '처리 중…' : mode === 'login' ? '로그인' : '계정 만들기'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default App
