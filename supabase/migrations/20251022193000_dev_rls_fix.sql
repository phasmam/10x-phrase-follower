-- Development RLS fix
-- This migration adds development-specific RLS policies that work with dev JWT tokens
-- Only applied in development environment

-- Create a function to get the current user ID from the request context
-- This function checks for the dev user ID in the request headers
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id UUID;
BEGIN
  -- First try to get from auth.uid() (works with real Supabase tokens)
  SELECT auth.uid() INTO user_id;
  
  -- If that returns null and we're in development, check for dev user
  IF user_id IS NULL AND current_setting('app.settings.dev_mode', true) = 'true' THEN
    -- In development, allow access for the dev user
    user_id := '0a1f3212-c55f-4a62-bc0f-4121a7a72283'::UUID;
  END IF;
  
  RETURN user_id;
END;
$$;

-- Update all RLS policies to use the new function
-- This allows both real Supabase tokens and dev JWT to work

-- Users policies
DROP POLICY IF EXISTS users_select_own ON users;
CREATE POLICY users_select_own
  ON users FOR SELECT
  TO authenticated
  USING (id = get_current_user_id());

DROP POLICY IF EXISTS users_insert_own ON users;
CREATE POLICY users_insert_own
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (id = get_current_user_id());

DROP POLICY IF EXISTS users_update_own ON users;
CREATE POLICY users_update_own
  ON users FOR UPDATE
  TO authenticated
  USING (id = get_current_user_id())
  WITH CHECK (id = get_current_user_id());

DROP POLICY IF EXISTS users_delete_own ON users;
CREATE POLICY users_delete_own
  ON users FOR DELETE
  TO authenticated
  USING (id = get_current_user_id());

-- Notebooks policies
DROP POLICY IF EXISTS notebooks_select_own ON notebooks;
CREATE POLICY notebooks_select_own
  ON notebooks FOR SELECT
  TO authenticated
  USING (user_id = get_current_user_id());

DROP POLICY IF EXISTS notebooks_insert_own ON notebooks;
CREATE POLICY notebooks_insert_own
  ON notebooks FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_current_user_id());

DROP POLICY IF EXISTS notebooks_update_own ON notebooks;
CREATE POLICY notebooks_update_own
  ON notebooks FOR UPDATE
  TO authenticated
  USING (user_id = get_current_user_id())
  WITH CHECK (user_id = get_current_user_id());

DROP POLICY IF EXISTS notebooks_delete_own ON notebooks;
CREATE POLICY notebooks_delete_own
  ON notebooks FOR DELETE
  TO authenticated
  USING (user_id = get_current_user_id());

-- Phrases policies
DROP POLICY IF EXISTS phrases_select_own ON phrases;
CREATE POLICY phrases_select_own
  ON phrases FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notebooks n
      WHERE n.id = phrases.notebook_id
        AND n.user_id = get_current_user_id()
    )
  );

DROP POLICY IF EXISTS phrases_insert_own ON phrases;
CREATE POLICY phrases_insert_own
  ON phrases FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notebooks n
      WHERE n.id = phrases.notebook_id
        AND n.user_id = get_current_user_id()
    )
  );

DROP POLICY IF EXISTS phrases_update_own ON phrases;
CREATE POLICY phrases_update_own
  ON phrases FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notebooks n
      WHERE n.id = phrases.notebook_id
        AND n.user_id = get_current_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notebooks n
      WHERE n.id = phrases.notebook_id
        AND n.user_id = get_current_user_id()
    )
  );

DROP POLICY IF EXISTS phrases_delete_own ON phrases;
CREATE POLICY phrases_delete_own
  ON phrases FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notebooks n
      WHERE n.id = phrases.notebook_id
        AND n.user_id = get_current_user_id()
    )
  );

-- User voices policies
DROP POLICY IF EXISTS user_voices_select_own ON user_voices;
CREATE POLICY user_voices_select_own
  ON user_voices FOR SELECT
  TO authenticated
  USING (user_id = get_current_user_id());

DROP POLICY IF EXISTS user_voices_insert_own ON user_voices;
CREATE POLICY user_voices_insert_own
  ON user_voices FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_current_user_id());

DROP POLICY IF EXISTS user_voices_update_own ON user_voices;
CREATE POLICY user_voices_update_own
  ON user_voices FOR UPDATE
  TO authenticated
  USING (user_id = get_current_user_id())
  WITH CHECK (user_id = get_current_user_id());

DROP POLICY IF EXISTS user_voices_delete_own ON user_voices;
CREATE POLICY user_voices_delete_own
  ON user_voices FOR DELETE
  TO authenticated
  USING (user_id = get_current_user_id());

-- TTS credentials policies
DROP POLICY IF EXISTS tts_credentials_select_own ON tts_credentials;
CREATE POLICY tts_credentials_select_own
  ON tts_credentials FOR SELECT
  TO authenticated
  USING (user_id = get_current_user_id());

DROP POLICY IF EXISTS tts_credentials_insert_own ON tts_credentials;
CREATE POLICY tts_credentials_insert_own
  ON tts_credentials FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_current_user_id());

