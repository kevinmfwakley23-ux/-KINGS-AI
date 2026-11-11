#!/usr/bin/env node
// Fail-closed provenance gate for locally supplied training dataset manifests.
// Usage: node development/verify-training-manifest.mjs path/to/manifest.json
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function verifyManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['Manifest must be an object'];
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!Array.isArray(manifest.datasets) || manifest.datasets.length === 0) {
    errors.push('datasets must be a nonempty array');
    return errors;
  }
  const ids = new Set();
  for (const [index, item] of manifest.datasets.entries()) {
    const prefix = `datasets[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    for (const field of ['id', 'source', 'license', 'licenseEvidence', 'approvedBy', 'approvedAt', 'sha256']) {
      if (typeof item[field] !== 'string' || !item[field].trim()) errors.push(`${prefix}.${field} required`);
    }
    if (typeof item.id === 'string') {
      if (ids.has(item.id)) errors.push(`${prefix}.id duplicated`);
      ids.add(item.id);
    }
    if (typeof item.sha256 === 'string' && !/^[a-fA-F0-9]{64}$/.test(item.sha256)) errors.push(`${prefix}.sha256 must be 64 hex characters`);
    if (typeof item.approvedAt === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(item.approvedAt)) errors.push(`${prefix}.approvedAt must be YYYY-MM-DD`);
    if (item.allowedForTraining !== true) errors.push(`${prefix}.allowedForTraining must be true`);
    if (item.containsPersonalData !== false) errors.push(`${prefix}.containsPersonalData must be false (or undergo separate review)`);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try {
    if (process.argv.length !== 3) throw new Error('Provide exactly one JSON manifest path');
    const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const errors = verifyManifest(manifest);
    if (errors.length) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
    } else {
      console.log('Training provenance manifest schema: PASS (metadata only; license authenticity and dataset contents NOT verified)');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
