# NarraStage Web

The repository-owned NarraStage Web client. It shares one Bun workspace, TypeScript version, dependency lock, API contract, and release provenance with `apps/server`, `apps/desktop`, and `packages/contracts`.

## Stack

- React 19 and React DOM 19
- React Router 7
- TanStack Query 5 for server state
- Zustand 5 for the minimal persisted session and locale preferences
- Vite 8 single-file production renderer
- TypeScript 7
- Vitest 4 and Testing Library

Provider secrets never enter the HTTP API, Web storage, or Query cache. NarraStage Desktop exposes a narrow `narrastageCredentials` preload bridge backed by operating-system secure storage; a regular browser can only read redacted provider status.

## Development

Run commands from the repository root:

```bash
make install
make dev
make web-dev
```

Open `http://localhost:50188`. Vite proxies `/api` and `/oss` to `http://localhost:10588`.

```bash
make web-check
make web-build
make web-package
```

`make web-package` builds the single-file renderer from this repository, binds it to contract and source digests, and atomically updates `data/web/index.html` and `data/contracts/web-build.json`. Run `make` or `make help` to list the common project commands.

The client follows the repository's Apache-2.0 license and release gates.
