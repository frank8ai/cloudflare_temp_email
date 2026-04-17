import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CURATED_MANAGED_PREFIXES,
    BLOCKED_MANAGED_PREFIXES,
    filterManagedPrefixes,
} from '../src/mailbox_domain_policy.ts';
import {
    pickManagedBaseDomains,
    buildManagedMailboxDomain,
    isStrongManagedLabel,
    resolveManagedOperationalDomains,
    shouldAllocateManagedMailboxDomain,
} from '../src/managed_mailbox_allocator.ts';

test('curated managed prefix source stays non-empty', () => {
    assert.ok(CURATED_MANAGED_PREFIXES.length >= 100);
    assert.ok(CURATED_MANAGED_PREFIXES.includes('alpha'));
    assert.ok(CURATED_MANAGED_PREFIXES.includes('docs'));
});

test('blocked managed prefixes include obvious infrastructure labels', () => {
    assert.ok(BLOCKED_MANAGED_PREFIXES.has('mx'));
    assert.ok(BLOCKED_MANAGED_PREFIXES.has('smtp'));
    assert.ok(BLOCKED_MANAGED_PREFIXES.has('proxy'));
});

test('filterManagedPrefixes keeps curated labels and drops blocked labels', () => {
    const filtered = filterManagedPrefixes([
        'alpha',
        'docs',
        'mx',
        'proxy',
        'TEMP',
        'support',
        'alpha',
    ]);

    assert.deepEqual(filtered, ['alpha', 'docs', 'support']);
});

test('isStrongManagedLabel rejects weak labels and allows mixed labels', () => {
    assert.equal(isStrongManagedLabel('123456'), false);
    assert.equal(isStrongManagedLabel('aaaaaa'), false);
    assert.equal(isStrongManagedLabel('ababab'), false);
    assert.equal(isStrongManagedLabel('121212'), false);
    assert.equal(isStrongManagedLabel('abcabc'), false);
    assert.equal(isStrongManagedLabel('a1b2c3'), true);
    assert.equal(isStrongManagedLabel('m7q2x8'), true);
});

test('buildManagedMailboxDomain formats four-level mailbox domains', () => {
    assert.equal(
        buildManagedMailboxDomain('a1b2c3', 'alpha', 'tokenflowpay.com'),
        'a1b2c3.alpha.tokenflowpay.com',
    );
});

test('resolveManagedOperationalDomains keeps only curated operational domains', () => {
    const operational = resolveManagedOperationalDomains({
        rootDomains: ['tokenflowpay.com', 'yzw.io'],
        domainLabels: ['alpha', 'docs', 'proxy', 'support'],
        extraLabelsByRootDomain: {
            'tokenflowpay.com': ['status', 'smtp'],
            'yzw.io': ['brand'],
        },
    });

    assert.deepEqual(operational, [
        'alpha.tokenflowpay.com',
        'docs.tokenflowpay.com',
        'support.tokenflowpay.com',
        'status.tokenflowpay.com',
        'alpha.yzw.io',
        'docs.yzw.io',
        'support.yzw.io',
        'brand.yzw.io',
    ]);
});

test('resolveManagedOperationalDomains supports root-specific extra labels without global labels', () => {
    const operational = resolveManagedOperationalDomains({
        rootDomains: ['yzw.io'],
        domainLabels: [],
        extraLabelsByRootDomain: {
            'yzw.io': ['brand', 'smtp'],
        },
    });

    assert.deepEqual(operational, ['brand.yzw.io']);
});

test('pickManagedBaseDomains resolves exact and root-domain requests', () => {
    const operationalDomains = [
        'alpha.tokenflowpay.com',
        'docs.tokenflowpay.com',
        'brand.yzw.io',
    ];

    assert.deepEqual(
        pickManagedBaseDomains('alpha.tokenflowpay.com', operationalDomains),
        ['alpha.tokenflowpay.com'],
    );
    assert.deepEqual(
        pickManagedBaseDomains('tokenflowpay.com', operationalDomains),
        ['alpha.tokenflowpay.com', 'docs.tokenflowpay.com'],
    );
    assert.deepEqual(
        pickManagedBaseDomains('', operationalDomains),
        operationalDomains,
    );
});

test('explicit domain requests bypass managed unique allocation', () => {
    assert.equal(
        shouldAllocateManagedMailboxDomain({
            requestedDomain: 'status.bitpowerhub.com',
            managedBaseDomains: ['status.bitpowerhub.com'],
            enableRandomSubdomain: false,
        }),
        false,
    );
    assert.equal(
        shouldAllocateManagedMailboxDomain({
            requestedDomain: '',
            managedBaseDomains: ['status.bitpowerhub.com'],
            enableRandomSubdomain: false,
        }),
        true,
    );
});
