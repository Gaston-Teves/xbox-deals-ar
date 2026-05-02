create table if not exists public.catalog_products (
  product_id text primary key,
  title text not null,
  store_url text not null,
  image_url text,
  platform text not null default 'unknown',
  is_game_pass boolean not null default false,
  content_type text not null default 'unknown',
  categories text[] not null default '{}',
  modes text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.deals_current (
  product_id text primary key,
  title text not null,
  store_url text not null,
  image_url text,
  current_price numeric(12, 2) not null,
  original_price numeric(12, 2),
  discount_percent integer,
  currency text not null default 'ARS',
  platform text not null,
  is_game_pass boolean not null default false,
  content_type text not null default 'unknown',
  categories text[] not null default '{}',
  modes text[] not null default '{}',
  first_detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  lowest_price numeric(12, 2),
  lowest_price_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.price_history (
  id bigserial primary key,
  product_id text not null references public.deals_current(product_id) on delete cascade,
  current_price numeric(12, 2) not null,
  original_price numeric(12, 2),
  discount_percent integer,
  detected_at timestamptz not null default now(),
  source text not null default 'refresh',
  created_at timestamptz not null default now()
);

create table if not exists public.alert_events (
  id bigserial primary key,
  product_id text not null references public.deals_current(product_id) on delete cascade,
  alert_type text not null,
  deal_snapshot jsonb not null,
  sent_to text,
  sent_at timestamptz not null default now()
);

create table if not exists public.external_store_matches (
  product_id text not null references public.deals_current(product_id) on delete cascade,
  store text not null,
  external_id text,
  external_type text,
  external_url text,
  matched_title text,
  match_confidence integer not null default 0,
  matched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, store)
);

create table if not exists public.external_prices_current (
  product_id text not null references public.deals_current(product_id) on delete cascade,
  store text not null,
  current_price numeric(12, 2),
  original_price numeric(12, 2),
  discount_percent integer,
  currency text not null,
  external_url text,
  fetched_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,
  primary key (product_id, store)
);

create table if not exists public.external_price_history (
  id bigserial primary key,
  product_id text not null references public.deals_current(product_id) on delete cascade,
  store text not null,
  current_price numeric(12, 2),
  original_price numeric(12, 2),
  discount_percent integer,
  currency text not null,
  fetched_at timestamptz not null default now(),
  source text not null default 'refresh',
  raw jsonb not null default '{}'::jsonb
);

insert into public.catalog_products (
  product_id,
  title,
  store_url,
  image_url,
  platform,
  is_game_pass,
  content_type,
  categories,
  modes,
  first_seen_at,
  last_seen_at,
  raw,
  updated_at
)
select
  product_id,
  title,
  store_url,
  image_url,
  platform,
  is_game_pass,
  content_type,
  categories,
  modes,
  first_detected_at,
  last_seen_at,
  raw,
  updated_at
from public.deals_current
on conflict (product_id) do update set
  title = excluded.title,
  store_url = excluded.store_url,
  image_url = excluded.image_url,
  platform = excluded.platform,
  is_game_pass = public.catalog_products.is_game_pass or excluded.is_game_pass,
  content_type = excluded.content_type,
  categories = excluded.categories,
  modes = excluded.modes,
  last_seen_at = greatest(public.catalog_products.last_seen_at, excluded.last_seen_at),
  raw = excluded.raw,
  updated_at = excluded.updated_at;

create index if not exists deals_current_current_price_idx
  on public.deals_current (current_price);

create index if not exists deals_current_discount_percent_idx
  on public.deals_current (discount_percent);

create index if not exists deals_current_last_seen_at_idx
  on public.deals_current (last_seen_at desc);

create index if not exists price_history_product_detected_idx
  on public.price_history (product_id, detected_at desc);

create index if not exists catalog_products_last_seen_at_idx
  on public.catalog_products (last_seen_at desc);

create index if not exists catalog_products_platform_idx
  on public.catalog_products (platform);

create index if not exists external_prices_current_store_idx
  on public.external_prices_current (store);

create index if not exists external_price_history_product_store_idx
  on public.external_price_history (product_id, store, fetched_at desc);
