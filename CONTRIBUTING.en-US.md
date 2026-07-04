# Contributing Guide

Thanks for your interest in contributing to Immersive Clock. This document is for contributors and developers, covering local development, PR requirements, and quality checks.

## Contents

- [Ways to Contribute](#ways-to-contribute)
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Common Scripts](#common-scripts)
- [Branch & Commit Conventions](#branch--commit-conventions)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Codebase Conventions](#codebase-conventions)
- [Testing & Quality Gate](#testing--quality-gate)
- [Electron Build Notes](#electron-build-notes)
- [Docs & Bilingual Notes](#docs--bilingual-notes)
- [Issues & Security](#issues--security)

---

## Ways to Contribute

- Bug fixes (please include reproducible steps and screenshots/recordings if possible)
- Feature improvements (open an issue first to discuss scope and direction)
- Documentation updates (README / docs / copy)
- Performance and accessibility improvements (ARIA / keyboard navigation / large-screen touch UX)

---

## Prerequisites

- Node.js: `>= 18.0.0` (see `engines.node` in [package.json](./package.json))
- Git
- Package manager: examples use `npm`

---

## Local Development

Clone your fork:

```bash
git clone https://github.com/<your-username>/immersive-clock.git
cd immersive-clock
```

Copy env file:

```bash
# Windows (PowerShell)
copy .env.example .env
```

Install deps:

```bash
npm install
```

Start web dev server:

```bash
npm run dev
```

Start Electron dev:

```bash
npm run dev:electron
```

---

## Common Scripts

All scripts are defined in [package.json](./package.json):

```bash
npm run build
npm run preview

npm run lint
npm run lint:fix
npm run format

npm run test
npm run test:coverage

npm run test:e2e:install
npm run test:e2e
```

---

## Branch & Commit Conventions

Suggested branch prefixes:

- `fix/xxx`
- `feat/xxx`
- `docs/xxx`
- `refactor/xxx`
- `test/xxx`

Commit messages should be short, readable, and focused. Avoid mixing unrelated changes in one commit.

---

## Pull Request Guidelines

Before opening a PR:

- Keep the change focused and minimal
- If UI changes are involved, attach screenshots/recordings
- If you fixed a bug, include reproduction steps and the expected behavior
- If you introduce new settings or user-visible behavior, update README or `docs/` accordingly

PR description should include:

- What changed
- Why it changed
- Compatibility / risks
- What you tested locally

---

## Codebase Conventions

- Prefer TypeScript; avoid `any` and implicit `any`
- Place shared type definitions under `src/types/` when adding new types
- Put reusable UI components under `src/components/`
- Use semantic names (avoid one-letter variables unless extremely local and conventional)
- Styling uses CSS Modules and CSS variables (tokens live in `src/styles/variables.css`)
- Keep accessibility in mind (ARIA attributes, keyboard navigation, not color-only signals)

---

## Testing & Quality Gate

Recommended minimum before a PR:

```bash
npm run lint
npm run test
```

If your change affects core flows or UI interactions, also run:

```bash
npm run test:e2e
```

---

## Electron Build Notes

Build installers:

```bash
npm run dist:electron
```

This runs an Electron-mode build and packages artifacts via `electron-builder`. Output paths and platform differences depend on the project configuration.

---

## Docs & Bilingual Notes

- README is user-facing; contributor/developer details should live in this guide
- User docs and FAQ live under `docs/`
- If your change affects user-facing docs, try to keep Chinese and English docs consistent (at least for entry points and key workflows)

---

## Issues & Security

- For bugs: include steps to reproduce + screenshots/recordings + browser/OS versions if relevant
- For security issues: do not post secrets/tokens/private data in public issues; report via the author’s public contact channels instead
