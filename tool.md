# Tool Index

Last updated: 2026-04-15

## Vercel
- Token source: `.env`
- Env key: `VERCEL_TOKEN`
- Project metadata: `.vercel/project.json`
  - projectName: `tour-platform`
  - projectId: `prj_KrrA4UrpyZtEfsQZeSHUJ5zaw4Re`

## Supabase
- Linked project ref: `supabase/.temp/project-ref`
  - ref: `pyoderxmpeyqjwkeliiu`
- CLI config: `supabase/config.toml`

## Usage notes
- Load token before CLI call:
  - `set -a; source .env; set +a`
- Example:
  - `vercel whoami --token "$VERCEL_TOKEN"`
