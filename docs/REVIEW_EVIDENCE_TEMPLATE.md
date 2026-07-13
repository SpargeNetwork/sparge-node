# Independent Review Evidence Template

## Reviewer
- Reviewer name/handle:
- Date/time (UTC preferred):
- Commit hash / release tag:
- Environment (OS, Node version):

## Commands Run

### 1) `npm run test:stability`
- Command output summary:
- Final line (`RESULT: PASS` expected):
- Exit code:

### 2) `npm run test:recovery`
- Command output summary:
- Final line (`PASS: Recovery smoke test succeeded` expected):
- Exit code:

### 3) `npm run test:replay`
- Command output summary:
- Final line (`replay tests passed` expected):
- Exit code:

### 4) Protocol correctness smoke suite

Status: MISSING unless `scripts/test-protocol-correctness.js` is restored or replaced with an equivalent suite. Deterministic replay is not a formal replacement for every protocol-focused smoke scenario.
- Command output summary:
- Final line (`RESULT: PASS` expected):
- Exit code:

### 5) `npm run test:invariants`
- Command output summary:
- Final line (`invariant tests passed` expected):
- Exit code:

## Findings

| ID | File / Function | Description | Severity (Critical/High/Med/Low) | Reproduction | Suggested fix |
|---|---|---|---|---|---|
| F-001 |  |  |  |  |  |

## Reviewer Sign-off
- [ ] No critical issues found
- [ ] Issues found (see above)

Notes:
