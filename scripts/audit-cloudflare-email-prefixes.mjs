import fs from 'node:fs/promises';
import path from 'node:path';

import {
  buildCuratedPrefixPoolFromMarkdown,
  buildReconciliationPlan,
} from '../worker/src/cloudflare_email_prefix_audit.ts';

const API_BASE = 'https://api.cloudflare.com/client/v4';

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const parseArgs = () => {
  const rawArgs = process.argv.slice(2);
  const args = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const key = rawArgs[index];
    const value = rawArgs[index + 1];
    if (!key.startsWith('--')) {
      continue;
    }
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
};

const fetchJson = async (url, token) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(`${url} -> ${JSON.stringify(payload)}`);
  }
  return payload;
};

const listZones = async (token, zoneNames) => {
  const payload = await fetchJson(`${API_BASE}/zones?per_page=200`, token);
  return payload.result.filter((zone) => zoneNames.includes(zone.name));
};

const listDnsRecords = async (token, zoneId) => {
  const payload = await fetchJson(`${API_BASE}/zones/${zoneId}/dns_records?per_page=500`, token);
  return payload.result;
};

const toSecondLevelPrefixes = (records, zoneName) => {
  const suffix = `.${zoneName}`;
  return [...new Set(
    records
      .filter((row) => row.type === 'MX' && row.name.endsWith(suffix))
      .map((row) => row.name.slice(0, -suffix.length))
      .filter((prefix) => !prefix.includes('.'))
      .map((prefix) => prefix.toLowerCase())
  )].sort();
};

const main = async () => {
  const token = requireEnv('CF_API_TOKEN');
  const args = parseArgs();
  const zonesArg = args.zones || '';
  const markdownPath = args.prefixMarkdown || '';
  const outputPath = args.output || path.resolve(process.cwd(), 'cloudflare-email-prefix-audit.json');

  if (!zonesArg || !markdownPath) {
    throw new Error('Usage: node audit-cloudflare-email-prefixes.mjs --zones zone1,zone2 --prefixMarkdown <path> [--output <path>]');
  }

  const zoneNames = zonesArg.split(',').map((value) => value.trim()).filter(Boolean);
  const markdown = await fs.readFile(markdownPath, 'utf8');
  const curatedPrefixes = buildCuratedPrefixPoolFromMarkdown(markdown);
  const zones = await listZones(token, zoneNames);

  const report = [];
  for (const zone of zones) {
    const records = await listDnsRecords(token, zone.id);
    const existingPrefixes = toSecondLevelPrefixes(records, zone.name);
    const plan = buildReconciliationPlan(curatedPrefixes, existingPrefixes);
    report.push({
      zone: zone.name,
      zoneId: zone.id,
      existingPrefixCount: existingPrefixes.length,
      removablePrefixes: plan.removablePrefixes,
      missingCuratedPrefixes: plan.missingCuratedPrefixes,
      addablePrefixes: plan.addablePrefixes,
      readOnlyEmailRoutingRecords: records
        .filter((row) => row.meta?.email_routing && row.meta?.read_only)
        .length,
    });
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`audit written to ${outputPath}`);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
