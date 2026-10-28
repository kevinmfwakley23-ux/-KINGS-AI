# K.I.N.G.S. Powerhouse Training and Evaluation Evidence

K.I.N.G.S. separates model training material, held-out evaluation, production
qualification, and competitive claims. A routing policy or prompt is not model
training, and an internal benchmark pass is not proof of top-tier performance.

## Evidence pipeline

`PowerhouseBenchmarkRunner` validates a versioned corpus manifest and evaluates
recorded model responses. The runner:

- requires every service domain to contain training material and at least 20
  held-out tasks;
- rejects duplicate normalized prompts;
- rejects source groups that cross training, validation, and held-out splits;
- requires explicit training or evaluation permission for each corpus item;
- binds every permission record to an identified attester and SHA-256 evidence
  artifact;
- rejects `TODO`, `TBD`, `placeholder`, and `unknown` rights references;
- counts omitted responses as failures rather than removing them from the
  denominator;
- supports deterministic criteria and evidence-attested rubric review;
- prevents an evaluated model from attesting its own subjective rubric score;
- preserves per-task pass/fail reasons and output hashes without copying raw
  model output into the evidence artifact; and
- emits manifest, run, and per-domain SHA-256 identities.

The resulting seven `domainBenchmarks` records can be supplied directly to
`PowerhouseQualificationAuthority`. Production qualification still requires
every domain to meet the qualification policy. Competitive/top-tier proof still
requires separate independent peer-model comparisons.

## Command-line evaluation

Build the repository, then run:

```bash
npm run evaluate:powerhouse -- \
  --manifest ./.kings/powerhouse-evaluation/manifest.json \
  --responses ./.kings/powerhouse-evaluation/responses.json \
  --model kings-candidate-001 \
  --evaluated-at 2026-10-28T20:00:00.000Z \
  --output ./.kings/powerhouse-evaluation/evidence.json
```

The CLI limits each input file to 32 MiB, refuses to overwrite either input,
writes the artifact atomically, and returns a compact summary on standard
output. Keep private held-out tasks and model responses out of the public
repository.

## Provider-connected execution

After configuring an exact provider/model in the normal K.I.N.G.S. environment,
the live executor can run every held-out task and produce the same evidence
artifact without a manually assembled response file:

```bash
npm run evaluate:powerhouse:live -- \
  --manifest ./.kings/powerhouse-evaluation/manifest.json \
  --checkpoint ./.kings/powerhouse-evaluation/run-001-checkpoint.json \
  --output ./.kings/powerhouse-evaluation/run-001-evidence.json \
  --run-id run-001 \
  --provider omniroute \
  --model exact-model-id \
  --evaluated-at 2026-10-28T20:00:00.000Z \
  --concurrency 1 \
  --max-attempts 2 \
  --retry-delay-ms 1000 \
  --max-output-tokens 2048 \
  --temperature 0
```

Live execution requires the existing `KINGS_CODING_MACHINE_TOKEN` to be
configured with at least 24 characters. The token is never written to the
checkpoint, evidence artifact, logs, or command arguments. The provider and
model are locked for the entire run; fallback to another model is forbidden.
The CLI verifies that the selected model declares every capability needed by
the seven domains before spending a provider request.

Execution checkpoints are atomic, owner-readable only, and protected by a
single-process lock. Each task stores provider attempts, usage, terminal
failure or raw response, and a tamper-evident SHA-256 identity. Restarting the
same run resumes only missing tasks. Completed successes and failures are not
rerun, preventing selective retry from inflating a benchmark score. The final
evidence artifact excludes raw private prompts and outputs.

Rubric-scored creative or editorial tasks remain failed until a distinct,
authorized reviewer supplies the required attestation. Live model execution
does not allow the evaluated model to approve its own subjective work.

## Owner-authorized rubric review

An approved reviewer records only the rubric task id, score, reviewer id,
review-evidence reference and SHA-256, and review time in a private draft file.
The owner then authorizes and applies those reviews without rerunning the model:

```bash
npm run review:powerhouse -- \
  --manifest ./.kings/powerhouse-evaluation/manifest.json \
  --checkpoint ./.kings/powerhouse-evaluation/run-001-checkpoint.json \
  --draft-reviews ./.kings/powerhouse-evaluation/run-001-review-drafts.json \
  --signed-reviews ./.kings/powerhouse-evaluation/run-001-signed-reviews.json \
  --output ./.kings/powerhouse-evaluation/run-001-reviewed-evidence.json \
  --signed-at 2026-10-28T20:30:00.000Z \
  --evaluated-at 2026-10-28T20:35:00.000Z
```

The existing `KINGS_CODING_MACHINE_TOKEN` signs each review with HMAC-SHA-256.
Authorization covers the immutable run identity, benchmark and manifest hashes,
provider, model, task, rubric, score, evaluator, evidence hash, review time, and
the exact model-output SHA-256. The token itself is never persisted. A changed
score, reviewer, evidence record, model output, checkpoint, or owner token
invalidates authorization.

Only successful `attested-rubric` tasks can be reviewed. The evaluated model
cannot be its own evaluator, deterministic answers cannot be overridden by a
human review, and owner authorization cannot convert a below-threshold score
into a pass. Missing reviews remain failures. Signed review and reviewed
evidence files are written atomically with owner-only permissions, while the
checkpoint process lock prevents review from racing active model execution.

Review results must not be copied into the held-out model's training data.
Failures may guide domain-level improvement, but corrective examples must be
new rights-cleared material with source groups and prompts disjoint from every
held-out item. A new model build must be tested under a new immutable run id.

## Corpus item contract

Each item declares:

- unique `id`, service `domain`, and `split`;
- `sourceGroupId` for group-level leakage prevention;
- prompt and critical-task status;
- license, source, permission, permission-evidence SHA-256, and attester;
- explicit training/evaluation permission; and
- scoring only for held-out tasks.

Deterministic scoring supports exact text, required and forbidden fragments,
and minimum/maximum length. Creative, editing, and other subjective tasks use
an `attested-rubric` with a versioned rubric, minimum score, distinct evaluator,
and evidence reference.

## Honest current boundary

This pipeline is real evaluation infrastructure. The repository does not ship a
fake passing production corpus, fabricate rights evidence, or claim that a
candidate has been trained or qualified. Real owner-approved, rights-cleared
training data and private held-out tasks must be assembled, executed against a
specific model build, and reviewed before the qualification authority can
promote that model. The live executor makes that real run possible; it does not
create the private corpus or declare the current candidate qualified.
