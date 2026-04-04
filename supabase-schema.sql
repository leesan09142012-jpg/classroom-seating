-- =============================================
-- 교실 자리배치 앱 - Supabase 테이블 스키마
-- =============================================
-- Supabase 프로젝트의 SQL Editor에서 실행하세요.

-- 1. 교실 레이아웃
create table if not exists classroom_layouts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id) on delete cascade not null,
  rows int not null default 6,
  cols int not null default 7,
  grid jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table classroom_layouts enable row level security;
create policy "Teachers can manage own layouts"
  on classroom_layouts for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- 2. 학생 목록
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id) on delete cascade not null,
  students jsonb not null default '[]'::jsonb,
  groups jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table students enable row level security;
create policy "Teachers can manage own students"
  on students for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- 3. 배치 기록
create table if not exists seat_history (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id) on delete cascade not null,
  date timestamptz not null default now(),
  assignment jsonb not null default '{}'::jsonb,
  adjacency_pairs jsonb default '[]'::jsonb,
  layout jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table seat_history enable row level security;
create policy "Teachers can manage own history"
  on seat_history for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- 4. 앱 설정
create table if not exists app_settings (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id) on delete cascade not null unique,
  sound_enabled boolean default true,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table app_settings enable row level security;
create policy "Teachers can manage own settings"
  on app_settings for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- 인덱스
create index if not exists idx_layouts_teacher on classroom_layouts(teacher_id);
create index if not exists idx_students_teacher on students(teacher_id);
create index if not exists idx_history_teacher_date on seat_history(teacher_id, date desc);
create index if not exists idx_settings_teacher on app_settings(teacher_id);
