-- Optional developer-review context for Cyrus thumbs up/down feedback.
ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS reason text;

CREATE INDEX IF NOT EXISTS idx_feedback_reason_present
  ON feedback (created_at DESC)
  WHERE reason IS NOT NULL AND length(trim(reason)) > 0;
