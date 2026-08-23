# Provider live reports

Each accepted paid/live run writes one redacted JSON report named `<runId>.json`. Product evidence records reference the exact SHA-256 of that report. The filename and report `runId` must match.

Reports must contain no credentials, prompts with user data, or generated media. They retain only execution identity, alias-resolved provider revision, region, timestamps, cost, request IDs, retry trace, deterministic checks, fact ratios, and blind-review scores.

The frozen prompts, options, fixture paths and SHA-256 values, expected facts, deterministic assertions, and hard-failure definitions live in `src/release/acceptanceSuite.ts`. The sequential live runner verifies every fixture hash before execution and writes the matching case digest; reports cannot replace those inputs with ad hoc samples.

The release gate enforces the acceptance profile registered for each offering:

- Every required operation and scenario group is covered by the declared minimum sample count.
- Every sample follows its preregistered case ID, operation set, and expected terminal outcome; retries use contiguous attempt numbers with provider request IDs, error codes, and rerun reasons.
- Every sample passes deterministic checks and has no hard failure.
- Language and vision suites meet their aggregate fact threshold.
- Image and video suites have exactly two independent blind reviews. A score difference greater than one on any rubric dimension requires exactly one independent adjudicator.
- Evidence is bound to the adapter manifest digest, acceptance-suite digest, exact SDK lock version, provider API revision, deployment region, live-report digest, and resolved model revision; it expires after 30 days.
- Execution fields must carry an Ed25519 attestation from a trusted protected-workflow executor. Every blind review and adjudication must be signed by its own trusted reviewer identity. Trust roots are provisioned in `provider-evidence-trust.json`; the checked-in empty registry deliberately prevents local self-declaration from passing release.

The checked-in `provider-release-evidence.json` stays empty until the paid run and product review are actually complete. Catalog flags and mock tests cannot create product-acceptance evidence.
