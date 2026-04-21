import { test, expect } from '@playwright/test';
import { TEST_DOMAIN, WORKER_URL, WORKER_URL_ENV_OFF, WORKER_URL_SUBDOMAIN } from '../../fixtures/test-helpers';

const SUBDOMAIN = `team.${TEST_DOMAIN}`;
const NESTED_SUBDOMAIN = `deep.team.${TEST_DOMAIN}`;
const MIXED_CASE_SUBDOMAIN = `TeAm.${TEST_DOMAIN.toUpperCase()}`;
const INVALID_LOOKALIKE_DOMAIN = `bad${TEST_DOMAIN}`;
const INVALID_EMPTY_PREFIX_DOMAIN = `.${TEST_DOMAIN}`;
const INVALID_EMPTY_LABEL_DOMAIN = `a..b.${TEST_DOMAIN}`;
const INVALID_OVERLONG_DOMAIN = `${'a.'.repeat(119)}${TEST_DOMAIN}`;
const CREATE_ADDRESS_WORKER_URL = WORKER_URL_SUBDOMAIN || WORKER_URL;
const RANDOM_SUBDOMAIN_DOMAIN = TEST_DOMAIN;
let originalCreateAddressStoredEnabled: boolean | undefined;
let originalEnvOffStoredEnabled: boolean | undefined;
let originalCreateRandomSubdomainDomains: string[] | undefined;

async function getAccountSettings(request: any, workerUrl: string) {
  const res = await request.get(`${workerUrl}/admin/account_settings`);
  expect(res.ok()).toBe(true);
  return await res.json();
}

function buildAccountSettingsPayload(
  current: any,
  addressCreationSettings?: { enableSubdomainMatch?: boolean | null },
  randomSubdomainSettings?: string[] | null,
  overrides: Record<string, unknown> = {}
) {
  return {
    blockList: current.blockList || [],
    sendBlockList: current.sendBlockList || [],
    verifiedAddressList: current.verifiedAddressList || [],
    fromBlockList: current.fromBlockList || [],
    noLimitSendAddressList: current.noLimitSendAddressList || [],
    emailRuleSettings: current.emailRuleSettings || {},
    ...(typeof addressCreationSettings !== 'undefined'
      ? { addressCreationSettings }
      : {}),
    ...(typeof randomSubdomainSettings !== 'undefined'
      ? { randomSubdomainSettings }
      : {}),
    ...overrides,
  };
}

async function saveSubdomainMatchSetting(
  request: any,
  workerUrl: string,
  enableSubdomainMatch: boolean | null
) {
  const current = await getAccountSettings(request, workerUrl);
  const res = await request.post(`${workerUrl}/admin/account_settings`, {
    data: buildAccountSettingsPayload(current, {
      enableSubdomainMatch,
    }),
  });
  expect(res.ok()).toBe(true);
}

async function saveRandomSubdomainSettings(
  request: any,
  workerUrl: string,
  domains: string[] | null
) {
  const current = await getAccountSettings(request, workerUrl);
  const res = await request.post(`${workerUrl}/admin/account_settings`, {
    data: buildAccountSettingsPayload(current, undefined, domains),
  });
  expect(res.ok()).toBe(true);
}

async function restoreSubdomainMatchSetting(
  request: any,
  workerUrl: string,
  originalValue: boolean | undefined
) {
  if (typeof originalValue === 'boolean') {
    await saveSubdomainMatchSetting(request, workerUrl, originalValue);
    return;
  }
  await saveSubdomainMatchSetting(request, workerUrl, null);
}

async function restoreRandomSubdomainSettings(
  request: any,
  workerUrl: string,
  originalValue: string[] | undefined
) {
  if (Array.isArray(originalValue)) {
    await saveRandomSubdomainSettings(request, workerUrl, originalValue);
    return;
  }
  await saveRandomSubdomainSettings(request, workerUrl, null);
}

