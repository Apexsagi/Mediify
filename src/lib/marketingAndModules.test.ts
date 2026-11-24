import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEDIIFY_ECOSYSTEM_MODULES,
  ORGANIZATION_TYPES,
  SOLUTION_VERTICALS,
  findProductModule,
  findSolutionVertical,
  validateNewsletterPayload,
  validatePublicLeadPayload,
} from './marketingAndModules.ts';

test('MEDIIFY ecosystem contains all 10 required modules and keeps MEDIIFY Automate disabled', () => {
  assert.equal(MEDIIFY_ECOSYSTEM_MODULES.length, 10);

  const expectedSlugs = [
    'code',
    'assist',
    'automate',
    'verify',
    'shield',
    'clinical',
    'eligibility',
    'audit',
    'connect',
    'insights',
  ];

  for (const slug of expectedSlugs) {
    const mod = findProductModule(slug);
    assert.ok(mod, `Missing module ${slug}`);
  }

  const automate = findProductModule('automate');
  assert.equal(automate?.status, 'DISABLED_PENDING_VALIDATION');
  assert.match(automate?.summary ?? '', /disabled until independently validated/i);
});

test('Organization types and solution verticals cover all 5 healthcare segments', () => {
  assert.equal(ORGANIZATION_TYPES.length, 5);
  assert.equal(SOLUTION_VERTICALS.length, 5);
  assert.ok(findSolutionVertical('hospitals'));
  assert.ok(findSolutionVertical('ambulatory-surgery-centers'));
  assert.ok(findSolutionVertical('independent-coders'));
});

test('Public lead capture validation accepts valid demo/contact payloads and rejects malformed email', () => {
  const validDemo = validatePublicLeadPayload({
    lead_type: 'demo_request',
    full_name: 'Jordan Patel',
    work_email: 'jordan@regionalhealth.org',
    organization_name: 'Regional Health Partners',
    organization_type: 'hospital',
    monthly_encounters: '10,000 - 50,000',
    ehr_system: 'Epic',
  });
  assert.equal(validDemo.success, true);

  const invalid = validatePublicLeadPayload({
    lead_type: 'contact_inquiry',
    full_name: 'A',
    work_email: 'not-an-email',
  });
  assert.equal(invalid.success, false);
});

test('Newsletter payload validation validates work emails cleanly', () => {
  assert.equal(validateNewsletterPayload({ email: 'rcm@clinic.org' }).success, true);
  assert.equal(validateNewsletterPayload({ email: 'bad' }).success, false);
});
