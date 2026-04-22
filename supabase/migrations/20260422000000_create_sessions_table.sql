CREATE TABLE IF NOT EXISTS public.session (
  sid VARCHAR NOT NULL COLLATE "default",
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

ALTER TABLE public.session ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IF NOT EXISTS IDX_session_expire ON public.session (expire);

CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM public.session WHERE expire < NOW();
END;
$$ LANGUAGE plpgsql;
