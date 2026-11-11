import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyManifest } from './verify-training-manifest.mjs';

const valid = () => ({
  schemaVersion: 1,
  datasets: [{
    id: 'sample', source: 'owner-controlled', license: 'owner-authored',
    licenseEvidence: 'documented permission', approvedBy: 'owner',
    approvedAt: '2026-11-10', sha256: 'a'.repeat(64),
    allowedForTraining: true, containsPersonalData: false
  }]
});

test('accepts a complete provenance record', () => {
  assert.deepEqual(verifyManifest(valid()), []);
});
test('rejects missing rights approval', () => {
  const value = valid();
  delete value.datasets[0].licenseEvidence;
  value.datasets[0].allowedForTraining = false;
  assert.ok(verifyManifest(value).length >= 2);
});
test('rejects malformed hashes and unreviewed personal data', () => {
  const value = valid();
  value.datasets[0].sha256 = 'not-a-hash';
  value.datasets[0].containsPersonalData = true;
  assert.ok(verifyManifest(value).length >= 2);
});
test('rejects duplicate dataset identifiers', () => {
  const value = valid();
  value.datasets.push({ ...value.datasets[0] });
  assert.ok(verifyManifest(value).some(x => x.includes('duplicated')));
});
test('rejects empty or malformed manifests', () => {
  assert.ok(verifyManifest({schemaVersion: 1, datasets: []}).length);
  assert.ok(verifyManifest(null).length);
});
