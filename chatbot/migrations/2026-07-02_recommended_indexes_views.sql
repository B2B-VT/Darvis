-- 2026-07-02_recommended_indexes_views.sql
--
-- RECOMMENDED (not auto-applied) Supabase improvements for the chatbot's
-- query patterns. Everything here is additive and non-breaking: new indexes,
-- generated columns, and materialized views. No existing column is renamed,
-- dropped, or retyped, so all import scripts and app code keep working.
--
-- Apply in the Supabase SQL editor (or via MCP apply_migration) when ready.
-- The chatbot serves everything from in-memory startup indexes today, so none
-- of this is required for correctness — it speeds up the live-fallback query
-- paths and gives dashboards/SQL consumers the same enrollment-weighted
-- aggregates the chatbot computes.

-- ── 1. Normalized keys (generated columns — zero maintenance) ────────────────

ALTER TABLE grades
  ADD COLUMN IF NOT EXISTS course_code TEXT
  GENERATED ALWAYS AS (upper(subject) || '-' || course_number) STORED;

ALTER TABLE sections
  ADD COLUMN IF NOT EXISTS course_code TEXT
  GENERATED ALWAYS AS (upper(subject) || '-' || course_number) STORED;

ALTER TABLE sections
  ADD COLUMN IF NOT EXISTS open_seats INTEGER
  GENERATED ALWAYS AS (GREATEST(seats - enrolled, 0)) STORED;

-- ── 2. Indexes for the chatbot's live-fallback queries ──────────────────────

CREATE INDEX IF NOT EXISTS idx_grades_course_code   ON grades (course_code);
CREATE INDEX IF NOT EXISTS idx_sections_course_code ON sections (course_code);
CREATE INDEX IF NOT EXISTS idx_sections_term_subj   ON sections (term, subject);
CREATE INDEX IF NOT EXISTS idx_sections_open_seats  ON sections (term, open_seats);
CREATE INDEX IF NOT EXISTS idx_instructors_name_lower ON instructors (lower(name));

-- Trigram index for fuzzy instructor search in SQL (mirrors the in-app fuzzy
-- matcher). Requires the pg_trgm extension (available on Supabase).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_instructors_name_trgm
  ON instructors USING GIN (name gin_trgm_ops);

-- ── 3. Materialized views — enrollment-weighted aggregates ──────────────────
-- Refresh after each grade import:
--   REFRESH MATERIALIZED VIEW course_stats;
--   REFRESH MATERIALIZED VIEW course_instructor_stats;

CREATE MATERIALIZED VIEW IF NOT EXISTS course_stats AS
SELECT
  upper(subject) || '-' || course_number            AS course_code,
  upper(subject)                                    AS subject,
  course_number,
  max(course_title)                                 AS title,
  round(sum(gpa * graded_enrollment)::numeric
        / NULLIF(sum(graded_enrollment), 0), 3)     AS weighted_avg_gpa,
  sum(graded_enrollment)                            AS total_enrollment,
  count(DISTINCT (academic_year, term))             AS terms_count,
  count(DISTINCT instructor)                        AS instructors_count,
  round(sum((coalesce(a_pct,0) + coalesce(a_minus_pct,0)) * graded_enrollment)::numeric
        / NULLIF(sum(graded_enrollment), 0), 2)     AS weighted_a_rate,
  round(sum(coalesce(f_pct,0) * graded_enrollment)::numeric
        / NULLIF(sum(graded_enrollment), 0), 2)     AS weighted_f_rate,
  sum(coalesce(withdraws, 0))                       AS total_withdraws
FROM grades
WHERE graded_enrollment > 0
GROUP BY upper(subject), course_number;

CREATE UNIQUE INDEX IF NOT EXISTS idx_course_stats_code ON course_stats (course_code);

CREATE MATERIALIZED VIEW IF NOT EXISTS course_instructor_stats AS
SELECT
  upper(subject) || '-' || course_number            AS course_code,
  instructor,
  round(sum(gpa * graded_enrollment)::numeric
        / NULLIF(sum(graded_enrollment), 0), 3)     AS weighted_avg_gpa,
  sum(graded_enrollment)                            AS total_enrollment,
  count(DISTINCT (academic_year, term))             AS terms_taught,
  round(sum((coalesce(a_pct,0) + coalesce(a_minus_pct,0)) * graded_enrollment)::numeric
        / NULLIF(sum(graded_enrollment), 0), 2)     AS weighted_a_rate,
  round(sum(coalesce(f_pct,0) * graded_enrollment)::numeric
        / NULLIF(sum(graded_enrollment), 0), 2)     AS weighted_f_rate,
  sum(coalesce(withdraws, 0))                       AS total_withdraws,
  round(100.0 * sum(coalesce(withdraws, 0))::numeric
        / NULLIF(sum(graded_enrollment), 0), 2)     AS withdraw_rate_pct
FROM grades
WHERE graded_enrollment > 0
  AND instructor IS NOT NULL
  AND upper(instructor) NOT IN ('STAFF', 'TBA')
GROUP BY upper(subject), course_number, instructor;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cis_code_inst
  ON course_instructor_stats (course_code, instructor);

-- ── 4. sections_enriched — one-stop view for schedule/section queries ────────
-- Regular view (not materialized): sections update every 4h via CI, and this
-- joins cheaply on the indexes above.

CREATE OR REPLACE VIEW sections_enriched AS
SELECT
  s.crn, s.term, s.course_code, s.subject, s.course_number,
  c.title, s.credits, s.instructor, s.days, s.start_time, s.end_time,
  s.location, s.seats, s.enrolled, s.open_seats,
  i.rmp_rating, i.rmp_difficulty, i.rmp_count,
  cs.weighted_avg_gpa   AS historical_course_gpa,
  cis.weighted_avg_gpa  AS historical_course_instructor_gpa
FROM sections s
LEFT JOIN courses c
  ON c.subject = upper(s.subject) AND c.course_number = s.course_number
LEFT JOIN instructors i
  ON lower(i.name) = lower(s.instructor)
LEFT JOIN course_stats cs
  ON cs.course_code = s.course_code
LEFT JOIN course_instructor_stats cis
  ON cis.course_code = s.course_code AND lower(cis.instructor) = lower(s.instructor);

-- ── 5. Future work (documented, NOT included above) ─────────────────────────
-- a) Durable FKs (grades.course_id → courses.id, sections.instructor_id →
--    instructors.id): requires a backfill migration matching on normalized
--    text keys plus import-script changes — do this as its own migration with
--    a dry run, since some instructor names don't match exactly.
-- b) major_requirements.course_id FK to courses: requirement course_codes are
--    free text ("CS 1114 or CS 1124"); needs parsing before linking.
-- c) pgvector for embeddings: Redis currently serves runtime vector search;
--    moving to pgvector would simplify ops but needs a latency comparison first.
