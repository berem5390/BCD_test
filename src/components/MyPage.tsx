import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const PAGE_SIZE = 5
const PAGE_GROUP_SIZE = 5

type KpiData = {
  likes: number
  secretPosts: number
  posts: number
  monthlyPosts: number
}

type SecretPost = {
  id: string
  post_number: number
  title: string
  like_count: number
  view_count: number
  created_at: string
}

type MyPageProps = { user: User }

const formatDate = (date: string) => new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(date))

export default function MyPage({ user }: MyPageProps) {
  const [kpis, setKpis] = useState<KpiData>({ likes: 0, secretPosts: 0, posts: 0, monthlyPosts: 0 })
  const [secretPosts, setSecretPosts] = useState<SecretPost[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [loadingKpis, setLoadingKpis] = useState(true)
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [error, setError] = useState('')

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const pageNumbers = useMemo(() => {
    const start = Math.floor((page - 1) / PAGE_GROUP_SIZE) * PAGE_GROUP_SIZE + 1
    return Array.from({ length: Math.min(PAGE_GROUP_SIZE, totalPages - start + 1) }, (_, index) => start + index)
  }, [page, totalPages])

  useEffect(() => {
    const loadKpis = async () => {
      setLoadingKpis(true)
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const [likes, secrets, allPosts, monthly] = await Promise.all([
        supabase.from('post_likes').select('post_id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', user.id).eq('is_secret', true),
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', user.id),
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', user.id).gte('created_at', monthStart),
      ])
      const queryError = likes.error || secrets.error || allPosts.error || monthly.error
      if (queryError) setError(queryError.message)
      else setKpis({
        likes: likes.count ?? 0,
        secretPosts: secrets.count ?? 0,
        posts: allPosts.count ?? 0,
        monthlyPosts: monthly.count ?? 0,
      })
      setLoadingKpis(false)
    }
    void loadKpis()
  }, [user.id])

  const loadSecretPosts = useCallback(async () => {
    setLoadingPosts(true)
    setError('')
    let query = supabase
      .from('posts')
      .select('id, post_number, title, like_count, view_count, created_at', { count: 'exact' })
      .eq('author_id', user.id)
      .eq('is_secret', true)
      .order('post_number', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    if (search) query = query.ilike('title', `%${search}%`)
    const { data, count, error: queryError } = await query
    if (queryError) setError(queryError.message)
    else {
      setSecretPosts((data ?? []) as SecretPost[])
      setTotalCount(count ?? 0)
    }
    setLoadingPosts(false)
  }, [page, search, user.id])

  useEffect(() => { void loadSecretPosts() }, [loadSecretPosts])

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  const cards = [
    { label: '좋아요', value: kpis.likes, icon: '♥', tone: 'rose', description: '내가 좋아요 한 게시글' },
    { label: '비밀글', value: kpis.secretPosts, icon: '●', tone: 'gold', description: '내가 작성한 비밀글' },
    { label: '게시글', value: kpis.posts, icon: '▤', tone: 'green', description: '내가 작성한 전체 글' },
    { label: '이번 달에 작성한 글', value: kpis.monthlyPosts, icon: '◷', tone: 'blue', description: '이번 달 작성한 게시글' },
  ]

  return (
    <main className="mypage">
      <section className="mypage-kpis" aria-label="나의 활동 요약">
        {cards.map((card) => <article className={`kpi-card ${card.tone}`} key={card.label}>
          <div className="kpi-icon" aria-hidden="true">{card.icon}</div>
          <div><p>{card.label}</p><strong>{loadingKpis ? '–' : card.value.toLocaleString()} <small>건</small></strong><span>{card.description}</span></div>
        </article>)}
      </section>

      <section className="my-secret-section">
        <div className="my-secret-header">
          <div><p className="eyebrow">PRIVATE POSTS</p><h1>나의 비밀글</h1><p>내가 작성한 비밀글을 한곳에서 확인하세요.</p></div>
          <form className="mypage-search" onSubmit={submitSearch}>
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="제목으로 검색" aria-label="비밀글 제목 검색" />
            <button type="submit">검색</button>
          </form>
        </div>

        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="my-secret-list">
          <div className="my-secret-list-head"><span>번호</span><span>제목</span><span>조회</span><span>좋아요</span><span>작성일</span></div>
          {loadingPosts ? <div className="mypage-list-status"><div className="loader" /></div> : secretPosts.length ? secretPosts.map((post) => <article key={post.id}>
            <span>{post.post_number}</span><strong><span className="secret-badge">비밀</span>{post.title}</strong><span>{post.view_count}</span><span>♥ {post.like_count}</span><time>{formatDate(post.created_at)}</time>
          </article>) : <div className="mypage-list-status">{search ? '검색 결과가 없습니다.' : '작성한 비밀글이 없습니다.'}</div>}
        </div>

        <div className="pagination mypage-pagination" aria-label="나의 비밀글 페이지">
          <button onClick={() => setPage(1)} disabled={page === 1} aria-label="첫 페이지">«</button>
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} aria-label="이전 페이지">‹</button>
          {pageNumbers.map((number) => <button key={number} className={page === number ? 'active' : ''} onClick={() => setPage(number)}>{number}</button>)}
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} aria-label="다음 페이지">›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} aria-label="마지막 페이지">»</button>
        </div>
      </section>
    </main>
  )
}
