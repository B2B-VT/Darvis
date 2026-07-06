-- Hokie_Darvis — Supabase (Postgres) schema
-- Paste this into the Supabase SQL Editor and click Run.
-- Safe to re-run — all statements use IF NOT EXISTS / OR REPLACE.

-- ── Raw grade rows from UDC CSVs ──────────────────────────────────────
-- One row per (term, subject, course_number, instructor, crn).
-- Direct import of scraped data — nothing is thrown away.
CREATE TABLE IF NOT EXISTS grades (
  id                 BIGSERIAL PRIMARY KEY,
  academic_year      TEXT,
  term               TEXT,
  subject            TEXT        NOT NULL,
  course_number      TEXT        NOT NULL,
  course_title       TEXT,
  instructor         TEXT,
  gpa                NUMERIC(4,2),
  a_pct              NUMERIC(5,1),
  a_minus_pct        NUMERIC(5,1),
  b_plus_pct         NUMERIC(5,1),
  b_pct              NUMERIC(5,1),
  b_minus_pct        NUMERIC(5,1),
  c_plus_pct         NUMERIC(5,1),
  c_pct              NUMERIC(5,1),
  c_minus_pct        NUMERIC(5,1),
  d_plus_pct         NUMERIC(5,1),
  d_pct              NUMERIC(5,1),
  d_minus_pct        NUMERIC(5,1),
  f_pct              NUMERIC(5,1),
  withdraws          INTEGER,
  graded_enrollment  INTEGER,
  crn                TEXT,
  credits            NUMERIC(3,1),
  -- Prevent exact duplicate rows on reimport
  UNIQUE (term, subject, course_number, instructor, crn)
);

CREATE INDEX IF NOT EXISTS idx_grades_course
  ON grades (subject, course_number);

CREATE INDEX IF NOT EXISTS idx_grades_instructor
  ON grades (instructor);

CREATE INDEX IF NOT EXISTS idx_grades_term
  ON grades (term);

-- ── Canonical course records ──────────────────────────────────────────
-- One row per unique (subject, course_number) pair.
-- avg_gpa and grade distribution are aggregated across all sections.
-- pathways uses a native Postgres text array, e.g. '{"5a","4"}'.
-- Filter with: pathways @> ARRAY['5a']
CREATE TABLE IF NOT EXISTS courses (
  id              TEXT PRIMARY KEY,       -- e.g. "cs-3114"
  subject         TEXT        NOT NULL,
  course_number   TEXT        NOT NULL,
  title           TEXT,
  credits         NUMERIC(3,1),
  description     TEXT,
  prerequisites   TEXT,
  avg_gpa         NUMERIC(4,2),
  pathways        TEXT[]      DEFAULT '{}',
  a_pct           NUMERIC(5,1),
  a_minus_pct     NUMERIC(5,1),
  b_plus_pct      NUMERIC(5,1),
  b_pct           NUMERIC(5,1),
  b_minus_pct     NUMERIC(5,1),
  c_plus_pct      NUMERIC(5,1),
  c_pct           NUMERIC(5,1),
  c_minus_pct     NUMERIC(5,1),
  d_plus_pct      NUMERIC(5,1),
  d_pct           NUMERIC(5,1),
  d_minus_pct     NUMERIC(5,1),
  f_pct           NUMERIC(5,1),
  total_sections  INTEGER     DEFAULT 0,
  UNIQUE (subject, course_number)
);

CREATE INDEX IF NOT EXISTS idx_courses_subject
  ON courses (subject);

-- GIN index enables fast array containment queries (pathways @> ARRAY['5a'])
CREATE INDEX IF NOT EXISTS idx_courses_pathways
  ON courses USING GIN (pathways);

