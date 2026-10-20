# Learning Studio

A Cloudflare Workers learning authoring application. The project includes a secure administrator login, visual page/block editing, image uploads, Microsoft Stream embeds, draft/published courses, and **optional** quiz blocks. A quiz can be placed anywhere and never blocks learner progress.

## Status

Application files are committed. **Not deployed yet.** Cloudflare D1 database and Worker secrets must be configured first.

## Cloudflare setup

1. In Cloudflare, create a D1 database named `learning-studio-db`.
2. Copy its **database ID** into the `database_id` field of `wrangler.toml`. Do not change the `binding = "DB"` line.
3. Run the included `schema.sql` on that D1 database (via Cloudflare D1 console, or `npm run db:remote` in Wrangler).
4. Configure the Cloudflare Worker secrets `ADMIN_PASSWORD` (strong unique administrator password) and `SESSION_SECRET` (long random secret). Never commit passwords or tokens to GitHub.
5. Deploy Worker using `npm install && npm run deploy` or connect GitHub automatic deployment after setting Cloudflare credentials.

## GitHub automated deployment

The recommended GitHub Actions workflow uses secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Configure those in GitHub Actions before enabling deployment; otherwise CI will fail. After the first working deployment, ordinary code changes can flow directly from GitHub to Cloudflare.

## Development

`npm install`
`npm run dev`

Local D1 schema initialisation: `npm run db:local`.

## Security and limitations

- Administrator authentication relies on Worker secrets. Cookies are Secure, HttpOnly and SameSite=Strict.
- Public GitHub repository contains **no passwords** and the learning authoring functions require an admin session.
- Published learner packages are publicly accessible by default; only embed Stream videos users already have permission to view.
- Uploaded images are stored as small data URIs inside course JSON (600 KB per image), so avoid large images.
- This is an initial version, not production security-audited, nor fully accessibility-tested.
- Knowledge checks are optional one-question blocks with feedback, not formal scored assessments.

