-- Create app data tables used by the production backend

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarding_done BOOLEAN NOT NULL DEFAULT false,
  voice_id TEXT NOT NULL DEFAULT 'DODLEQrClDo8wCz460ld',
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'Neutral Mode',
  audio_data TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_google_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tokens TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_google_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users update own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users insert own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users delete own preferences" ON public.user_preferences;

CREATE POLICY "Users view own preferences"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own preferences"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users insert own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users insert own messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users update own messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users delete own messages" ON public.chat_messages;

CREATE POLICY "Users view own messages"
  ON public.chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own messages"
  ON public.chat_messages FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own messages"
  ON public.chat_messages FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own google tokens" ON public.user_google_tokens;
DROP POLICY IF EXISTS "Users upsert own google tokens" ON public.user_google_tokens;

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id
  ON public.user_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id
  ON public.chat_messages(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created_at
  ON public.chat_messages(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_messages_updated_at ON public.chat_messages;
CREATE TRIGGER update_chat_messages_updated_at
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