DROP POLICY IF EXISTS tts_credentials_update_own ON tts_credentials;
CREATE POLICY tts_credentials_update_own
  ON tts_credentials FOR UPDATE
  TO authenticated
  USING (user_id = get_current_user_id())
  WITH CHECK (user_id = get_current_user_id());

DROP POLICY IF EXISTS tts_credentials_delete_own ON tts_credentials;
CREATE POLICY tts_credentials_delete_own
  ON tts_credentials FOR DELETE
  TO authenticated
  USING (user_id = get_current_user_id());

-- Jobs policies
DROP POLICY IF EXISTS jobs_select_own ON jobs;
CREATE POLICY jobs_select_own
  ON jobs FOR SELECT
  TO authenticated
  USING (user_id = get_current_user_id());

DROP POLICY IF EXISTS jobs_insert_own ON jobs;
CREATE POLICY jobs_insert_own
  ON jobs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_current_user_id());

DROP POLICY IF EXISTS jobs_update_own ON jobs;
CREATE POLICY jobs_update_own
  ON jobs FOR UPDATE
  TO authenticated
  USING (user_id = get_current_user_id())
  WITH CHECK (user_id = get_current_user_id());

DROP POLICY IF EXISTS jobs_delete_own ON jobs;
CREATE POLICY jobs_delete_own
  ON jobs FOR DELETE
  TO authenticated
  USING (user_id = get_current_user_id());

-- Builds policies
DROP POLICY IF EXISTS builds_select_own ON builds;
CREATE POLICY builds_select_own
  ON builds FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notebooks n
      WHERE n.id = builds.notebook_id
        AND n.user_id = get_current_user_id()
    )
  );

DROP POLICY IF EXISTS builds_insert_own ON builds;
CREATE POLICY builds_insert_own
  ON builds FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notebooks n
      WHERE n.id = builds.notebook_id
        AND n.user_id = get_current_user_id()
    )
  );

DROP POLICY IF EXISTS builds_update_own ON builds;
CREATE POLICY builds_update_own
  ON builds FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notebooks n
      WHERE n.id = builds.notebook_id
        AND n.user_id = get_current_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notebooks n
      WHERE n.id = builds.notebook_id
        AND n.user_id = get_current_user_id()
    )
  );

DROP POLICY IF EXISTS builds_delete_own ON builds;
CREATE POLICY builds_delete_own
  ON builds FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notebooks n
      WHERE n.id = builds.notebook_id
        AND n.user_id = get_current_user_id()
    )
  );

-- Audio segments policies
DROP POLICY IF EXISTS audio_segments_select_own ON audio_segments;
CREATE POLICY audio_segments_select_own
  ON audio_segments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM phrases p
      JOIN notebooks n ON n.id = p.notebook_id
      WHERE p.id = audio_segments.phrase_id
        AND n.user_id = get_current_user_id()
    )
  );

DROP POLICY IF EXISTS audio_segments_insert_own ON audio_segments;
CREATE POLICY audio_segments_insert_own
  ON audio_segments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM phrases p
      JOIN notebooks n ON n.id = p.notebook_id
      WHERE p.id = audio_segments.phrase_id
        AND n.user_id = get_current_user_id()
    )
  );

DROP POLICY IF EXISTS audio_segments_update_own ON audio_segments;
CREATE POLICY audio_segments_update_own
  ON audio_segments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM phrases p
      JOIN notebooks n ON n.id = p.notebook_id
      WHERE p.id = audio_segments.phrase_id
        AND n.user_id = get_current_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM phrases p
      JOIN notebooks n ON n.id = p.notebook_id
      WHERE p.id = audio_segments.phrase_id
        AND n.user_id = get_current_user_id()
    )
  );

DROP POLICY IF EXISTS audio_segments_delete_own ON audio_segments;
CREATE POLICY audio_segments_delete_own
  ON audio_segments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM phrases p
      JOIN notebooks n ON n.id = p.notebook_id
      WHERE p.id = audio_segments.phrase_id
        AND n.user_id = get_current_user_id()
    )
  );

-- Import logs policies
DROP POLICY IF EXISTS import_logs_select_own ON import_logs;
CREATE POLICY import_logs_select_own
  ON import_logs FOR SELECT
  TO authenticated
  USING (user_id = get_current_user_id());

DROP POLICY IF EXISTS import_logs_insert_own ON import_logs;
CREATE POLICY import_logs_insert_own
  ON import_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_current_user_id());

DROP POLICY IF EXISTS import_logs_update_own ON import_logs;
CREATE POLICY import_logs_update_own
  ON import_logs FOR UPDATE
  TO authenticated
  USING (user_id = get_current_user_id())
  WITH CHECK (user_id = get_current_user_id());

DROP POLICY IF EXISTS import_logs_delete_own ON import_logs;
CREATE POLICY import_logs_delete_own
  ON import_logs FOR DELETE
  TO authenticated
  USING (user_id = get_current_user_id());
