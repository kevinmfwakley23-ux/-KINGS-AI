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
  --manifest ./private-evaluation/manifest.json \
  --responses ./private-evaluation/responses.json \
  --model kings-candidate-001 \
  --evaluated-at 2026-10-24T20:00:00.000Z \
  --output ./private-evaluation/evidence.json
```

The CLI limits each input file to 32 MiB, refuses to overwrite either input,
writes the artifact atomically, and returns a compact summary on standard
output. Keep private held-out tasks and model responses out of the public
repository.

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
promote that model.
