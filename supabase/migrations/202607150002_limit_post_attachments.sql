create or replace function public.enforce_post_attachment_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.post_attachments where post_id = new.post_id) >= 3 then
    raise exception '첨부파일은 게시글당 최대 3개까지 가능합니다.';
  end if;
  return new;
end;
$$;

create trigger post_attachments_limit
before insert on public.post_attachments
for each row execute function public.enforce_post_attachment_limit();
