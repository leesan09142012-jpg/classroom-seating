-- ============================================================
-- Classroom Seating Arrangement App - Supabase Schema
-- ============================================================

-- 1. classroom_layouts
CREATE TABLE IF NOT EXISTS classroom_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '새 교실',
  rows INTEGER NOT NULL DEFAULT 5,
  cols INTEGER NOT NULL DEFAULT 6,
  cells JSONB NOT NULL DEFAULT '[]'::jsonb,
  fixed_zone JSONB NOT NULL DEFAULT '{"teacher": null, "blackboard": null}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. students
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  number INTEGER,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  group_id UUID,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. student_groups
CREATE TABLE IF NOT EXISTS student_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#cccccc',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add foreign key from students.group_id to student_groups.id
ALTER TABLE students
  ADD CONSTRAINT fk_students_group
  FOREIGN KEY (group_id) REFERENCES student_groups(id) ON DELETE SET NULL;

-- 4. seat_history
CREATE TABLE IF NOT EXISTS seat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  layout_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  assignment JSONB NOT NULL DEFAULT '[]'::jsonb,
  adjacency_pairs JSONB NOT NULL DEFAULT '[]'::jsonb,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. app_settings
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  language TEXT NOT NULL DEFAULT 'ko',
  animation_enabled BOOLEAN NOT NULL DEFAULT true,
  sound_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Enable Row Level Security on all tables
-- ============================================================

ALTER TABLE classroom_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies: each teacher can only CRUD their own data
-- ============================================================

-- classroom_layouts
CREATE POLICY "Teachers can select own layouts"
  ON classroom_layouts FOR SELECT
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert own layouts"
  ON classroom_layouts FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update own layouts"
  ON classroom_layouts FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own layouts"
  ON classroom_layouts FOR DELETE
  USING (auth.uid() = teacher_id);

-- students
CREATE POLICY "Teachers can select own students"
  ON students FOR SELECT
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert own students"
  ON students FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update own students"
  ON students FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own students"
  ON students FOR DELETE
  USING (auth.uid() = teacher_id);

-- student_groups
CREATE POLICY "Teachers can select own groups"
  ON student_groups FOR SELECT
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert own groups"
  ON student_groups FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update own groups"
  ON student_groups FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own groups"
  ON student_groups FOR DELETE
  USING (auth.uid() = teacher_id);

-- seat_history
CREATE POLICY "Teachers can select own history"
  ON seat_history FOR SELECT
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert own history"
  ON seat_history FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update own history"
  ON seat_history FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own history"
  ON seat_history FOR DELETE
  USING (auth.uid() = teacher_id);

-- app_settings
CREATE POLICY "Teachers can select own settings"
  ON app_settings FOR SELECT
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert own settings"
  ON app_settings FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update own settings"
  ON app_settings FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own settings"
  ON app_settings FOR DELETE
  USING (auth.uid() = teacher_id);

-- ============================================================
-- Indexes for performance
-- ============================================================

CREATE INDEX idx_classroom_layouts_teacher ON classroom_layouts(teacher_id);
CREATE INDEX idx_students_teacher ON students(teacher_id);
CREATE INDEX idx_students_group ON students(group_id);
CREATE INDEX idx_student_groups_teacher ON student_groups(teacher_id);
CREATE INDEX idx_seat_history_teacher ON seat_history(teacher_id);
CREATE INDEX idx_seat_history_created ON seat_history(teacher_id, created_at DESC);
CREATE INDEX idx_app_settings_teacher ON app_settings(teacher_id);
