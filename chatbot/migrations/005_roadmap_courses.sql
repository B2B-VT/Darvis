-- Roadmap courses: VT registrar's official semester-by-semester "checksheet"
-- plan of study per major (registrar.vt.edu/graduation-multi-brief/checksheets.html),
-- scraped by scripts/scrape_checksheets.py. Distinct from major_requirements
-- (which lists WHAT's required, not WHEN to take it) -- catalog.vt.edu's own
-- "Plan of Study Grid" loses year granularity when scraped (year-header rows
-- get overwritten by the following semester-header row before any course is
-- tagged with it), so this is a separate table sourced from a cleaner
-- upstream document rather than reusing major_requirements.
--
-- major_name is plain text, not a foreign key to majors.id -- the registrar's
-- major/option naming doesn't reliably match catalog.vt.edu's major names
-- (different source, different naming conventions), so a hard FK would risk
-- silent join failures. Matched by schedule_builder.py at query time instead.

CREATE TABLE IF NOT EXISTS roadmap_courses (
  id            BIGSERIAL PRIMARY KEY,
  major_name    TEXT        NOT NULL,
  catalog_year  TEXT        NOT NULL,
  year_number   SMALLINT    NOT NULL CHECK (year_number BETWEEN 1 AND 5),
  semester      TEXT        NOT NULL CHECK (semester IN ('Fall', 'Spring')),
  course_code   TEXT,                 -- e.g. "CHEM 1035" -- NULL for elective/Pathways placeholder slots
  course_title  TEXT,
  credits       SMALLINT,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roadmap_courses_major
  ON roadmap_courses (major_name, year_number, semester, sort_order);

CREATE INDEX IF NOT EXISTS idx_roadmap_courses_code
  ON roadmap_courses (course_code)
  WHERE course_code IS NOT NULL;

ALTER TABLE roadmap_courses ENABLE ROW LEVEL SECURITY;

-- Read-only reference data -- public read, writes only via the scraper's
-- service-role key (which bypasses RLS entirely, so no INSERT/UPDATE/DELETE
-- policy is needed for normal app users).
CREATE POLICY "Roadmap courses public read" ON roadmap_courses
  FOR SELECT USING (true);
