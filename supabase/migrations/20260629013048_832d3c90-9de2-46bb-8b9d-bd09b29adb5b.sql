ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reminder_times JSONB NOT NULL DEFAULT '{"breakfast":"08:00","lunch":"12:30","dinner":"18:30","snack":"15:30"}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_briefing_date DATE;