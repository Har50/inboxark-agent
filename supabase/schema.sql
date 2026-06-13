create table if not exists posts (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  angle         text, tone text, audience text, platform text,
  text_fb       text, text_li text, text_x text,
  image_url     text, image_prompt text, alt_text text,
  hashtags      text[], seo_keywords text[], internal_tags text[],
  ab_variant    char(1), ab_pair_id uuid,
  scheduled_at  timestamptz,
  status        text default 'generated',
  fb_post_id    text, li_post_id text, x_post_id text
);

create table if not exists metrics (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid references posts(id),
  collected_at timestamptz default now(),
  platform     text,
  reach integer default 0, impressions integer default 0,
  reactions integer default 0, comments integer default 0,
  shares integer default 0, clicks integer default 0
);

create table if not exists strategy_memory (
  id              uuid primary key default gen_random_uuid(),
  updated_at      timestamptz default now(),
  week            text unique,
  top_angles      text[], top_tones text[], top_audiences text[],
  winning_formats jsonb, brand_voice text,
  avoid           text[], opportunities text, raw_summary text
);

create table if not exists intel_reports (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  type          text, subject text, findings text,
  opportunities text, sources text[]
);

create table if not exists logs (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  message    text, type text default 'info'
);

create table if not exists business_metrics (
  id          uuid primary key default gen_random_uuid(),
  recorded_at timestamptz default now(),
  signups integer default 0, trials integer default 0,
  conversions integer default 0,
  source text default 'webhook', notes text
);