-- ── Professor records (Phase 3 — RMP integration) ─────────────────────
CREATE TABLE IF NOT EXISTS professors (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT        NOT NULL UNIQUE,
  name_normalized  TEXT,             -- lowercase, no middle initials, for fuzzy matching
  dept             TEXT,
  rmp_id           TEXT,
  rmp_rating       NUMERIC(3,1),
  rmp_difficulty   NUMERIC(3,1),
  rmp_count        INTEGER     DEFAULT 0,
  rmp_tags         JSONB       DEFAULT '[]',
  rmp_reviews      JSONB       DEFAULT '[]',
  last_fetched_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_professors_name
  ON professors (name_normalized);

-- ── Section records (Phase 2 — Banner timetable) ──────────────────────
-- One row per (crn, term).
CREATE TABLE IF NOT EXISTS sections (
  id            BIGSERIAL PRIMARY KEY,
  crn           TEXT        NOT NULL,
  subject       TEXT        NOT NULL,
  course_number TEXT        NOT NULL,
  term          TEXT        NOT NULL,
  instructor    TEXT,
  days          TEXT[]      DEFAULT '{}',   -- e.g. '{"M","W","F"}'
  start_time    TEXT,                        -- "09:05"
  end_time      TEXT,                        -- "09:55"
  location      TEXT,
  seats         INTEGER     DEFAULT 0,
  enrolled      INTEGER     DEFAULT 0,
  credits       NUMERIC(3,1),
  last_updated  TIMESTAMPTZ,
  UNIQUE (crn, term)
);

CREATE INDEX IF NOT EXISTS idx_sections_course
  ON sections (subject, course_number, term);

-- ── Row-level security ────────────────────────────────────────────────
-- All four tables are read-only public data.
-- The anon key (used in the frontend) can SELECT but not mutate.
-- The service role key (used in import scripts) bypasses RLS entirely.

ALTER TABLE grades     ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE professors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON grades
  FOR SELECT USING (true);

CREATE POLICY "Public read access" ON courses
  FOR SELECT USING (true);

CREATE POLICY "Public read access" ON professors
  FOR SELECT USING (true);

CREATE POLICY "Public read access" ON sections
  FOR SELECT USING (true);

-- ── Profile posts ──────────────────────────────────────────────────
-- user_id stores the Clerk user ID string (e.g. "user_abc123").
-- Supabase verifies the Clerk JWT and exposes the sub claim as auth.uid().
CREATE TABLE IF NOT EXISTS profile_posts (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT        NOT NULL,
  display_name TEXT,
  headline     TEXT,
  content      TEXT        NOT NULL,
  post_type    TEXT        DEFAULT 'general',
  image_url    TEXT        DEFAULT '',
  link_url     TEXT        DEFAULT '',
  link_title   TEXT        DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_posts_user
  ON profile_posts (user_id, created_at DESC);

ALTER TABLE profile_posts ENABLE ROW LEVEL SECURITY;

-- Anyone can read posts (public activity feed)
CREATE POLICY "Public read" ON profile_posts
  FOR SELECT USING (true);

-- Only the authenticated owner can insert their own posts
CREATE POLICY "Owner insert" ON profile_posts
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Only the authenticated owner can delete their own posts
CREATE POLICY "Owner delete" ON profile_posts
  FOR DELETE USING (auth.uid()::text = user_id);

-- ── Echo reviews ──────────────────────────────────────────────────
-- Darvis-native professor/course reviews. Public reads are limited to
-- published reviews; writes are owner-scoped through Clerk auth.
CREATE TABLE IF NOT EXISTS echo_reviews (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              TEXT        NOT NULL,
  display_name         TEXT        DEFAULT '',
  target_type          TEXT        NOT NULL CHECK (target_type IN ('professor', 'course')),
  professor_name       TEXT,
  course_subject       TEXT,
  course_number        TEXT,
  course_title         TEXT,
  quality_rating       NUMERIC(2,1) NOT NULL CHECK (quality_rating >= 1 AND quality_rating <= 5),
  difficulty_rating    NUMERIC(2,1) NOT NULL CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5),
  would_take_again     BOOLEAN,
  for_credit           BOOLEAN,
  used_textbook        BOOLEAN,
  attendance_mandatory BOOLEAN,
  grade_received       TEXT,
  tags                 JSONB       DEFAULT '[]',
  review_text          TEXT        NOT NULL CHECK (char_length(review_text) BETWEEN 20 AND 700),
  status               TEXT        NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'pending', 'hidden')),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT echo_reviews_professor_or_course CHECK (
    (target_type = 'professor' AND professor_name IS NOT NULL)
    OR
    (target_type = 'course' AND course_subject IS NOT NULL AND course_number IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_echo_reviews_professor
  ON echo_reviews (professor_name, created_at DESC)
  WHERE target_type = 'professor' AND status = 'published';

CREATE INDEX IF NOT EXISTS idx_echo_reviews_course
  ON echo_reviews (course_subject, course_number, created_at DESC)
  WHERE target_type = 'course' AND status = 'published';

CREATE INDEX IF NOT EXISTS idx_echo_reviews_user
  ON echo_reviews (user_id, created_at DESC);

ALTER TABLE echo_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Echo public published read" ON echo_reviews
  FOR SELECT USING (status = 'published');

CREATE POLICY "Echo owner insert" ON echo_reviews
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Echo owner update" ON echo_reviews
  FOR UPDATE USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Echo owner delete" ON echo_reviews
  FOR DELETE USING (auth.uid()::text = user_id);
