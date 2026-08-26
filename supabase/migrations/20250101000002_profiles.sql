-- Supabase gestisce auth.users da sola: i campi applicativi extra (qui solo
-- is_premium, placeholder per una futura logica di abbonamento non ancora
-- implementata) vivono in una tabella collegata 1:1.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  is_premium boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- Nessuna policy di update per gli utenti: is_premium resta di sola lettura
-- lato client finché non esiste una vera logica di pagamento (che lo
-- modificherà lato server, con la service role key, bypassando RLS).

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
