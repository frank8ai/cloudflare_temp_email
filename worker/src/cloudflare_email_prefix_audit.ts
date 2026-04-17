import { BLOCKED_MANAGED_PREFIXES, filterManagedPrefixes } from './mailbox_domain_policy.ts';

const SIMPLE_PREFIX_REGEX = /^[a-z][a-z0-9-]*$/;

export const extractQuotedPrefixesFromMarkdown = (markdown: string): string[] => {
    const matches = [...markdown.matchAll(/`([^`]+)`/g)];
    return matches
        .map((match) => String(match[1] || '').trim().toLowerCase())
        .filter((value) => SIMPLE_PREFIX_REGEX.test(value));
};

export const buildCuratedPrefixPoolFromMarkdown = (markdown: string): string[] => {
    return filterManagedPrefixes(extractQuotedPrefixesFromMarkdown(markdown));
};

export const identifyBlockedExistingPrefixes = (existingPrefixes: string[]): string[] => {
    return [...new Set(
        existingPrefixes
            .map((value) => value.trim().toLowerCase())
            .filter((value) => BLOCKED_MANAGED_PREFIXES.has(value))
    )].sort();
};

export const buildReconciliationPlan = (
    curatedPrefixes: string[],
    existingPrefixes: string[]
) => {
    const normalizedCurated = [...new Set(curatedPrefixes.map((value) => value.trim().toLowerCase()))];
    const normalizedExisting = [...new Set(existingPrefixes.map((value) => value.trim().toLowerCase()))];

    const removable = identifyBlockedExistingPrefixes(normalizedExisting);
    const missing = normalizedCurated.filter((value) => !normalizedExisting.includes(value));
    const addable = missing.slice(0, removable.length);

    return {
        removablePrefixes: removable,
        missingCuratedPrefixes: missing,
        addablePrefixes: addable,
    };
};
