-- "I miei interessi": query SQL diretta su user_preferences, nessun embedding.
-- SECURITY INVOKER (default): la function legge solo tabelle a cui
-- l'utente chiamante ha già accesso via RLS (articles/sources sono
-- pubbliche, user_preferences è filtrata su auth.uid() dalle sue stesse
-- policy). Ritorna righe già in forma jsonb annidata (source + tags) per
-- parità con il feed principale letto via PostgREST embedding.
create or replace function public.get_my_feed(p_cursor timestamptz default null, p_limit int default 20)
returns table (article jsonb)
language sql
stable
as $$
  select (to_jsonb(a) - 'embedding')
    || jsonb_build_object(
         'source', to_jsonb(s),
         'tags', coalesce((
           select jsonb_agg(to_jsonb(t))
           from public.tags t
           join public.article_tag atg on atg.tag_id = t.id
           where atg.article_id = a.id
         ), '[]'::jsonb)
       ) as article
  from public.articles a
  join public.sources s on s.id = a.source_id
  where (p_cursor is null or a.published_at < p_cursor)
    and (
      exists (
        select 1
        from public.user_preferences up
        where up.user_id = auth.uid() and up.source_id = a.source_id
      )
      or exists (
        select 1
        from public.user_preferences up
        join public.article_tag atg2 on atg2.tag_id = up.tag_id
        where up.user_id = auth.uid() and atg2.article_id = a.id
      )
    )
  order by a.published_at desc
  limit p_limit;
$$;

grant execute on function public.get_my_feed(timestamptz, int) to authenticated;
