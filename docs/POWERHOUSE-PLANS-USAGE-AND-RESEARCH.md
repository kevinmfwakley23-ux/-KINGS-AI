# K.I.N.G.S. POWERHOUSE: owner access, paid-user budgets and governed web research

Status: **metering implementation in review; payment processor, production deployment and real device proof pending.**

## Control and ownership

The existing K.I.N.G.S. app-router remains the model/provider authority. Configure
the private KINGS_APP_ROUTER_TOKEN as the **owner/system credential**. Only
William Kevin Wakley Jr. controls that secret. Calls authenticated with this
credential have **no subscriber-plan request or monthly-token quota**. Provider
context windows, hardware, paid-provider cost, security policy, and real rate
limits still apply. Never ship the owner credential inside a phone/desktop app
or distribute it to subscribers.

Paid users receive independent, randomly generated Bearer keys. The server
only stores their SHA-256 digests in a private owner-managed entitlement file.
No client-supplied plan/role/monthly limit is trusted.

## Server configuration

Set these values in an approved server-side secret manager/configuration:

- KINGS_APP_ROUTER_TOKEN: at least 24 high-entropy characters (owner credential)
- KINGS_APP_USAGE_ACCOUNTS_FILE: absolute private JSON entitlement manifest path
- KINGS_APP_USAGE_LEDGER_FILE: absolute private JSON usage ledger path
- KINGS_APP_ROUTER_BIND: 127.0.0.1 when behind a same-host HTTPS proxy

Both usage paths must be set together. If either is missing, paid-user mode
is not enabled. The router refuses paid-user mode without a strong owner key.
Use a protected HTTPS reverse proxy for phone, tablet, Windows, and macOS
clients; never expose the backend HTTP port directly to the public Internet.

Private manifest format, written **only** by an owner-approved provisioning or
verified payment workflow (do not commit this file):

~~~json
{
  "version": 1,
  "accounts": [
    {
      "id": "account_001",
      "keySha256": "REPLACE_WITH_SHA256_OF_A_RANDOM_SUBSCRIBER_KEY",
      "planId": "standard",
      "status": "active",
      "paidThrough": "2026-11-30T23:59:59Z",
      "monthlyTokens": 1000000,
      "monthlyRequests": 500,
      "maxOutputTokens": 4096
    }
  ]
}
~~~

The hash above is descriptive and intentionally invalid. Generate each raw
subscriber key with a cryptographic random generator; use SHA-256 on its exact
bytes and retain the raw key only for a secure, one-time handoff to the subscriber.
On account compromise, revoke the old key and issue a new one. Never use
email addresses, profile fields, or request headers to infer owner role.

Updating the private manifest changes a subscriber's plan and remaining monthly
limits without resetting usage already consumed in the current UTC calendar
month. Setting status to suspended or expiring paidThrough blocks model calls.
A **verified payment event** must drive activation and renewal in production.
The present code does not process money, verify webhook signatures, or claim
that user payments have occurred.

## Quotas and live API paths

- GET /v1/usage: owner reports unlimitedSubscription true; subscribers see
  current UTC month's consumed and remaining requests/tokens.
- POST /v1/responses and POST /responses: subscriber metering and server-side
  output-token cap; existing model routing and specialist-domain policy apply.
- POST /v1/route: same metering and provider caps.
- GET /v1/models and GET /v1/powerhouse/domains: subscriber-readable.
- POST /v1/brain/research/retrieve and other brain/owner operations: owner-only.

A request reserves estimated input + requested output tokens and one call in the
on-disk ledger **before** provider execution. Success settles actual provider
reported usage. Failed calls release reservations. If the process crashes, a
pending reservation remains charged rather than reopening unmetered access.
Actual tokenization may exceed estimated input; such overage is recorded and
prevents subsequent requests until quota or plan changes.

Usage is persisted with atomic replacement and a single-process exclusive
ledger lock. **Do not run multiple app-router replicas on the same file**.
A leftover lock after an unclean shutdown requires operator inspection before
manual removal; blindly deleting it may permit concurrent writers. Before
hosting a horizontally scaled paid service, replace the local ledger with an
ACID transactional DB, idempotent request records, verified payment events,
reconciliation, dispute/refund handling, fraud controls, and server-side
cost/rate limiting. There is no production billing checkout today.

## Internet access, learning and research

The existing K.I.N.G.S. Brain Core implements governed internet research.
The owner can use POST /v1/brain/research/retrieve with explicit HTTPS URLs,
task identity, and research question. The existing WebAccess policy limits
response bytes, enforces timeouts, blocks private-network targets, rejects
redirects, and requires public HTTPS destinations. The router does not
turn web pages into authoritative model memories or automatically retrain
weights. Research is source evidence; durable knowledge promotion and
training require verification, permission, and the existing evidence gates.

Do not implement autonomous unrestricted internet crawling or allow model
responses to bypass owner tool authorization. Live internet/provider execution
must be verified on the actual hosted runtime.

## Model power and token limits

K.I.N.G.S. already supports OmniRoute, 9Router, other configured providers,
and optional local fallback. Subscriber maxOutputTokens is a per-request limit,
not a promise that a model supports that output or any particular context
window. Owner subscription use has no monthly quota, but provider model/context,
cost, safety/tool authorization, and computing constraints still exist.
Use observed model capability and benchmark evidence before claiming improved
reasoning, larger usable context, or top-tier parity.

## Required release checks

1. Run npm ci && npm run verify and ensure cross-platform GitHub CI is green.
2. Test live provider billing with an authorized account and check independent
   provider usage against the durable ledger.
3. Verify plan upgrade, suspension, expiry, month rollover, concurrent requests,
   restart recovery, and unauthorized owner-only research denial.
4. Add real payment verification and billing lifecycle before paid customer launch.
5. Complete actual device install/network/auth/proof on Android, macOS and Windows.
6. Complete real held-out specialist evaluations and owner-approved training
   data/compute runs. A passing mock or routing policy is not a trained model.
