# Contributing to Routes CLI

Thank you for your interest in contributing to Routes CLI! This guide will help you get started.

---

## 1. Development Setup

### Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** (preferred package manager)
- Git

### Clone and install

```bash
git clone https://github.com/eco/routes-cli.git
cd routes-cli
pnpm install
```

### Environment configuration

Copy the example environment file and fill in your private keys:

```bash
cp .env.example .env
```

Required variables in `.env`:

```
EVM_PRIVATE_KEY=0x<64-hex-chars>   # EVM chains (Ethereum, Base, Optimism, …)
TVM_PRIVATE_KEY=<64-hex-chars>     # Tron (no 0x prefix)
SVM_PRIVATE_KEY=<base58-string>    # Solana (base58, byte array, or comma-separated)
```

> **Security note:** Never commit your `.env` file. It is already listed in `.gitignore`.
> Use dedicated test accounts with minimal funds — never your main wallet.

### Run in development mode

```bash
pnpm dev publish          # Interactive intent publishing
pnpm dev chains           # List supported chains
pnpm dev tokens           # List configured tokens
```

### Build

```bash
pnpm build    # Compiles TypeScript to dist/
pnpm clean    # Removes dist/
```

---

## 2. Branch Naming Convention

| Prefix | When to use |
|--------|-------------|
| `feat/` | New feature or capability |
| `fix/` | Bug fix |
| `docs/` | Documentation only changes |
| `refactor/` | Code restructuring with no behaviour change |
| `test/` | Adding or improving tests |

**Examples:**

```
feat/add-polygon-chain
fix/tvm-token-approval-loop
docs/update-contributing-guide
refactor/extract-quote-service
test/evm-publisher-unit-tests
```

Branch names should be lowercase and use hyphens, not underscores or spaces.

---

## 3. Commit Message Format

