-- 2026-07-08_instructor_trgm_search_fn.sql
--
-- RPC wrapper around the pg_trgm similarity() function so the app's
-- supabase-py client (PostgREST) can call it — PostgREST doesn't expose
-- similarity() as an inline filter/select expression, so a SQL function
-- callable via .rpc() is the standard way to use it from the client.
--
-- Backs EntityResolver's DB-side fallback for professor-name fuzzy matching,
-- using the idx_instructors_name_trgm GIN index added by
-- 2026-07-02_recommended_indexes_views.sql.

CREATE OR REPLACE FUNCTION search_instructors_trgm(query text)
RETURNS TABLE(name text, sim real) AS $$
  SELECT name, similarity(name, query) AS sim
  FROM instructors
  WHERE similarity(name, query) > 0.3
  ORDER BY sim DESC
  LIMIT 3;
$$ LANGUAGE sql STABLE;