test.describe('Create Address Subdomain Match', () => {
  test.beforeAll(async ({ request }) => {
    const createAddressSettings = await getAccountSettings(request, CREATE_ADDRESS_WORKER_URL);
    originalCreateAddressStoredEnabled = createAddressSettings.addressCreationSubdomainMatchStatus?.storedEnabled;
    originalCreateRandomSubdomainDomains = createAddressSettings.randomSubdomainStatus?.storedDomains;

    if (WORKER_URL_ENV_OFF) {
      const envOffSettings = await getAccountSettings(request, WORKER_URL_ENV_OFF);
      originalEnvOffStoredEnabled = envOffSettings.addressCreationSubdomainMatchStatus?.storedEnabled;
    }
  });

  test.afterEach(async ({ request }) => {
    await restoreSubdomainMatchSetting(request, CREATE_ADDRESS_WORKER_URL, originalCreateAddressStoredEnabled);
    await restoreRandomSubdomainSettings(request, CREATE_ADDRESS_WORKER_URL, originalCreateRandomSubdomainDomains);
    if (WORKER_URL_ENV_OFF) {
      await restoreSubdomainMatchSetting(request, WORKER_URL_ENV_OFF, originalEnvOffStoredEnabled);
    }
  });

  test('admin can clear override and return to env fallback', async ({ request }) => {
    await saveSubdomainMatchSetting(request, CREATE_ADDRESS_WORKER_URL, true);
    await saveSubdomainMatchSetting(request, CREATE_ADDRESS_WORKER_URL, null);

    const settings = await getAccountSettings(request, CREATE_ADDRESS_WORKER_URL);
    expect(settings.addressCreationSubdomainMatchStatus?.storedEnabled).toBeUndefined();

    const res = await request.post(`${CREATE_ADDRESS_WORKER_URL}/admin/new_address`, {
      data: { name: `subenvfb${Date.now()}`, domain: SUBDOMAIN },
    });

    expect(res.ok()).toBe(false);
    expect(await res.text()).toContain('Invalid domain');
  });

  test('invalid addressCreationSettings payload does not partially persist earlier settings', async ({ request }) => {
    const current = await getAccountSettings(request, CREATE_ADDRESS_WORKER_URL);
    const uniqueBlockedKeyword = `should-not-persist-${Date.now()}`;

    const res = await request.post(`${CREATE_ADDRESS_WORKER_URL}/admin/account_settings`, {
      data: buildAccountSettingsPayload(
        current,
        { enableSubdomainMatch: 'invalid-value' as any },
        {
          blockList: [...(current.blockList || []), uniqueBlockedKeyword],
        }
      ),
    });

    expect(res.status()).toBe(400);

    const after = await getAccountSettings(request, CREATE_ADDRESS_WORKER_URL);
    expect(after.blockList || []).toEqual(current.blockList || []);
    expect(after.addressCreationSubdomainMatchStatus?.storedEnabled).toBe(
      current.addressCreationSubdomainMatchStatus?.storedEnabled
    );
  });

  test('persisted false still keeps exact match only', async ({ request }) => {
    await saveSubdomainMatchSetting(request, CREATE_ADDRESS_WORKER_URL, false);

    const uniqueName = `subdomain-default-${Date.now()}`;
    const res = await request.post(`${CREATE_ADDRESS_WORKER_URL}/admin/new_address`, {
      data: { name: uniqueName, domain: SUBDOMAIN },
    });

    expect(res.ok()).toBe(false);
    expect(await res.text()).toContain('Invalid domain');
  });

  test('admin switch enables suffix subdomain match for both admin and user create APIs', async ({ request }) => {
    await saveSubdomainMatchSetting(request, CREATE_ADDRESS_WORKER_URL, true);

    const adminName = `subdomain-admin-${Date.now()}`;
    const adminRes = await request.post(`${CREATE_ADDRESS_WORKER_URL}/admin/new_address`, {
      data: { name: adminName, domain: SUBDOMAIN },
    });
    expect(adminRes.ok()).toBe(true);
    const adminBody = await adminRes.json();
    expect(adminBody.address).toContain(`@${SUBDOMAIN}`);
    expect(adminBody.address_id).toBeGreaterThan(0);

    const userName = `subdomain-user-${Date.now()}`;
    const userRes = await request.post(`${CREATE_ADDRESS_WORKER_URL}/api/new_address`, {
      data: { name: userName, domain: NESTED_SUBDOMAIN },
    });
    expect(userRes.ok()).toBe(true);
    const userBody = await userRes.json();
    expect(userBody.address).toContain(`@${NESTED_SUBDOMAIN}`);
    expect(userBody.address_id).toBeGreaterThan(0);

    const mixedCaseRes = await request.post(`${CREATE_ADDRESS_WORKER_URL}/admin/new_address`, {
      data: { name: `subcase${Date.now()}`, domain: MIXED_CASE_SUBDOMAIN },
    });
    expect(mixedCaseRes.ok()).toBe(true);
    const mixedCaseBody = await mixedCaseRes.json();
    expect(mixedCaseBody.address).toContain(`@${SUBDOMAIN}`);

    const invalidRes = await request.post(`${CREATE_ADDRESS_WORKER_URL}/admin/new_address`, {
      data: { name: `subinvalid${Date.now()}`, domain: INVALID_LOOKALIKE_DOMAIN },
    });
    expect(invalidRes.ok()).toBe(false);
    expect(await invalidRes.text()).toContain('Invalid domain');

    const invalidEmptyPrefixRes = await request.post(`${CREATE_ADDRESS_WORKER_URL}/admin/new_address`, {
      data: { name: `subempty${Date.now()}`, domain: INVALID_EMPTY_PREFIX_DOMAIN },
    });
    expect(invalidEmptyPrefixRes.ok()).toBe(false);
    expect(await invalidEmptyPrefixRes.text()).toContain('Invalid domain');

    const invalidEmptyLabelRes = await request.post(`${CREATE_ADDRESS_WORKER_URL}/admin/new_address`, {
      data: { name: `sublabel${Date.now()}`, domain: INVALID_EMPTY_LABEL_DOMAIN },
    });
    expect(invalidEmptyLabelRes.ok()).toBe(false);
    expect(await invalidEmptyLabelRes.text()).toContain('Invalid domain');

    const invalidOverlongRes = await request.post(`${CREATE_ADDRESS_WORKER_URL}/admin/new_address`, {
      data: { name: `sublong${Date.now()}`, domain: INVALID_OVERLONG_DOMAIN },
    });
    expect(invalidOverlongRes.ok()).toBe(false);
    expect(await invalidOverlongRes.text()).toContain('Invalid domain');
  });

  test('env false works as hard kill switch even if admin setting is enabled', async ({ request }) => {
    test.skip(!WORKER_URL_ENV_OFF, 'WORKER_URL_ENV_OFF is not configured');

    await saveSubdomainMatchSetting(request, WORKER_URL_ENV_OFF, true);

    const res = await request.post(`${WORKER_URL_ENV_OFF}/admin/new_address`, {
      data: { name: `subdomain-env-off-${Date.now()}`, domain: SUBDOMAIN },
    });
    expect(res.ok()).toBe(false);
    expect(await res.text()).toContain('Invalid domain');
  });

  test('admin random subdomain settings can enable creation and clear back to env fallback', async ({ request }) => {
    await saveRandomSubdomainSettings(request, CREATE_ADDRESS_WORKER_URL, [RANDOM_SUBDOMAIN_DOMAIN]);

    const enabledRes = await request.post(`${CREATE_ADDRESS_WORKER_URL}/admin/new_address`, {
      data: {
        name: `random-sub-${Date.now()}`,
        domain: RANDOM_SUBDOMAIN_DOMAIN,
        enableRandomSubdomain: true,
      },
    });
    expect(enabledRes.ok()).toBe(true);
    const enabledBody = await enabledRes.json();
    expect(enabledBody.address).toMatch(new RegExp(`@[^.]+\\.${TEST_DOMAIN.replace(/\./g, '\\.')}$`));

    await saveRandomSubdomainSettings(request, CREATE_ADDRESS_WORKER_URL, null);

    const afterClearRes = await request.post(`${CREATE_ADDRESS_WORKER_URL}/admin/new_address`, {
      data: {
        name: `random-sub-clear-${Date.now()}`,
        domain: RANDOM_SUBDOMAIN_DOMAIN,
        enableRandomSubdomain: true,
      },
    });
    expect(afterClearRes.ok()).toBe(false);
    expect(await afterClearRes.text()).toContain('Random subdomain is not enabled for this domain');
  });

  test('invalid random subdomain settings payload does not partially persist', async ({ request }) => {
    const current = await getAccountSettings(request, CREATE_ADDRESS_WORKER_URL);
    const uniqueBlockedKeyword = `random-should-not-persist-${Date.now()}`;

    const res = await request.post(`${CREATE_ADDRESS_WORKER_URL}/admin/account_settings`, {
      data: buildAccountSettingsPayload(
        current,
        undefined,
        ['not-configured.example.com'],
        {
          blockList: [...(current.blockList || []), uniqueBlockedKeyword],
        }
      ),
    });

    expect(res.status()).toBe(400);

    const after = await getAccountSettings(request, CREATE_ADDRESS_WORKER_URL);
    expect(after.blockList || []).toEqual(current.blockList || []);
    expect(after.randomSubdomainStatus?.storedDomains).toEqual(
      current.randomSubdomainStatus?.storedDomains
    );
  });
});
