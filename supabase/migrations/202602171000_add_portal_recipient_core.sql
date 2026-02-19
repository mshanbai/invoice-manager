-- 受け取り側ポータル（取引先側）コア機能
-- - 会社プロフィール
-- - 招待リンク
-- - 会社情報修正依頼
-- - 未読/既読
-- - ポータル側承認ステータス
-- - 履歴イベント

create table if not exists public.portal_company_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  display_name text not null,
  postal_code text null,
  address text null,
  phone text null,
  fax text null,
  email text null,
  source text not null default 'invited' check (source in ('invited', 'self_registered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portal_company_profiles_owner_user_id
  on public.portal_company_profiles(owner_user_id);

create table if not exists public.portal_profile_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.portal_company_profiles(id) on delete cascade,
  portal_company_id uuid not null references public.portal_companies(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(profile_id, portal_company_id)
);

create index if not exists idx_portal_profile_links_profile_id
  on public.portal_profile_links(profile_id);

create index if not exists idx_portal_profile_links_company_id
  on public.portal_profile_links(portal_company_id);

create table if not exists public.portal_company_change_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.portal_company_profiles(id) on delete cascade,
  requested_by_user_id text not null,
  payload jsonb not null,
  note text null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_portal_company_change_requests_profile
  on public.portal_company_change_requests(profile_id, created_at desc);

create table if not exists public.portal_invoice_views (
  id uuid primary key default gen_random_uuid(),
  portal_invoice_id uuid not null references public.portal_invoices(id) on delete cascade,
  viewer_user_id text not null,
  first_viewed_at timestamptz not null default now(),
  unique(portal_invoice_id, viewer_user_id)
);

create index if not exists idx_portal_invoice_views_invoice_id
  on public.portal_invoice_views(portal_invoice_id);

create table if not exists public.portal_invoice_status (
  portal_invoice_id uuid primary key references public.portal_invoices(id) on delete cascade,
  state text not null default 'unconfirmed' check (state in ('unconfirmed', 'approved', 'rejected')),
  rejected_reason text null,
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_invoice_events (
  id uuid primary key default gen_random_uuid(),
  portal_invoice_id uuid not null references public.portal_invoices(id) on delete cascade,
  actor_user_id text null,
  type text not null check (type in ('sent', 'viewed', 'approved', 'rejected')),
  payload jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_portal_invoice_events_invoice_created
  on public.portal_invoice_events(portal_invoice_id, created_at desc);

create or replace function public.touch_portal_company_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_portal_company_profiles_updated_at on public.portal_company_profiles;
create trigger trg_touch_portal_company_profiles_updated_at
before update on public.portal_company_profiles
for each row execute procedure public.touch_portal_company_profiles_updated_at();

create or replace function public.touch_portal_invoice_status_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_portal_invoice_status_updated_at on public.portal_invoice_status;
create trigger trg_touch_portal_invoice_status_updated_at
before update on public.portal_invoice_status
for each row execute procedure public.touch_portal_invoice_status_updated_at();

select pg_notify('pgrst', 'reload schema');