Routes CLI follows the [Conventional Commits](https://www.conventionalcommits.org/) specification.

```
<type>(<scope>): <short description>

[optional body — explain the *why*, not the *what*]
```

### Types

| Type | Use for |
|------|---------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `chore` | Build scripts, dependency updates, tooling |
| `docs` | Documentation changes only |
| `refactor` | Restructuring code without changing behaviour |
| `test` | Adding or fixing tests |
| `perf` | Performance improvements |

### Scope (optional)

Use the affected module or file area: `evm-publisher`, `config`, `svm`, `cli`, `address-normalizer`, etc.

### Examples

```
feat(config): add Polygon chain support
fix(tvm-publisher): loop over all reward tokens for approval
docs(readme): add Solana private key format examples
test(address-normalizer): add round-trip tests for all chain types
chore(deps): bump viem to 2.x
```

---

## 4. Pull Request Checklist

Before opening a PR, verify all of the following:

- [ ] **Tests pass** — `pnpm test` exits with zero errors
- [ ] **TypeScript compiles** — `pnpm build` succeeds with no type errors
- [ ] **Lint passes** — `pnpm lint` reports zero errors
- [ ] **No regressions** — existing tests are not deleted or weakened
- [ ] **Docs updated** — README, ARCHITECTURE.md, or inline JSDoc updated where relevant
- [ ] **Commit messages** follow Conventional Commits format
- [ ] **`.env` not committed** — double-check `git status` before pushing

For new features, also ensure:

- [ ] A test is added that would fail without the change
- [ ] Edge cases and error paths are covered
- [ ] The new chain/token/feature is documented in relevant config files

---

## 5. Testing Guide

### Running tests

```bash
pnpm test              # Run all unit + integration tests
pnpm test --watch      # Watch mode for active development
pnpm test <pattern>    # Run tests matching a file/name pattern
pnpm test:e2e          # Run E2E tests (requires Docker and BASE_RPC_URL)
```

### Test structure

```
tests/
├── unit/                        # Pure unit tests (no I/O)
│   ├── address-normalizer.test.ts
│   ├── chain-detector.test.ts
│   ├── intent-converter.test.ts
│   └── portal-encoder.test.ts
├── blockchain/                  # Publisher tests with mocked clients
│   └── evm-publisher.integration.test.ts
├── integration/                 # Full-pipeline integration tests
│   └── intent-publishing.test.ts
├── config/                      # Config loading integration tests
│   ├── chains.test.ts
│   └── tokens.test.ts
├── e2e/                         # End-to-end tests against Anvil fork
│   └── evm-publish.e2e.test.ts
└── __mocks__/                   # Shared mock factories
```

### Writing new tests

1. **Unit tests** go in `tests/unit/` — mock all I/O, test one function at a time.
2. **Integration tests** go in `tests/integration/` or `tests/blockchain/` — use injected mock clients via the factory pattern (see `PublisherFactory` and `tests/__mocks__/`).
3. **E2E tests** go in `tests/e2e/` — use a real Anvil fork; add your test to the existing file or create a new `*.e2e.test.ts`.

**Key conventions:**

- Use `beforeEach(() => jest.clearAllMocks())` to isolate per-test mock state.
- Prefer `mockResolvedValueOnce` over `mockResolvedValue` to catch unexpected extra calls.
- Use `expect.objectContaining(...)` for partial assertions on large objects.
- Fixtures should use real, well-known addresses (e.g. vitalik.eth, USDC contract) rather than made-up values.
- Universal Addresses (32-byte `0x` + 64-hex) must be used in all test fixtures except where testing chain-native formats.

### Test configuration files

- `jest.config.ts` — unit + integration tests (excludes `tests/e2e/`)
- `jest.e2e.config.ts` — E2E tests only (no viem mock, longer timeout, single worker)

---

## 6. Code Review Process

### Submitting a PR

1. Open a PR against the `main` branch.
2. Fill in the PR description: what changed, why, and how to test it.
3. Link any related issues.
4. Ensure all CI checks pass before requesting review.

### Review timeline

- Initial review within **2 business days** for small PRs (< 200 lines changed).
- Larger or architectural PRs may take longer; consider splitting into smaller PRs.
- If you have not received a review after 3 business days, ping the maintainer on the PR.

### What reviewers look for

- Correctness and edge-case coverage.
- Adherence to the Universal Address pattern (normalize on input, denormalize only at boundaries).
- No global state mutation (see `ConfigService` pattern in `src/config/config-service.ts`).
- Publisher classes receive Universal Addresses and denormalize internally before blockchain calls.
- New chains/tokens follow existing patterns in `src/config/chains.ts` and `src/config/tokens.ts`.
- Tests that actually exercise the new or fixed code path.

### Addressing review feedback

- Push new commits to the same branch; do not force-push unless explicitly asked.
- Mark conversations as resolved after addressing them.
- If you disagree with feedback, explain your reasoning — discussion is welcome.

---

## 7. Release Process

Routes CLI uses [Changesets](https://github.com/changesets/changesets) to manage versioning and `CHANGELOG.md` updates.

### For contributors — describe your change

When your PR includes a user-facing change, add a changeset file:

```bash
pnpm changeset
```

The CLI will prompt you to:
1. Select the bump type — `major` (breaking), `minor` (new feature), or `patch` (bug fix).
2. Write a short summary of the change for the CHANGELOG.

This creates a `.changeset/<random-name>.md` file. **Commit this file with your PR.**

> **When to skip changesets:** Pure documentation, test, or CI changes that have no impact on
> CLI behaviour or the published package do not need a changeset file.

### For maintainers — cutting a release

1. Merge all PRs for the release into `main`. Each PR should include its `.changeset/*.md` file.
2. Run the changeset version command to consume the changeset files and bump `package.json`:
   ```bash
   pnpm changeset version
   ```
   This updates `package.json`, aggregates all changeset summaries into `CHANGELOG.md`, and removes the consumed `.changeset/*.md` files.
3. Review the diff — confirm `package.json` version and `CHANGELOG.md` look correct.
4. Commit and push:
   ```bash
   git add package.json CHANGELOG.md pnpm-lock.yaml
   git commit -m "chore(release): v$(node -p 'require(\"./package.json\").version')"
   git push origin main
   ```
5. Tag the release — CI triggers the `release` job on tag push:
   ```bash
   VERSION=$(node -p 'require("./package.json").version')
   git tag "v$VERSION"
   git push origin "v$VERSION"
   ```
6. CI will publish to npm (`NPM_TOKEN` secret required) and create a GitHub Release automatically.
