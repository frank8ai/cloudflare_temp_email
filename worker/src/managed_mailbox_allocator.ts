import type { Context } from 'hono';

import { filterManagedPrefixes } from './mailbox_domain_policy.ts';

const LABEL_REGEX = /^[a-z0-9]{6}$/;
const DOMAIN_LABEL_REGEX = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const DEFAULT_DOMAIN_DEPTH_MODE = 'managed_v4';
const DEFAULT_MAX_ALLOCATION_ATTEMPTS = 48;
const MANAGED_LABEL_CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789';

type ResolveManagedOperationalDomainsInput = {
    rootDomains: string[],
    domainLabels: string[],
    extraLabelsByRootDomain?: Record<string, string[]>,
};

type ManagedDomainParts = {
    prefix: string,
    rootDomain: string,
    baseDomain: string,
};

const normalizeValue = (value: string): string => value.trim().toLowerCase();

const uniqueStrings = (values: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const normalized = normalizeValue(value);
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
};

const isRepeatedBlockPattern = (value: string, blockLength: number): boolean => {
    if (!value || value.length % blockLength !== 0) {
        return false;
    }
    const block = value.slice(0, blockLength);
    return block.repeat(value.length / blockLength) === value;
};

export const isStrongManagedLabel = (value: string): boolean => {
    const normalized = normalizeValue(value);
    if (!LABEL_REGEX.test(normalized)) {
        return false;
    }
    if (/^\d+$/.test(normalized)) {
        return false;
    }
    if (/^(.)\1+$/.test(normalized)) {
        return false;
    }
    if (isRepeatedBlockPattern(normalized, 2)) {
        return false;
    }
    if (isRepeatedBlockPattern(normalized, 3)) {
        return false;
    }
    return true;
};

export const buildManagedMailboxDomain = (
    uniqueLabel: string,
    managedPrefix: string,
    rootDomain: string,
    extraLabel?: string | null,
): string => {
    const normalizedUniqueLabel = normalizeValue(uniqueLabel);
    const normalizedManagedPrefix = normalizeValue(managedPrefix);
    const normalizedRootDomain = normalizeValue(rootDomain);
    const normalizedExtraLabel = normalizeValue(extraLabel || '');

    if (!normalizedManagedPrefix || !normalizedRootDomain) {
        throw new Error('managed mailbox domain requires prefix and root domain');
    }

    return normalizedExtraLabel
        ? `${normalizedUniqueLabel}.${normalizedExtraLabel}.${normalizedManagedPrefix}.${normalizedRootDomain}`
        : `${normalizedUniqueLabel}.${normalizedManagedPrefix}.${normalizedRootDomain}`;
};

export const resolveManagedOperationalDomains = ({
    rootDomains,
    domainLabels,
    extraLabelsByRootDomain = {},
}: ResolveManagedOperationalDomainsInput): string[] => {
    const normalizedRootDomains = uniqueStrings(rootDomains).filter(
        (domain) => DOMAIN_LABEL_REGEX.test(domain)
    );
    const filteredBaseLabels = filterManagedPrefixes(domainLabels);

    if (normalizedRootDomains.length === 0) {
        return [];
    }

    const resolved: string[] = [];
    for (const rootDomain of normalizedRootDomains) {
        const extraLabels = filterManagedPrefixes(extraLabelsByRootDomain[rootDomain] || []);
        const labels = uniqueStrings([...filteredBaseLabels, ...extraLabels]);
        for (const label of labels) {
            resolved.push(`${label}.${rootDomain}`);
        }
    }

    return uniqueStrings(resolved);
};

const splitManagedOperationalDomain = (value: string): ManagedDomainParts | null => {
    const normalized = normalizeValue(value);
    const [prefix, ...rest] = normalized.split('.');
    const rootDomain = rest.join('.');
    if (!prefix || !rootDomain || !DOMAIN_LABEL_REGEX.test(rootDomain)) {
        return null;
    }
    return {
        prefix,
        rootDomain,
        baseDomain: normalized,
    };
};

export const pickManagedBaseDomains = (
    requestedDomain: string | undefined | null,
    operationalDomains: string[],
): string[] => {
    const normalizedRequestedDomain = normalizeValue(requestedDomain || '');
    const normalizedOperationalDomains = uniqueStrings(operationalDomains);

    if (!normalizedRequestedDomain) {
        return normalizedOperationalDomains;
    }

    if (normalizedOperationalDomains.includes(normalizedRequestedDomain)) {
        return [normalizedRequestedDomain];
    }

    return normalizedOperationalDomains.filter(
        (domain) => domain.endsWith(`.${normalizedRequestedDomain}`)
    );
};

export const shouldAllocateManagedMailboxDomain = ({
    requestedDomain,
    managedBaseDomains,
    enableRandomSubdomain,
}: {
    requestedDomain: string | undefined | null,
    managedBaseDomains: string[],
    enableRandomSubdomain: boolean,
}): boolean => {
    if (enableRandomSubdomain) {
        return false;
    }
    if (!managedBaseDomains.length) {
        return false;
    }
    const normalizedRequestedDomain = normalizeValue(requestedDomain || '');
    if (normalizedRequestedDomain) {
        return false;
    }
    return true;
};

const randomManagedLabel = (): string => {
    let label = '';
    const randomValues = crypto.getRandomValues(new Uint8Array(6));
    for (const randomValue of randomValues) {
        label += MANAGED_LABEL_CHARSET[randomValue % MANAGED_LABEL_CHARSET.length];
    }
    return label;
};

const reserveMailboxDomain = async (
    c: Context<HonoCustomType>,
    {
        mailboxDomain,
        uniqueLabel,
        managedPrefix,
        rootDomain,
        baseDomain,
        sourceMeta,
    }: {
        mailboxDomain: string,
        uniqueLabel: string,
        managedPrefix: string,
        rootDomain: string,
        baseDomain: string,
        sourceMeta: string | undefined | null,
    },
): Promise<boolean> => {
    try {
        const result = await c.env.DB.prepare(
            `INSERT INTO mailbox_domain_allocation (
                mailbox_domain,
                unique_label,
                managed_prefix,
                root_domain,
                base_domain,
                domain_depth_mode,
                reserved_extra_label,
                source_meta
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            mailboxDomain,
            uniqueLabel,
            managedPrefix,
            rootDomain,
            baseDomain,
            DEFAULT_DOMAIN_DEPTH_MODE,
            null,
            sourceMeta || null,
        ).run();
        return !!result.success;
    } catch (error) {
        const message = `${error}`;
        if (message.includes('UNIQUE')) {
            return false;
        }
        throw error;
    }
};

export const allocateManagedMailboxDomain = async (
    c: Context<HonoCustomType>,
    operationalDomains: string[],
    sourceMeta: string | undefined | null,
): Promise<string | null> => {
    const normalizedOperationalDomains = uniqueStrings(operationalDomains);
    if (normalizedOperationalDomains.length === 0) {
        return null;
    }

    for (let attempt = 0; attempt < DEFAULT_MAX_ALLOCATION_ATTEMPTS; attempt++) {
        const baseDomain = normalizedOperationalDomains[Math.floor(Math.random() * normalizedOperationalDomains.length)];
        const parts = splitManagedOperationalDomain(baseDomain);
        if (!parts) {
            continue;
        }

        const uniqueLabel = randomManagedLabel();
        if (!isStrongManagedLabel(uniqueLabel)) {
            continue;
        }

        const mailboxDomain = buildManagedMailboxDomain(
            uniqueLabel,
            parts.prefix,
            parts.rootDomain,
        );

        const reserved = await reserveMailboxDomain(c, {
            mailboxDomain,
            uniqueLabel,
            managedPrefix: parts.prefix,
            rootDomain: parts.rootDomain,
            baseDomain: parts.baseDomain,
            sourceMeta,
        });
        if (reserved) {
            return mailboxDomain;
        }
    }

    return null;
};

export const getManagedAllocatorStats = (
    rootDomains: string[],
    domainLabels: string[],
    extraLabelsByRootDomain: Record<string, string[]> = {},
) => {
    const operationalDomains = resolveManagedOperationalDomains({
        rootDomains,
        domainLabels,
        extraLabelsByRootDomain,
    });
    return {
        operationalDomainCount: operationalDomains.length,
    };
};
