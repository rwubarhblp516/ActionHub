# Repository Guidelines

## Project Structure & Module Organization
- `index.html`, `index.tsx`: app entry and React bootstrap.
- `App.tsx`: main application shell and high-level state.
- `components/`: UI building blocks (panels, layout, preview, progress).
- `services/`: export pipeline, Spine loading/rendering, recording, encoding.
- `public/`: static assets served by Vite.
- `constants.ts`, `types.ts`: shared defaults and TypeScript types.
- `docs/actionhub/standards/`: asset naming, view profiles, and UE batch checklist.
- `docs/actionhub/schemas/`: ActionHub metadata schema and event dictionary.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: start the Vite dev server for local development.
- `npm run build`: create a production build in `dist/`.
- `npm run preview`: serve the built app locally for verification.

## Coding Style & Naming Conventions
- Language: TypeScript + React (functional components with hooks).
- Indentation: 2 spaces, single quotes, trailing commas where useful.
- Naming: PascalCase for components (`ExportPanel`), camelCase for functions/vars (`processExportQueue`), UPPER_SNAKE for constants (`DEFAULT_CONFIG`).
- No dedicated formatter or linter is configured; follow existing file style.

## Testing Guidelines
- No automated test framework is present in the repo.
- If you add tests, document the framework and add a script (e.g., `npm test`).

## Commit & Pull Request Guidelines
- Commit history mixes plain messages and `feat:` prefixes; there is no strict convention.
- Prefer concise, imperative summaries (e.g., "Improve export flow").
- PRs should describe the change, include steps to validate, and add screenshots for UI updates.

## Security & Configuration Tips
- Local config: set `GEMINI_API_KEY` in `.env.local` as described in `README.md`.
- Avoid committing secrets or generated media exports.

*所有对话/注释/回复，请用中文*
