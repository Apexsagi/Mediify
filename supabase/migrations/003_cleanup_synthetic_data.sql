-- MEDIIFY V2 Reviewed Synthetic Data Cleanup & Archive Migration
-- Safely archives and removes ONLY identified V1 synthetic sandbox organizations, demo users,
-- and records flagged with is_synthetic = TRUE or synthetic sandbox IDs.
-- Explicitly preserves all legitimate production organizations, user accounts, and authoritative reference datasets.

BEGIN;

-- 1. Create backup archive tables prior to deletion
CREATE TABLE IF NOT EXISTS _backup_synthetic_organizations AS
  SELECT *, NOW() AS archived_at FROM organizations WHERE 1 = 0;

CREATE TABLE IF NOT EXISTS _backup_synthetic_users AS
  SELECT *, NOW() AS archived_at FROM users WHERE 1 = 0;

CREATE TABLE IF NOT EXISTS _backup_synthetic_patients AS
  SELECT *, NOW() AS archived_at FROM patients WHERE 1 = 0;

CREATE TABLE IF NOT EXISTS _backup_synthetic_encounters AS
  SELECT *, NOW() AS archived_at FROM encounters WHERE 1 = 0;

CREATE TABLE IF NOT EXISTS _backup_synthetic_medical_records AS
  SELECT *, NOW() AS archived_at FROM medical_records WHERE 1 = 0;

CREATE TABLE IF NOT EXISTS _backup_synthetic_claims AS
  SELECT *, NOW() AS archived_at FROM claims WHERE 1 = 0;

CREATE TABLE IF NOT EXISTS _backup_synthetic_audit_logs AS
  SELECT *, NOW() AS archived_at FROM audit_logs WHERE 1 = 0;

-- 2. Snapshot identified synthetic organizations & users
INSERT INTO _backup_synthetic_organizations
SELECT *, NOW() AS archived_at
FROM organizations
WHERE name ILIKE '%(Synthetic Sandbox)%'
   OR id::text = 'org-synthetic-sandbox'
   OR (synthetic_mode = TRUE AND tax_id = '00-0000000' AND npi = '1982736450');

INSERT INTO _backup_synthetic_users
SELECT *, NOW() AS archived_at
FROM users
WHERE email LIKE '%@mediify-sandbox.example'
   OR organization_id IN (SELECT id FROM _backup_synthetic_organizations);

INSERT INTO _backup_synthetic_patients
SELECT *, NOW() AS archived_at
FROM patients
WHERE is_synthetic = TRUE
   OR mrn LIKE 'SYN-MRN-%'
   OR organization_id IN (SELECT id FROM _backup_synthetic_organizations);

INSERT INTO _backup_synthetic_encounters
SELECT *, NOW() AS archived_at
FROM encounters
WHERE is_synthetic = TRUE
   OR patient_id IN (SELECT id FROM _backup_synthetic_patients)
   OR organization_id IN (SELECT id FROM _backup_synthetic_organizations);

INSERT INTO _backup_synthetic_medical_records
SELECT *, NOW() AS archived_at
FROM medical_records
WHERE encounter_id IN (SELECT id FROM _backup_synthetic_encounters)
   OR organization_id IN (SELECT id FROM _backup_synthetic_organizations);

INSERT INTO _backup_synthetic_claims
SELECT *, NOW() AS archived_at
FROM claims
WHERE encounter_id IN (SELECT id FROM _backup_synthetic_encounters)
   OR organization_id IN (SELECT id FROM _backup_synthetic_organizations);

INSERT INTO _backup_synthetic_audit_logs
SELECT *, NOW() AS archived_at
FROM audit_logs
WHERE organization_id IN (SELECT id FROM _backup_synthetic_organizations)
   OR action = 'SYNTHETIC_SANDBOX_LOGIN';

-- 3. Selectively delete ONLY archived synthetic records (authoritative reference catalogs remain untouched)
DELETE FROM audit_logs
WHERE id IN (SELECT id FROM _backup_synthetic_audit_logs);

DELETE FROM claims
WHERE id IN (SELECT id FROM _backup_synthetic_claims);

DELETE FROM medical_records
WHERE id IN (SELECT id FROM _backup_synthetic_medical_records);

DELETE FROM encounters
WHERE id IN (SELECT id FROM _backup_synthetic_encounters);

DELETE FROM patients
WHERE id IN (SELECT id FROM _backup_synthetic_patients);

DELETE FROM users
WHERE id IN (SELECT id FROM _backup_synthetic_users);

DELETE FROM organizations
WHERE id IN (SELECT id FROM _backup_synthetic_organizations);

-- 4. Ensure remaining legitimate organizations default synthetic_mode to FALSE unless explicitly verified otherwise
UPDATE organizations
SET synthetic_mode = FALSE
WHERE synthetic_mode = TRUE;

COMMIT;
