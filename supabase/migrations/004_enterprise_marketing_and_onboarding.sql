-- MEDIIFY Enterprise Platform Upgrade Migration
-- Adds organization type onboarding profiles, team invitations, marketing demo/contact lead database,
-- and newsletter subscriptions with PostgreSQL Row-Level Security.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS organization_type TEXT NOT NULL DEFAULT 'clinic'
    CHECK (organization_type IN ('hospital', 'clinic', 'asc', 'rcm_company', 'independent_coder'));

CREATE TABLE IF NOT EXISTS team_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'coding_director', 'medical_coder', 'auditor', 'physician', 'rcm_analyst')),
  credentials TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_by_email TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_type TEXT NOT NULL CHECK (lead_type IN ('demo_request', 'contact_inquiry')),
  full_name TEXT NOT NULL,
  work_email TEXT NOT NULL,
  organization_name TEXT NOT NULL DEFAULT '',
  organization_type TEXT NOT NULL DEFAULT 'clinic',
  phone TEXT NOT NULL DEFAULT '',
  monthly_encounters TEXT NOT NULL DEFAULT '',
  ehr_system TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  source_path TEXT NOT NULL DEFAULT '/',
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'QUALIFIED', 'CONTACTED', 'ARCHIVED')),
  notification_dispatched BOOLEAN NOT NULL DEFAULT FALSE,
  notification_status TEXT NOT NULL DEFAULT 'PENDING_CONFIG',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  organization_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'SUBSCRIBED' CHECK (status IN ('SUBSCRIBED', 'UNSUBSCRIBED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation_team_invitations ON team_invitations;
CREATE POLICY org_isolation_team_invitations ON team_invitations
  FOR ALL USING (organization_id = current_mediify_org_id())
  WITH CHECK (organization_id = current_mediify_org_id());

-- Marketing tables are accessed strictly by authenticated server service role or organization admins
DROP POLICY IF EXISTS admin_read_marketing_leads ON marketing_leads;
CREATE POLICY admin_read_marketing_leads ON marketing_leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin', 'coding_director')
    )
  );

DROP POLICY IF EXISTS admin_read_newsletter_subscriptions ON newsletter_subscriptions;
CREATE POLICY admin_read_newsletter_subscriptions ON newsletter_subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin', 'coding_director')
    )
  );

CREATE INDEX IF NOT EXISTS idx_team_invitations_org_status ON team_invitations (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_created ON marketing_leads (created_at DESC, status);
