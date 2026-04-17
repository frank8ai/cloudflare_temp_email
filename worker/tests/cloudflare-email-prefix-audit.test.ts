import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildCuratedPrefixPoolFromMarkdown,
    buildReconciliationPlan,
    extractQuotedPrefixesFromMarkdown,
    identifyBlockedExistingPrefixes,
} from '../src/cloudflare_email_prefix_audit.ts';

test('extractQuotedPrefixesFromMarkdown keeps only simple quoted prefixes', () => {
    const markdown = [
        '- `alpha`',
        '- `docs`',
        '- `100`',
        '- `mx / pop / smtp`',
        '- `brand`',
    ].join('\n');

    assert.deepEqual(
        extractQuotedPrefixesFromMarkdown(markdown),
        ['alpha', 'docs', 'brand'],
    );
});

test('buildCuratedPrefixPoolFromMarkdown applies managed-prefix policy filtering', () => {
    const markdown = [
        '- `alpha`',
        '- `docs`',
        '- `proxy`',
        '- `smtp`',
        '- `support`',
    ].join('\n');

    assert.deepEqual(
        buildCuratedPrefixPoolFromMarkdown(markdown),
        ['alpha', 'docs', 'support'],
    );
});

test('identifyBlockedExistingPrefixes returns only blocked prefixes', () => {
    assert.deepEqual(
        identifyBlockedExistingPrefixes(['alpha', 'smtp', 'proxy', 'docs', 'smtp']),
        ['proxy', 'smtp'],
    );
});

test('buildReconciliationPlan matches removable slots to missing curated prefixes', () => {
    const plan = buildReconciliationPlan(
        ['alpha', 'docs', 'support', 'studio', 'brand'],
        ['alpha', 'docs', 'smtp', 'proxy'],
    );

    assert.deepEqual(plan.removablePrefixes, ['proxy', 'smtp']);
    assert.deepEqual(plan.missingCuratedPrefixes, ['support', 'studio', 'brand']);
    assert.deepEqual(plan.addablePrefixes, ['support', 'studio']);
});
