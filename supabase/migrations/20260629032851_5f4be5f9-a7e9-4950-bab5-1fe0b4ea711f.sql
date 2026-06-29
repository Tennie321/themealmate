
-- Notifications history table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read BOOLEAN NOT NULL DEFAULT false
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own notifications select" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own notifications insert" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own notifications update" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own notifications delete" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX notifications_user_sent_idx ON public.notifications (user_id, sent_at DESC);
CREATE INDEX notifications_user_kind_sent_idx ON public.notifications (user_id, kind, sent_at DESC);

-- Lock down referrals: column-level grants exclude referred_email from SELECT,
-- so referrers cannot read the third-party emails they submitted via the Data API.
REVOKE ALL ON public.referrals FROM authenticated;
GRANT SELECT (id, referrer_id, referred_user_id, status, created_at, converted_at)
  ON public.referrals TO authenticated;
GRANT INSERT (id, referrer_id, referred_user_id, referred_email, status, created_at, converted_at)
  ON public.referrals TO authenticated;
GRANT UPDATE (referred_user_id, status, converted_at) ON public.referrals TO authenticated;
GRANT DELETE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
