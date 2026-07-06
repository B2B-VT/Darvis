-- Echo reviews: Darvis-native professor/course reviews.
-- user_id stores the Clerk user ID string. Supabase verifies the Clerk JWT and
-- exposes the sub claim as auth.uid().

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
