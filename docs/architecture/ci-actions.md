# CI actions

Every third-party action used in `.github/workflows/` is pinned and reviewed here. `tools/action-pins/check-action-pins.mjs` reads this file in CI.

## Reviewing an action

Review an action before you pin it: read its `action.yml` and its source at the commit you pin, and check whether the bundled `dist/` that actually runs was compared with that source. Record it as one list item under "Pins": the action, version, full commit SHA, release date, and a note starting `Reviewed YYYY-MM-DD:` that says what you read, what the action does with the runner, and whether `dist/` was compared.

CI fails when a `uses:` line isn't `owner/repo@<40-character SHA> # vX.Y.Z` (local `./` actions are exempt), when its SHA isn't in this file, or when the SHA's list item has no `Reviewed YYYY-MM-DD:` note that mentions `dist/`.

To update a pin, pick a newer release at least two weeks old, read its changes, resolve the tag to its commit SHA (`gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`), review it, and update both the workflow and its list item.

## Pins

- `actions/checkout` v7.0.1, `3d3c42e5aac5ba805825da76410c181273ba90b1` (released 2026-07-20). Reviewed 2026-10-20: for weareit, carried over unchanged through prove-how on 2026-10-28. Read `action.yml` and `src/` (`main.ts`, `git-source-provider.ts`, `git-auth-helper.ts`, `unsafe-pr-checkout-helper.ts`). It runs `git` to fetch the repository with the job's token. With `persist-credentials: false`, as CI sets it, it removes the token from the git config when the checkout finishes. It refuses to check out fork pull request code from a `pull_request_target` or `workflow_run` workflow unless `allow-unsafe-pr-checkout` is set. The 1.4 MB `dist/index.js` was not compared with the source.
- `actions/setup-node` v7.0.0, `820762786026740c76f36085b0efc47a31fe5020` (2026-07-14). Reviewed 2026-10-20: for weareit, carried over unchanged through prove-how on 2026-10-28. Read `action.yml` and `src/` (`main.ts`, `distributions/official_builds/official_builds.ts`, `distributions/base-distribution.ts`, `cache-utils.ts`, `authutil.ts`). It resolves the Node version from a manifest in `actions/node-versions` at its `main` branch, not a pinned commit, and downloads Node from that manifest or from nodejs.org. With `cache: pnpm` it runs `pnpm store path` and caches that folder. It writes an npm auth token only when `registry-url` is set, which CI doesn't set. The 3.5 MB `dist/setup/index.js` and 3.3 MB `dist/cache-save/index.js` were not compared with the source.
- `pnpm/action-setup` v6.1.0, `ea17c68df8912ef543352723c149a84f56e3d413` (2026-09-05), the only action not published by GitHub. Reviewed 2026-10-20: for weareit, carried over unchanged through prove-how on 2026-10-28. Read `action.yml` and TypeScript `src/`. It installs pnpm with `npm ci` from a lockfile committed in the action, which carries the package's integrity hash. It reads the pnpm version from `packageManager`. The only network hosts in its bundled `dist/index.js` are the npm registry and GitHub's own services (Actions cache and Azure storage); the 1.4 MB bundle was not otherwise compared with the source.

## Cost

Public repositories run on standard GitHub-hosted Linux runners. Each job has a timeout, and a newer push to the same ref cancels the run in progress. Pull requests from forks get a read-only token and no repository secrets; no workflow uses `pull_request_target` or a self-hosted runner.
