# GitNexus CLI Deployment and Distribution (Single Channel)

This document defines the team release process for distributing GitNexus as a CLI package to teammates.

## Goal

- Teammates can install one stable CLI package from npm.
- After install, they can run `gitnexus analyze` in any repository.
- Agent skills are available through:
  - repo-local install by `gitnexus analyze` to `.agents/skills/gitnexus/`
  - global install by `gitnexus setup` to `~/.agents/skills/gitnexus/`

## Scope

- Release channel: single channel only (`latest`)
- Trigger: git tag matching `v*`
- Publisher: GitHub Actions workflow

References:
- Publish workflow: [`.github/workflows/publish.yml`](../.github/workflows/publish.yml)
- CLI package config: [`gitnexus/package.json`](../gitnexus/package.json)

## One-Time Setup

1. Use team package name on npm.
- Package: `@veewo/gitnexus`
- Keep CLI binary name as `gitnexus` (defined in package `bin`).

2. Create npm automation token for publish rights.
- Add token as repository secret: `NPM_TOKEN`

3. Confirm publish workflow is enabled.
- Workflow file: `.github/workflows/publish.yml`
- It publishes from `gitnexus/` when a `v*` tag is pushed.

## Release Steps (Every Version)

1. Ensure `main` is clean and verified.
- Run local checks in `gitnexus/`:
  - `npm run build`
  - `npm run test:benchmark`

2. Bump version in `gitnexus/`.
- `npm version patch` (or `minor` / `major`)
- This creates a version commit and tag in `vX.Y.Z` format.

3. Push commit and tag.
- `git push`
- `git push --tags`

4. Publish package.
- Preferred: tag-triggered GitHub Actions workflow publish.
- Fallback (manual local publish): `npm publish --access public`
- Note: local terminal publish should not use `--provenance` unless your environment supports it.
- If you see `Automatic provenance generation not supported for provider: null`, remove `--provenance`.

5. Wait for publish completion.
- Workflow: `Publish to npm`
- Trigger: `push tags: v*`

6. Smoke check published package.
- `npx -y @veewo/gitnexus@<version> --help`
- Optional runtime check in a test repo:
  - `npx -y @veewo/gitnexus@<version> analyze`

## Teammate Install and Usage

Global install:
- `npm i -g @veewo/gitnexus`

Replace upstream package with team package:
- `npm uninstall -g gitnexus`
- `npm install -g @veewo/gitnexus`

No-install mode:
- `npx -y @veewo/gitnexus analyze`

Typical first-time usage in a project:
1. `gitnexus setup`
2. `gitnexus analyze`

## Rollback Strategy (Single Channel)

- Do not rely on unpublish.
- Preferred rollback: release a new patch version that fixes the issue.
- Temporary mitigation for teammates: pin a known good version.
  - `npm i -g @veewo/gitnexus@<good-version>`
  - or `npx -y @veewo/gitnexus@<good-version> analyze`

## Team Policy

- No beta/canary channel.
- Only stable releases to `latest`.
- Every release is tag-driven and traceable in git history.

## Validation Checklist (Verified)

Validated in this repository with `@veewo/gitnexus@1.3.4`:

- `npm run build` passes
- `npm run test:benchmark` passes
- `npm publish --access public` succeeds
- `npm view @veewo/gitnexus version --registry=https://registry.npmjs.org` returns expected version
- `npx -y @veewo/gitnexus@latest --version` returns expected version
- Fresh global install can run `gitnexus analyze`

## Troubleshooting

If `npm view` shows 404 with `Access token expired or revoked`:

- This can be an auth-state issue, not a true missing package.
- Verify with explicit registry:
  - `npm view @veewo/gitnexus version --registry=https://registry.npmjs.org`
- Re-login if needed:
  - `npm logout --registry=https://registry.npmjs.org`
  - `npm login --auth-type=web --scope=@veewo --registry=https://registry.npmjs.org`

If publish fails with `EOTP`:

- Account uses write-protected 2FA (`auth-and-writes`).
- Publish with OTP:
  - `npm publish --access public --otp=<code>`
