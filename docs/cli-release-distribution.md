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

1. Decide package name on npm.
- Recommended for team fork: `@your-org/gitnexus`
- Keep CLI binary name as `gitnexus` (already defined in package `bin`).

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

4. Wait for GitHub Actions publish job.
- Workflow: `Publish to npm`
- Trigger: `push tags: v*`

5. Smoke check published package.
- `npx -y <package-name>@<version> --help`
- Optional runtime check in a test repo:
  - `npx -y <package-name>@<version> analyze`

## Teammate Install and Usage

Global install:
- `npm i -g <package-name>`

No-install mode:
- `npx -y <package-name> analyze`

Typical first-time usage in a project:
1. `gitnexus setup`
2. `gitnexus analyze`

## Rollback Strategy (Single Channel)

- Do not rely on unpublish.
- Preferred rollback: release a new patch version that fixes the issue.
- Temporary mitigation for teammates: pin a known good version.
  - `npm i -g <package-name>@<good-version>`
  - or `npx -y <package-name>@<good-version> analyze`

## Team Policy

- No beta/canary channel.
- Only stable releases to `latest`.
- Every release is tag-driven and traceable in git history.
