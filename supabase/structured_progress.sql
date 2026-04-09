create table if not exists public.review_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null,
  subject text,
  topic text,
  score numeric not null default 0,
  answered_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.review_attempts (
  id uuid primary key default gen_random_uuid(),
  review_session_id uuid not null references public.review_sessions (id) on delete cascade,
  item_key text not null,
  subject text,
  topic text,
  difficulty text,
  selected_answer text,
  correct_answer text,
  is_correct boolean,
  response_time_ms integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.card_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_key text not null,
  subject text,
  topic text,
  rating text not null,
  response_time_ms integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.planner_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  subject text,
  mode text,
  due_date date,
  notes text,
  completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  event_type text,
  subject text,
  note text,
  event_date date not null,
  completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.recommendation_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recommended_subject text,
  recommended_topic text,
  recommendation_type text,
  focus_score numeric,
  reason text,
  created_at timestamptz not null default timezone('utc', now())
);
