const normalizePrefix = (value: string): string => value.trim().toLowerCase();

export const CURATED_MANAGED_PREFIXES = [
    'alpha', 'beta', 'studio', 'media', 'files', 'assets', 'content', 'gallery', 'press', 'journal',
    'digest', 'updates', 'news', 'brand', 'design', 'story', 'works', 'showcase', 'insight', 'report',
    'signal', 'status', 'guide', 'docs', 'help', 'support', 'care', 'contact', 'success', 'center',
    'hub', 'portal', 'home', 'entry', 'index', 'start', 'platform', 'console', 'panel', 'control',
    'manage', 'office', 'desk', 'suite', 'workspace', 'team', 'group', 'club', 'circle', 'community',
    'network', 'profile', 'people', 'client', 'customer', 'billing', 'orders', 'plans', 'plus', 'market',
    'store', 'shop', 'cart', 'checkout', 'wallet', 'capital', 'project', 'build', 'launch', 'flow',
    'sync', 'pulse', 'scope', 'radar', 'view', 'focus', 'labs', 'forge', 'craft', 'spark',
    'pixel', 'frame', 'motion', 'vector', 'daily', 'weekly', 'review', 'brief', 'inside', 'insider',
    'today', 'prime', 'select', 'origin', 'horizon', 'vision', 'north', 'south', 'east', 'west',
    'main', 'central', 'urban', 'modern',
].map(normalizePrefix);

const CURATED_MANAGED_PREFIX_SET = new Set(CURATED_MANAGED_PREFIXES);

export const BLOCKED_MANAGED_PREFIXES = new Set([
    'mx', 'pop', 'smtp', 'imap', 'inbox', 'webmail', 'mailbox', 'postmaster', 'mailer', 'mailhub',
    'relay', 'receive', 'send', 'outbound', 'inbound',
    'cdn', 'proxy', 'edge', 'gateway', 'node', 'mesh', 'fabric', 'cluster', 'router', 'switch',
    'cache', 'img', 'staticfiles', 'storage', 'bucket', 'upload', 'download', 'fileserver', 'worker', 'jobs',
    'tmp', 'temp', 'tempmail', 'disposable', 'burner', 'anon', 'anonymous', 'free', 'demo', 'trial',
    'throwaway', 'quickmail', 'fastmail', 'instantmail',
    'account', 'accounts', 'user', 'users', 'member', 'members', 'register', 'signup', 'signin',
    'auth', 'auth2', 'verify', 'token', 'session', 'securemail',
].map(normalizePrefix));

export const isCuratedManagedPrefix = (value: string): boolean => {
    const normalized = normalizePrefix(value);
    return normalized.length > 0 && CURATED_MANAGED_PREFIX_SET.has(normalized);
};

export const isBlockedManagedPrefix = (value: string): boolean => {
    const normalized = normalizePrefix(value);
    return normalized.length > 0 && BLOCKED_MANAGED_PREFIXES.has(normalized);
};

export const filterManagedPrefixes = (values: string[]): string[] => {
    const seen = new Set<string>();
    const filtered: string[] = [];

    for (const rawValue of values) {
        const normalized = normalizePrefix(rawValue);
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);

        if (!isCuratedManagedPrefix(normalized)) {
            continue;
        }
        if (isBlockedManagedPrefix(normalized)) {
            continue;
        }

        filtered.push(normalized);
    }

    return filtered;
};

export const getManagedPrefixPolicySnapshot = () => ({
    curated: [...CURATED_MANAGED_PREFIXES],
    blocked: [...BLOCKED_MANAGED_PREFIXES],
});
