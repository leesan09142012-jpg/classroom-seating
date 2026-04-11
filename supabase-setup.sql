-- ========================================
-- 교실 자리배치 앱 - Supabase 테이블 생성
-- SQL Editor에 붙여넣고 실행하세요
-- ========================================

-- 1. 교실 레이아웃
create table classroom_layouts (
  id uuid default gen_random_uuid() primary key,
  teacher_id uuid references auth.users(id) on delete cascade not null,
  rows int not null,
  cols int not null,
  grid jsonb not null,
  updated_at timestamptz default now()
);

alter table classroom_layouts enable row level security;
create policy "본인 데이터만 조회" on classroom_layouts for select using (auth.uid() = teacher_id);
create policy "본인 데이터만 추가" on classroom_layouts for insert with check (auth.uid() = teacher_id);
create policy "본인 데이터만 수정" on classroom_layouts for update using (auth.uid() = teacher_id);
create policy "본인 데이터만 삭제" on classroom_layouts for delete using (auth.uid() = teacher_id);

-- 2. 학생 목록
create table students (
  id uuid default gen_random_uuid() primary key,
  teacher_id uuid references auth.users(id) on delete cascade not null,
  students jsonb default '[]'::jsonb,
  groups jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

alter table students enable row level security;
create policy "본인 데이터만 조회" on students for select using (auth.uid() = teacher_id);
create policy "본인 데이터만 추가" on students for insert with check (auth.uid() = teacher_id);
create policy "본인 데이터만 수정" on students for update using (auth.uid() = teacher_id);
create policy "본인 데이터만 삭제" on students for delete using (auth.uid() = teacher_id);

-- 3. 자리 배치 히스토리
create table seat_history (
  id uuid default gen_random_uuid() primary key,
  teacher_id uuid references auth.users(id) on delete cascade not null,
  date timestamptz not null,
  assignment jsonb not null,
  adjacency_pairs jsonb default '[]'::jsonb,
  layout jsonb
);

alter table seat_history enable row level security;
create policy "본인 데이터만 조회" on seat_history for select using (auth.uid() = teacher_id);
create policy "본인 데이터만 추가" on seat_history for insert with check (auth.uid() = teacher_id);
create policy "본인 데이터만 삭제" on seat_history for delete using (auth.uid() = teacher_id);

-- 4. 앱 설정
create table app_settings (
  id uuid default gen_random_uuid() primary key,
  teacher_id uuid references auth.users(id) on delete cascade not null,
  settings jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table app_settings enable row level security;
create policy "본인 데이터만 조회" on app_settings for select using (auth.uid() = teacher_id);
create policy "본인 데이터만 추가" on app_settings for insert with check (auth.uid() = teacher_id);
create policy "본인 데이터만 수정" on app_settings for update using (auth.uid() = teacher_id);
create policy "본인 데이터만 삭제" on app_settings for delete using (auth.uid() = teacher_id);
