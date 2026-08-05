# Contributing Guide

Welcome to contributions for Immersive Clock. This page keeps the shortest path to a useful
contribution. For architecture, component governance, testing, release, and troubleshooting details,
see the [technical knowledge base](docs/technical/README.md) (Chinese).

## Ways to contribute

- Report reproducible bugs with environment, steps, expected behavior, and actual behavior.
- Propose features or UX improvements with the target scenario, boundaries, and compatibility impact.
- Improve user documentation, product documentation, or marketing materials.
- Improve performance, accessibility, PWA, Electron, and cross-platform behavior.

## Prerequisites

- Node.js `>=22.0.0`, matching `package.json`.
- Git.
- npm and the repository's `package-lock.json`.

```bash
git clone https://github.com/<your-username>/immersive-clock.git
cd immersive-clock
npm install
```

Create `.env` from `.env.example` when local environment variables are needed.

## Common commands

```bash
# Web
npm run dev
npm run build
npm run preview

# Electron
npm run dev:electron
npm run build:electron
npm run dist:electron

# Quality checks
npm run typecheck
npm run lint
npm run lint:styles
npm run test
npm run test:e2e

# README screenshots and decorative assets
npm run assets:readme
```

Choose the narrowest verification for the change. Documentation-only changes should at least check
Markdown links and run `git diff --check`. For components, settings, persistence, permissions, PWA,
or Electron changes, follow the [testing strategy](docs/technical/engineering/testing-strategy.md)
and [build and release guide](docs/technical/engineering/build-release-and-deployment.md).

## Project structure

```text
Immersive-clock/
├── src/                    # React app, components, pages, state, and services
├── electron/               # Electron main process and preload scripts
├── android/                # Capacitor Android project
├── public/                 # PWA, icons, and runtime static assets
├── docs/                   # Product, user, technical, and marketing knowledge base
├── scripts/                # Build, compliance, and README asset scripts
├── tests/e2e/              # Playwright end-to-end tests
└── vite.config.ts          # Web, PWA, Electron, and Android build entry
```

See [Application Architecture](docs/technical/architecture/application-architecture.md) and the
[Module Map](docs/technical/architecture/module-map.md) for details.

## Branches, commits, and pull requests

Recommended branch prefixes:

- `feat/`: feature
- `fix/`: bug fix
- `docs/`: documentation
- `refactor/`: refactor
- `test/`: tests

Keep commits concise, readable, and traceable. A pull request should include:

- What changed and why.
- Risks, compatibility, and migration notes.
- Commands and tests actually run.
- Screenshots or recordings for UI changes.

Avoid mixing unrelated formatting, dependency upgrades, and feature changes in one pull request.

## Codebase conventions

- Use TypeScript strict mode and avoid `any` and implicit `any`.
- Use functional React components, CSS Modules, and the existing design tokens.
- Follow the [UI component and icon system guide](docs/technical/engineering/ui-components-and-icons.md).
- Reuse existing settings, storage, and data-management boundaries.
- Do not use `console.log` in business code; use the project logger.

## Documentation ownership

- `docs/technical/`: architecture, implementation, engineering, testing, release, and troubleshooting.
- `docs/product/`: product direction, users, principles, and boundaries.
- `docs/user-guide/`: user-facing guides and FAQ.
- `docs/marketing/`: public copy, asset indexes, and release templates.

README is for product users; development setup, repository structure, and verification workflows
belong in this contributing guide. Update the relevant user guide when user-visible behavior changes;
update technical documentation and the testing coverage map when implementation facts change.

## Security and feedback

Do not expose secrets, tokens, personal locations, schedules, or unredacted backups in public issues,
chat, or screenshots. Report security issues privately through the author's public contact channels.

For the Chinese entry, see [贡献指南](CONTRIBUTING.md).
