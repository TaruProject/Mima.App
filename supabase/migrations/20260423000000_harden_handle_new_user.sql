-- Harden auth.users signup trigger to avoid hard failures in partially migrated environments.
-- This keeps signups resilient while still attempting to provision profiles/preferences.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preferred_language TEXT := LOWER(COALESCE(NEW.raw_user_meta_data->>'language', 'en'));
BEGIN
  IF preferred_language NOT IN ('en', 'es', 'fi', 'sv') THEN
    preferred_language := 'en';
  END IF;

  BEGIN
    IF to_regclass('public.profiles') IS NOT NULL THEN
      INSERT INTO public.profiles (id, language, created_at, updated_at)
      VALUES (NEW.id, preferred_language, NOW(), NOW())
      ON CONFLICT (id)
      DO UPDATE
      SET
        language = EXCLUDED.language,
        updated_at = NOW();
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user profiles upsert failed for user %: %', NEW.id, SQLERRM;
  END;

  BEGIN
    IF to_regclass('public.user_preferences') IS NOT NULL THEN
      INSERT INTO public.user_preferences (user_id, onboarding_done, language, created_at, updated_at)
      VALUES (NEW.id, false, preferred_language, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE
      SET
        language = EXCLUDED.language,
        updated_at = NOW();
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user preferences upsert failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE PROCEDURE public.handle_new_user();
