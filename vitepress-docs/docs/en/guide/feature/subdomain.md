# Configure Subdomain Email

::: warning Note
Subdomain emails may not be able to send emails. It is recommended to use main domain emails for sending and subdomain emails only for receiving.

Mail channel is no longer supported. The reference below is limited to the receiving part only.
:::

Reference

- [Configure Subdomain Email](https://github.com/dreamhunter2333/cloudflare_temp_email/issues/164#issuecomment-2082612710)

## Create Random Second-level Subdomain Addresses

If your base domain mail routing is already configured, you can also let users create mailbox
addresses with an automatically generated random second-level subdomain, for example:

- Base domain: `abc.com`
- Created address: `name@x7k2p9q1.abc.com`

This is useful for mailbox isolation and reducing repeated hits on the same address.

Add these worker variables:

```toml
RANDOM_SUBDOMAIN_DOMAINS = ["abc.com"]
RANDOM_SUBDOMAIN_LENGTH = 8
```

- `RANDOM_SUBDOMAIN_DOMAINS`: base domains that allow optional random second-level subdomains
- `RANDOM_SUBDOMAIN_LENGTH`: random string length, range `1-63`, default `8`

> [!NOTE]
> This feature only appends a random second-level subdomain when the mailbox is created.
>
> It does not automatically create Cloudflare-side subdomain mail routes or DNS records for you,
> so make sure the base-domain/subdomain routing is already available first.
>
> If you use the admin panel, you can also override this list there via
> "Random Subdomain Allowed Domains". When no admin value has been saved, runtime falls back to
> `RANDOM_SUBDOMAIN_DOMAINS`; saving **Follow Environment Variable** clears the admin override.
>
> Also keep "address can be created" separate from "mail can be received": even if `/api/new_address`
> succeeds, the mailbox list can still show `Mail Count = 0` when Cloudflare Email Routing is not
> forwarding that domain or subdomain into the Worker. If the Cloudflare `Email Routing -> Activity`
> page shows "received" but the result is "deleted", the message was dropped by Cloudflare-side
> routing rules before it reached this project's Worker.

## Default Unique Four-level Mailbox Domains

If you have already prepared fixed second-level subdomains in Cloudflare Email Routing, such as:

- `alpha.example.com`
- `docs.example.com`
- `support.example.com`

you can place those prefixes in `DOMAIN_LABELS` and let the system create four-level mailbox domains by default:

- `neo@a4k9m2.alpha.example.com`
- `neo@m7q2x8.docs.example.com`

Characteristics:

- every mailbox domain gets a six-character alphanumeric label
- pure-digit and obviously repeated labels are rejected
- every issued mailbox domain is recorded permanently and will not be reused
- deleting the mailbox later does not make that mailbox domain available again

This mode is better for long-running setups that require strict mailbox-domain uniqueness.

## Let APIs Specify Subdomains Directly

If you do not want the system to generate a random subdomain, and instead want the caller to
explicitly create addresses like `team.abc.com`, enable:

```toml
ENABLE_CREATE_ADDRESS_SUBDOMAIN_MATCH = true
```

When this is enabled, as long as `abc.com` is in the allowed base-domain list, the following
addresses can be created through `/api/new_address` or `/admin/new_address`:

- `name@team.abc.com`
- `name@dev.team.abc.com`

> [!NOTE]
> This only relaxes the domain validation used by the create-address APIs. It does not change the
> default domain dropdown, and it does not create Cloudflare-side subdomain mail routes for you.
>
> If the admin panel has already saved an override once, you can switch it back to **Follow Environment Variable** to clear the override and return to env fallback behavior.
>
> In practice, this means the backend may allow addresses such as `foo.bar.example.com`, but actual
> mail reception still depends on Cloudflare Email Routing being configured for `bar.example.com` or
> the deeper subdomain you are using. MX records, Worker custom domains, or successful address
> creation alone are not enough to guarantee delivery into the Worker.
