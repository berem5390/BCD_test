alter table public.posts
add column view_count integer not null default 0 check (view_count >= 0);

create table public.post_views (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name varchar(50) not null check (char_length(trim(author_name)) between 1 and 50),
  content varchar(100) not null check (char_length(trim(content)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index post_views_user_id_idx on public.post_views (user_id);
create index post_comments_post_created_idx on public.post_comments (post_id, created_at);
create index post_comments_author_id_idx on public.post_comments (author_id);

create trigger post_comments_set_updated_at
before update on public.post_comments
for each row execute function public.set_updated_at();

alter table public.post_views enable row level security;
alter table public.post_comments enable row level security;

create policy "Users can read comments on visible posts"
on public.post_comments for select to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_id and (not p.is_secret or p.author_id = auth.uid())
  )
);

create policy "Users can update their own comments"
on public.post_comments for update to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

create policy "Users can delete their own comments"
on public.post_comments for delete to authenticated
using (author_id = auth.uid());

create or replace function public.increment_post_view(p_post_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  current_count integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;

  if not exists (
    select 1 from public.posts
    where id = p_post_id and (not is_secret or author_id = auth.uid())
  ) then
    raise exception '게시글을 찾을 수 없거나 조회 권한이 없습니다.' using errcode = '42501';
  end if;

  insert into public.post_views (post_id, user_id)
  values (p_post_id, auth.uid())
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    update public.posts set view_count = view_count + 1 where id = p_post_id;
  end if;

  select view_count into current_count from public.posts where id = p_post_id;
  return current_count;
end;
$$;

create or replace function public.create_comment(p_post_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  current_name text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;
  if char_length(trim(p_content)) not between 1 and 100 then raise exception '댓글은 1자 이상 100자 이하여야 합니다.'; end if;

  if not exists (
    select 1 from public.posts
    where id = p_post_id and (not is_secret or author_id = auth.uid())
  ) then
    raise exception '게시글을 찾을 수 없거나 댓글 작성 권한이 없습니다.' using errcode = '42501';
  end if;

  select display_name into current_name from public.profiles where id = auth.uid();
  if current_name is null then raise exception '사용자 프로필을 찾을 수 없습니다.'; end if;

  insert into public.post_comments (post_id, author_id, author_name, content)
  values (p_post_id, auth.uid(), current_name, trim(p_content))
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on public.post_views, public.post_comments from anon;
revoke all on public.post_views from authenticated;
revoke all on public.post_comments from authenticated;
grant select, delete, update (content) on public.post_comments to authenticated;

grant select (view_count) on public.posts to authenticated;

revoke all on function public.increment_post_view(uuid) from public, anon;
revoke all on function public.create_comment(uuid, text) from public, anon;
grant execute on function public.increment_post_view(uuid) to authenticated;
grant execute on function public.create_comment(uuid, text) to authenticated;
