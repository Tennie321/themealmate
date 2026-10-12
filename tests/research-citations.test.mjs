import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditResearchCitations, safeSource } from '../src/lib/research-types.ts';

const sources = [
  { id: 1, title: 'First', url: 'https://example.com/one', snippet: 'First excerpt' },
  { id: 2, title: 'Second', url: 'https://example.com/two', snippet: 'Second excerpt' },
];

test('retains valid citations and normalizes grouped citations', () => {
  const result = auditResearchCitations('Claim [1, 2]; another [1].', sources);
  assert.equal(result.answer, 'Claim [1] [2]; another [1].');
  assert.deepEqual(result.audit.citedSourceIds, [1, 2]);
  assert.deepEqual(result.audit.unsupportedSourceIds, []);
  assert.equal(result.audit.status, 'linked');
});

test('marks invented citation numbers unavailable without hiding valid references', () => {
  const result = auditResearchCitations('Claim [1, 9] and [22].', sources);
  assert.equal(result.answer, 'Claim [1] [source unavailable] and [source unavailable].');
  assert.deepEqual(result.audit.citedSourceIds, [1]);
  assert.deepEqual(result.audit.unsupportedSourceIds, [9, 22]);
  assert.equal(result.audit.status, 'partial');
});

test('answers without citations remain explicitly unlinked', () => {
  const result = auditResearchCitations('Unsupported assertion.', sources);
  assert.equal(result.audit.status, 'unlinked');
  assert.deepEqual(result.audit.citedSourceIds, []);
});

test('rejects non-web URLs and credential-bearing source links', () => {
  assert.equal(safeSource({ url: 'javascript:alert(1)' }, 0), null);
  assert.equal(safeSource({ url: 'https://user:pass@example.com/' }, 0), null);
  assert.equal(safeSource({ url: 'file:///etc/passwd' }, 0), null);
  assert.equal(safeSource({ url: 'https://example.com/valid' }, 0)?.id, 1);
});
