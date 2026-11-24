import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function collectSourceFiles(dir: string): string[] {
  const fullDir = path.join(ROOT, dir);
  if (!fs.existsSync(fullDir)) return [];
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(rel));
    } else if (/\.(ts|tsx|html)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      files.push(rel);
    }
  }
  return files;
}

test('V2 production codebase contains zero sandbox endpoints, autostart hooks, or SQLite dependencies', () => {
  const files = [...collectSourceFiles('src'), ...collectSourceFiles('server'), 'server.ts', 'index.html'];

  for (const relPath of files) {
    const content = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.equal(
      content.includes('/auth/demo-sandbox'),
      false,
      `${relPath} must not contain /auth/demo-sandbox`,
    );
    assert.equal(
      content.includes('autostart'),
      false,
      `${relPath} must not contain autostart sandbox bypass`,
    );
    assert.equal(
      content.includes('node:sqlite'),
      false,
      `${relPath} must not depend on node:sqlite`,
    );
    assert.equal(
      content.includes('verificationHint'),
      false,
      `${relPath} must not leak live TOTP verificationHint`,
    );
  }
});

test('Supabase migrations enforce multi-tenant RLS, V2 session tables, and safe archive-first synthetic cleanup', () => {
  const schema001 = fs.readFileSync(path.join(ROOT, 'supabase/migrations/001_mediify_schema.sql'), 'utf8');
  const schema002 = fs.readFileSync(path.join(ROOT, 'supabase/migrations/002_v2_production_upgrade.sql'), 'utf8');
  const cleanup003 = fs.readFileSync(path.join(ROOT, 'supabase/migrations/003_cleanup_synthetic_data.sql'), 'utf8');

  assert.ok(schema001.includes('ENABLE ROW LEVEL SECURITY'));
  assert.ok(schema002.includes('app.current_organization_id'));
  assert.ok(schema002.includes('ENABLE ROW LEVEL SECURITY'));

  assert.ok(schema002.includes('user_sessions'));
  assert.ok(schema002.includes('ai_processing_jobs'));
  assert.ok(schema002.includes('reference_dataset_imports'));
  assert.ok(schema002.includes('coding_annotations'));
  assert.ok(schema002.includes('draft_notes'));
  assert.ok(schema002.includes('coding_recommendation_versions'));
  assert.ok(schema002.includes('notifications'));
  assert.ok(schema002.includes('medical-records'));

  assert.ok(cleanup003.includes('_backup_synthetic_organizations'));
  assert.ok(cleanup003.includes('_backup_synthetic_encounters'));
  assert.ok(cleanup003.includes('SET synthetic_mode = FALSE'));
});

test('local SQLite database directory and server/db.ts are completely removed', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'data/mediify.db')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'server/db.ts')), false);
});
