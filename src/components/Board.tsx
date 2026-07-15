import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../lib/supabase'

const PAGE_SIZE = 10
const PAGE_GROUP_SIZE = 5
const MAX_FILES = 3
const MAX_FILE_SIZE = 10 * 1024 * 1024

type BoardView = 'list' | 'detail' | 'write' | 'edit'
type SearchField = 'title' | 'author_name'

type Post = {
  id: string
  post_number: number
  author_id: string
  author_name: string
  title: string
  content: string
  is_secret: boolean
  like_count: number
  view_count: number
  created_at: string
  updated_at: string
}

type Attachment = {
  id: string
  post_id: string
  original_name: string
  storage_path: string
  mime_type: string
  file_size: number
  created_at: string
}

type PostComment = {
  id: string
  post_id: string
  author_id: string
  author_name: string
  content: string
  created_at: string
  updated_at: string
}

type BoardProps = { user: User }

const errorMessage = (caught: unknown) => {
  if (caught instanceof Error) return caught.message
  if (typeof caught === 'object' && caught !== null && 'message' in caught) return String(caught.message)
  return '요청을 처리하지 못했습니다.'
}

const formatDate = (date: string) => new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}).format(new Date(date))

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_')

export default function Board({ user }: BoardProps) {
  const [view, setView] = useState<BoardView>('list')
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [removedAttachments, setRemovedAttachments] = useState<Attachment[]>([])
  const [isLiked, setIsLiked] = useState(false)
  const [comments, setComments] = useState<PostComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [searchField, setSearchField] = useState<SearchField>('title')
  const [appliedSearchField, setAppliedSearchField] = useState<SearchField>('title')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [password, setPassword] = useState('')
  const [isSecret, setIsSecret] = useState(false)
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit')
  const [deletePassword, setDeletePassword] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const pageNumbers = useMemo(() => {
    const start = Math.floor((page - 1) / PAGE_GROUP_SIZE) * PAGE_GROUP_SIZE + 1
    return Array.from({ length: Math.min(PAGE_GROUP_SIZE, totalPages - start + 1) }, (_, index) => start + index)
  }, [page, totalPages])

  const loadPosts = useCallback(async () => {
    setLoading(true)
    setError('')
    let query = supabase
      .from('posts')
      .select('id, post_number, author_id, author_name, title, content, is_secret, like_count, view_count, created_at, updated_at', { count: 'exact' })
      .order('post_number', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    if (search) query = query.ilike(appliedSearchField, `%${search}%`)
    const { data, count, error: queryError } = await query
    if (queryError) setError(queryError.message)
    else {
      setPosts((data ?? []) as Post[])
      setTotalCount(count ?? 0)
    }
    setLoading(false)
  }, [page, search, appliedSearchField])

  useEffect(() => { void loadPosts() }, [loadPosts])

  const loadPostExtras = async (post: Post) => {
    const [{ data: fileData, error: fileError }, { data: likeData }, { data: commentData, error: commentError }] = await Promise.all([
      supabase.from('post_attachments').select('*').eq('post_id', post.id).order('created_at'),
      supabase.from('post_likes').select('post_id').eq('post_id', post.id).eq('user_id', user.id).maybeSingle(),
      supabase.from('post_comments').select('*').eq('post_id', post.id).order('created_at'),
    ])
    if (fileError) throw fileError
    if (commentError) throw commentError
    setAttachments((fileData ?? []) as Attachment[])
    setIsLiked(Boolean(likeData))
    setComments((commentData ?? []) as PostComment[])
  }

  const openDetail = async (post: Post) => {
    setView('detail')
    setLoading(true)
    setError('')
    setShowDelete(false)
    setEditingCommentId(null)
    try {
      const { data: viewCount, error: viewError } = await supabase.rpc('increment_post_view', { p_post_id: post.id })
      if (viewError) throw viewError
      const viewedPost = { ...post, view_count: Number(viewCount ?? post.view_count) }
      setSelectedPost(viewedPost)
      await loadPostExtras(viewedPost)
    } catch (caught) {
      setSelectedPost(post)
      setError(errorMessage(caught))
    }
    finally { setLoading(false) }
  }

  const resetForm = () => {
    setTitle('')
    setContent('')
    setPassword('')
    setIsSecret(false)
    setNewFiles([])
    setRemovedAttachments([])
    setEditorTab('edit')
    setError('')
  }

  const openWrite = () => { resetForm(); setSelectedPost(null); setAttachments([]); setView('write') }
  const openEdit = () => {
    if (!selectedPost) return
    setTitle(selectedPost.title)
    setContent(selectedPost.content)
    setPassword('')
    setIsSecret(selectedPost.is_secret)
    setNewFiles([])
    setRemovedAttachments([])
    setEditorTab('edit')
    setError('')
    setView('edit')
  }

  const chooseFiles = (files: FileList | null) => {
    if (!files) return
    const incoming = Array.from(files)
    const remainingExisting = attachments.length - removedAttachments.length
    if (remainingExisting + newFiles.length + incoming.length > MAX_FILES) {
      setError(`첨부파일은 게시글당 최대 ${MAX_FILES}개까지 가능합니다.`)
      return
    }
    const oversized = incoming.find((file) => file.size > MAX_FILE_SIZE)
    if (oversized) {
      setError(`${oversized.name}: 파일 크기는 10MB 이하여야 합니다.`)
      return
    }
    setError('')
    setNewFiles((current) => [...current, ...incoming])
  }

  const uploadFiles = async (postId: string, files: File[]) => {
    for (const file of files) {
      const storagePath = `${user.id}/${postId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
      const { error: uploadError } = await supabase.storage.from('post-attachments').upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
      })
      if (uploadError) throw uploadError

      const { error: metadataError } = await supabase.from('post_attachments').insert({
        post_id: postId,
        original_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || 'application/octet-stream',
        file_size: file.size,
      })
      if (metadataError) {
        await supabase.storage.from('post-attachments').remove([storagePath])
        throw metadataError
      }
    }
  }

  const removeStoredFiles = async (files: Attachment[]) => {
    if (!files.length) return
    const paths = files.map((file) => file.storage_path)
    const { error: storageError } = await supabase.storage.from('post-attachments').remove(paths)
    if (storageError) throw storageError
    const { error: rowError } = await supabase.from('post_attachments').delete().in('id', files.map((file) => file.id))
    if (rowError) throw rowError
  }

  const savePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (view === 'write') {
        const { data: postId, error: createError } = await supabase.rpc('create_post', {
          p_title: title,
          p_content: content,
          p_password: password,
          p_is_secret: isSecret,
        })
        if (createError) throw createError
        await uploadFiles(postId as string, newFiles)
        resetForm()
        setPage(1)
        setView('list')
        await loadPosts()
      } else if (selectedPost) {
        const { error: updateError } = await supabase.rpc('update_post', {
          p_post_id: selectedPost.id,
          p_title: title,
          p_content: content,
          p_password: password,
          p_is_secret: isSecret,
        })
        if (updateError) throw updateError
        await removeStoredFiles(removedAttachments)
        await uploadFiles(selectedPost.id, newFiles)

        const updated = { ...selectedPost, title: title.trim(), content: content.trim(), is_secret: isSecret, updated_at: new Date().toISOString() }
        setSelectedPost(updated)
        setPassword('')
        setRemovedAttachments([])
        setNewFiles([])
        await loadPostExtras(updated)
        setView('detail')
      }
    } catch (caught) { setError(errorMessage(caught)) }
    finally { setSaving(false) }
  }

  const deletePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedPost) return
    setSaving(true)
    setError('')
    try {
      const { error: deleteError } = await supabase.rpc('delete_post', {
        p_post_id: selectedPost.id,
        p_password: deletePassword,
      })
      if (deleteError) throw deleteError
      if (attachments.length) {
        const { error: storageError } = await supabase.storage.from('post-attachments').remove(attachments.map((file) => file.storage_path))
        if (storageError) console.error('Deleted post but could not remove stored files:', storageError)
      }
      setDeletePassword('')
      setSelectedPost(null)
      setView('list')
      await loadPosts()
    } catch (caught) { setError(errorMessage(caught)) }
    finally { setSaving(false) }
  }

  const toggleLike = async () => {
    if (!selectedPost) return
    setError('')
    const previous = isLiked
    setIsLiked(!previous)
    setSelectedPost({ ...selectedPost, like_count: Math.max(0, selectedPost.like_count + (previous ? -1 : 1)) })
    const result = previous
      ? await supabase.from('post_likes').delete().eq('post_id', selectedPost.id).eq('user_id', user.id)
      : await supabase.from('post_likes').insert({ post_id: selectedPost.id, user_id: user.id })
    if (result.error) {
      setIsLiked(previous)
      setSelectedPost(selectedPost)
      setError(result.error.message)
    }
  }

  const createComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedPost || !commentText.trim()) return
    setCommentSaving(true)
    setError('')
    const { error: createError } = await supabase.rpc('create_comment', {
      p_post_id: selectedPost.id,
      p_content: commentText,
    })
    if (createError) setError(createError.message)
    else {
      setCommentText('')
      try { await loadPostExtras(selectedPost) } catch (caught) { setError(errorMessage(caught)) }
    }
    setCommentSaving(false)
  }

  const updateComment = async (commentId: string) => {
    if (!editingCommentText.trim()) return
    setCommentSaving(true)
    setError('')
    const { error: updateError } = await supabase
      .from('post_comments')
      .update({ content: editingCommentText.trim() })
      .eq('id', commentId)
    if (updateError) setError(updateError.message)
    else {
      setComments((current) => current.map((comment) => comment.id === commentId
        ? { ...comment, content: editingCommentText.trim(), updated_at: new Date().toISOString() }
        : comment))
      setEditingCommentId(null)
      setEditingCommentText('')
    }
    setCommentSaving(false)
  }

  const deleteComment = async (commentId: string) => {
    setCommentSaving(true)
    setError('')
    const { error: deleteError } = await supabase.from('post_comments').delete().eq('id', commentId)
    if (deleteError) setError(deleteError.message)
    else setComments((current) => current.filter((comment) => comment.id !== commentId))
    setCommentSaving(false)
  }

  const downloadFile = async (attachment: Attachment) => {
    setError('')
    const { data, error: signedError } = await supabase.storage
      .from('post-attachments')
      .createSignedUrl(attachment.storage_path, 60, { download: attachment.original_name })
    if (signedError) { setError(signedError.message); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setAppliedSearchField(searchField)
    setSearch(searchInput.trim())
  }

  const goToList = () => { setView('list'); setSelectedPost(null); setError(''); void loadPosts() }

  if (view === 'list') {
    return (
      <main className="board-page">
        <section className="board-container">
          <div className="board-title-row">
            <div><p className="eyebrow">COMMUNITY</p><h1>게시판</h1><p>질문과 이야기를 자유롭게 나눠보세요.</p></div>
            <button className="board-primary" onClick={openWrite}>글쓰기 <span>＋</span></button>
          </div>

          <form className="board-search" onSubmit={submitSearch}>
            <select value={searchField} onChange={(event) => setSearchField(event.target.value as SearchField)} aria-label="검색 항목">
              <option value="title">제목</option><option value="author_name">작성자</option>
            </select>
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="검색어를 입력하세요" />
            <button type="submit">검색</button>
          </form>

          {error && <p className="notice error" role="alert">{error}</p>}
          <div className="board-table-wrap">
            <table className="board-table">
              <thead><tr><th>번호</th><th>제목</th><th>작성자</th><th>조회수</th><th>좋아요</th><th>비밀글</th><th>작성일</th></tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7}><div className="board-loading"><div className="loader" /></div></td></tr>
                ) : posts.length ? posts.map((post) => (
                  <tr key={post.id}>
                    <td>{post.post_number}</td>
                    <td className="post-title-cell"><button onClick={() => void openDetail(post)}>{post.title}</button>{post.author_id === user.id && <span className="mine-badge">내 글</span>}</td>
                    <td>{post.author_name}</td>
                    <td>{post.view_count}</td>
                    <td>♥ {post.like_count}</td>
                    <td>{post.is_secret ? <span className="secret-badge">비밀</span> : '공개'}</td>
                    <td>{formatDate(post.created_at).slice(0, 12)}</td>
                  </tr>
                )) : <tr><td colSpan={7} className="empty-row">{search ? '검색 결과가 없습니다.' : '아직 작성된 게시글이 없습니다.'}</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="pagination" aria-label="게시판 페이지">
            <button onClick={() => setPage(1)} disabled={page === 1} aria-label="첫 페이지">«</button>
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} aria-label="이전 페이지">‹</button>
            {pageNumbers.map((number) => <button key={number} className={number === page ? 'active' : ''} onClick={() => setPage(number)}>{number}</button>)}
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} aria-label="다음 페이지">›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} aria-label="마지막 페이지">»</button>
          </div>
        </section>
      </main>
    )
  }

  if (view === 'write') {
    const visibleExisting = attachments.filter((file) => !removedAttachments.some((removed) => removed.id === file.id))
    return (
      <main className="board-page">
        <section className="board-container board-form-container">
          <button className="back-button" onClick={goToList}>← 돌아가기</button>
          <div className="board-title-row"><div><p className="eyebrow">NEW POST</p><h1>새 글 작성</h1></div></div>
          <form className="post-form" onSubmit={savePost}>
            <label>제목<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required placeholder="제목을 입력하세요" /></label>
            <label>게시글 비밀번호<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={4} required placeholder="수정·삭제에 사용할 비밀번호 (4자 이상)" /></label>
            <div className="markdown-field">
              <div className="markdown-label-row"><span>내용</span><div><button type="button" className={editorTab === 'edit' ? 'active' : ''} onClick={() => setEditorTab('edit')}>편집</button><button type="button" className={editorTab === 'preview' ? 'active' : ''} onClick={() => setEditorTab('preview')}>미리보기</button></div></div>
              {editorTab === 'edit' ? <textarea value={content} onChange={(event) => setContent(event.target.value)} required rows={14} placeholder={'Markdown으로 내용을 작성하세요.\n\n# 제목\n**굵은 글씨**\n- 목록'} /> : <div className="markdown-body markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content || '*미리보기할 내용이 없습니다.*'}</ReactMarkdown></div>}
            </div>
            <label className="secret-check"><input type="checkbox" checked={isSecret} onChange={(event) => setIsSecret(event.target.checked)} /><span><strong>비밀글로 작성</strong><small>비밀글은 작성자 본인에게만 표시됩니다.</small></span></label>
            <div className="file-field">
              <div className="file-label"><strong>첨부파일</strong><span>최대 3개 · 파일당 10MB</span></div>
              <label className="file-picker">파일 선택<input type="file" multiple onChange={(event) => { chooseFiles(event.target.files); event.target.value = '' }} /></label>
              {(visibleExisting.length > 0 || newFiles.length > 0) && <div className="selected-files">
                {visibleExisting.map((file) => <div key={file.id}><span>📎 {file.original_name} <small>{formatBytes(file.file_size)}</small></span><button type="button" onClick={() => setRemovedAttachments((current) => [...current, file])}>제거</button></div>)}
                {newFiles.map((file, index) => <div key={`${file.name}-${index}`}><span>📎 {file.name} <small>{formatBytes(file.size)}</small></span><button type="button" onClick={() => setNewFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>제거</button></div>)}
              </div>}
            </div>
            {error && <p className="notice error" role="alert">{error}</p>}
            <div className="form-actions"><button type="button" className="board-secondary" onClick={goToList}>취소</button><button className="board-primary" type="submit" disabled={saving}>{saving ? '저장 중…' : '게시글 등록'}</button></div>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="board-page">
      <section className="board-container detail-container">
        <button className="back-button" onClick={view === 'edit' ? () => setView('detail') : goToList}>{view === 'edit' ? '← 상세로 돌아가기' : '← 목록으로'}</button>
        {error && <p className="notice error" role="alert">{error}</p>}
        {loading || !selectedPost ? <div className="board-loading"><div className="loader" /></div> : view === 'edit' ? <>
          <div className="inline-edit-heading"><p className="eyebrow">EDIT POST</p><h1>게시글 수정</h1><p>상세 화면에서 게시글 내용을 바로 수정합니다.</p></div>
          <form className="post-form inline-edit-form" onSubmit={savePost}>
            <label>제목<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required placeholder="제목을 입력하세요" /></label>
            <label>게시글 비밀번호<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={4} required placeholder="현재 게시글 비밀번호를 입력하세요" /></label>
            <div className="markdown-field">
              <div className="markdown-label-row"><span>내용</span><div><button type="button" className={editorTab === 'edit' ? 'active' : ''} onClick={() => setEditorTab('edit')}>편집</button><button type="button" className={editorTab === 'preview' ? 'active' : ''} onClick={() => setEditorTab('preview')}>미리보기</button></div></div>
              {editorTab === 'edit' ? <textarea value={content} onChange={(event) => setContent(event.target.value)} required rows={14} placeholder="Markdown으로 내용을 작성하세요." /> : <div className="markdown-body markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content || '*미리보기할 내용이 없습니다.*'}</ReactMarkdown></div>}
            </div>
            <label className="secret-check"><input type="checkbox" checked={isSecret} onChange={(event) => setIsSecret(event.target.checked)} /><span><strong>비밀글로 작성</strong><small>비밀글은 작성자 본인에게만 표시됩니다.</small></span></label>
            <div className="file-field">
              <div className="file-label"><strong>첨부파일</strong><span>최대 3개 · 파일당 10MB</span></div>
              <label className="file-picker">파일 선택<input type="file" multiple onChange={(event) => { chooseFiles(event.target.files); event.target.value = '' }} /></label>
              {(attachments.some((file) => !removedAttachments.some((removed) => removed.id === file.id)) || newFiles.length > 0) && <div className="selected-files">
                {attachments.filter((file) => !removedAttachments.some((removed) => removed.id === file.id)).map((file) => <div key={file.id}><span>📎 {file.original_name} <small>{formatBytes(file.file_size)}</small></span><button type="button" onClick={() => setRemovedAttachments((current) => [...current, file])}>제거</button></div>)}
                {newFiles.map((file, index) => <div key={`${file.name}-${index}`}><span>📎 {file.name} <small>{formatBytes(file.size)}</small></span><button type="button" onClick={() => setNewFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>제거</button></div>)}
              </div>}
            </div>
            <div className="edit-password-guide">작성자 계정과 게시글 비밀번호가 모두 일치해야 수정할 수 있습니다.</div>
            <div className="form-actions"><button type="button" className="board-secondary" onClick={() => setView('detail')}>취소</button><button className="board-primary" type="submit" disabled={saving}>{saving ? '저장 중…' : '수정 완료'}</button></div>
          </form>
        </> : <>
          <article className="post-detail">
            <header>
              <div className="detail-badges">{selectedPost.is_secret && <span className="secret-badge">비밀글</span>}{selectedPost.author_id === user.id && <span className="mine-badge">내가 작성한 글</span>}</div>
              <h1>{selectedPost.title}</h1>
              <div className="post-meta"><span>{selectedPost.author_name}</span><span>{formatDate(selectedPost.created_at)}</span><span>글 #{selectedPost.post_number}</span><span>조회 {selectedPost.view_count}</span></div>
            </header>
            <div className="markdown-body post-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedPost.content}</ReactMarkdown></div>
            {attachments.length > 0 && <div className="attachment-list"><strong>첨부파일</strong>{attachments.map((file) => <button key={file.id} onClick={() => void downloadFile(file)}><span>📎 {file.original_name}</span><small>{formatBytes(file.file_size)} · 다운로드</small></button>)}</div>}
            <footer className="detail-footer">
              <button className={`like-button${isLiked ? ' liked' : ''}`} onClick={() => void toggleLike()}>♥ <span>{selectedPost.like_count}</span></button>
              {selectedPost.author_id === user.id && <div className="owner-actions"><button className="board-secondary" onClick={openEdit}>수정</button><button className="danger-button" onClick={() => setShowDelete(true)}>삭제</button></div>}
            </footer>
          </article>
          <section className="comments-section">
            <div className="comments-heading"><h2>댓글 <span>{comments.length}</span></h2><p>댓글은 최대 100자까지 작성할 수 있습니다.</p></div>
            <form className="comment-form" onSubmit={createComment}>
              <textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength={100} rows={3} placeholder="댓글을 입력하세요." required />
              <div><span>{commentText.length} / 100</span><button className="board-primary" type="submit" disabled={commentSaving || !commentText.trim()}>{commentSaving ? '등록 중…' : '댓글 등록'}</button></div>
            </form>
            <div className="comment-list">
              {comments.length ? comments.map((comment) => <article className="comment-item" key={comment.id}>
                <header><div><strong>{comment.author_name}</strong>{comment.author_id === user.id && <span className="mine-badge">내 댓글</span>}</div><time>{formatDate(comment.created_at)}{comment.updated_at !== comment.created_at && ' · 수정됨'}</time></header>
                {editingCommentId === comment.id ? <div className="comment-editor">
                  <textarea value={editingCommentText} onChange={(event) => setEditingCommentText(event.target.value)} maxLength={100} rows={3} />
                  <div><span>{editingCommentText.length} / 100</span><button className="board-secondary" type="button" onClick={() => { setEditingCommentId(null); setEditingCommentText('') }}>취소</button><button className="board-primary" type="button" disabled={commentSaving || !editingCommentText.trim()} onClick={() => void updateComment(comment.id)}>저장</button></div>
                </div> : <p>{comment.content}</p>}
                {comment.author_id === user.id && editingCommentId !== comment.id && <footer><button type="button" onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.content) }}>수정</button><button type="button" className="comment-delete" disabled={commentSaving} onClick={() => void deleteComment(comment.id)}>삭제</button></footer>}
              </article>) : <p className="empty-comments">첫 댓글을 작성해보세요.</p>}
            </div>
          </section>
          {showDelete && <form className="delete-confirm" onSubmit={deletePost}><div><strong>게시글을 삭제할까요?</strong><p>삭제한 게시글은 복구할 수 없습니다.</p></div><input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} minLength={4} required placeholder="게시글 비밀번호" /><button type="button" className="board-secondary" onClick={() => { setShowDelete(false); setDeletePassword('') }}>취소</button><button className="danger-button" type="submit" disabled={saving}>{saving ? '삭제 중…' : '삭제'}</button></form>}
        </>}
      </section>
    </main>
  )
}
