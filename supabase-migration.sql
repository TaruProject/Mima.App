-- ========================================
-- Migración Segura - Corregida
-- Para Supabase
-- ========================================

-- 1. Crear tablas solo si no existen
CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id UUID PRIMARY KEY,
    onboarding_done BOOLEAN DEFAULT false,
    voice_id TEXT DEFAULT 'DODLEQrClDo8wCz460ld',
    language TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    mode TEXT DEFAULT 'Neutral',
    audio_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas de forma segura
DO $$
BEGIN
    -- user_preferences
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view own preferences' AND tablename = 'user_preferences') THEN
        CREATE POLICY "Users view own preferences" ON public.user_preferences FOR SELECT USING (TRUE);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users update own preferences' AND tablename = 'user_preferences') THEN
        CREATE POLICY "Users update own preferences" ON public.user_preferences FOR UPDATE USING (TRUE);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users insert own preferences' AND tablename = 'user_preferences') THEN
        CREATE POLICY "Users insert own preferences" ON public.user_preferences FOR INSERT WITH CHECK (TRUE);
    END IF;

    -- chat_messages
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view own messages' AND tablename = 'chat_messages') THEN
        CREATE POLICY "Users view own messages" ON public.chat_messages FOR SELECT USING (TRUE);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users insert own messages' AND tablename = 'chat_messages') THEN
        CREATE POLICY "Users insert own messages" ON public.chat_messages FOR INSERT WITH CHECK (TRUE);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users update own messages' AND tablename = 'chat_messages') THEN
        CREATE POLICY "Users update own messages" ON public.chat_messages FOR UPDATE USING (TRUE);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users delete own messages' AND tablename = 'chat_messages') THEN
        CREATE POLICY "Users delete own messages" ON public.chat_messages FOR DELETE USING (TRUE);
    END IF;
END $$;

-- 4. Crear índices (Protegidos)
-- Solo se crean si la columna existe para evitar el error 42703
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_preferences' AND column_name='user_id') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'idx_user_preferences_user_id') THEN
            CREATE INDEX idx_user_preferences_user_id ON public.user_preferences(user_id);
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='user_id') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'idx_chat_messages_user_id') THEN
            CREATE INDEX idx_chat_messages_user_id ON public.chat_messages(user_id);
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'idx_chat_messages_created_at') THEN
            CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(user_id, created_at DESC);
        END IF;
    END IF;
END $$;

-- 5. Función y Triggers
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

-- ========================================
-- Migración completada
-- ========================================
