# ActionHub

ActionHub is a Vite + React + TypeScript app for previewing Spine assets and exporting animations to video or image sequences.

## Requirements
- Node.js (LTS recommended)

## Quick Start
1. Install dependencies:
   `npm install`
2. Configure API key (if required by the app):
   - Create `.env.local` and set `GEMINI_API_KEY=...`
3. Run the dev server:
   `npm run dev`

## Scripts
- `npm run dev`: start the local dev server.
- `npm run build`: build a production bundle into `dist/`.
- `npm run preview`: serve the production build locally.

## Project Structure
- `index.html`, `index.tsx`: app entry points.
- `App.tsx`: main app shell and state orchestration.
- `components/`: UI panels and layout components.
- `services/`: export pipeline, renderers, encoders, and helpers.
- `constants.ts`, `types.ts`: shared defaults and TypeScript types.
- `public/`: static assets.

## Asset Standards (ActionHub)
The ActionHub standards and schemas live under `docs/actionhub/`:
- Naming and directory rules: `docs/actionhub/standards/naming_rules.md`
- UE batch checklist: `docs/actionhub/standards/ue_batch_checklist.md`
- UE view profiles: `docs/actionhub/standards/ue_view_profiles.md`
- Metadata schema: `docs/actionhub/schemas/metadata_schema.json`
- Events dictionary: `docs/actionhub/schemas/events_dictionary.json`

## Notes
- No automated test framework is configured yet.
- Keep secrets out of the repo; use `.env.local` for local configuration.
