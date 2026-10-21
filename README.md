# Learning Studio

A Cloudflare Workers learning authoring application. The project includes a secure administrator login, visual page/block editing, image uploads, Microsoft Stream embeds, draft/published courses, and **optional** quiz blocks. A quiz can be placed anywhere and never blocks learner progress.

## Status

Cloudflare Worker has previously been deployed. Subsequent GitHub commits require a successful Cloudflare build before changes are live. The Review feature is committed but must still be checked on the live site.

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


## Review and feedback (draft collaboration)

The author opens a learning package in Admin and selects **Review & feedback**.

- **Create review link** saves the draft and generates a new 30-day link that can be sent to colleagues. A replacement invalidates any previous review link.
- Reviewers follow the link without an administrator login. They can read the saved draft and add feedback to a whole page or a specific content block. Reviewers cannot edit content.
- Admin can see comments tagged with page/section, filter open/resolved comments, jump to the relevant page and mark comments resolved or reopen them.
- **Disable review link** revokes access but retains feedback for the administrator.
- Preview, review and publishing remain separate. A review link does not publish the course.

The review API creates `review_links` and `review_comments` tables in D1 on first use (using `CREATE TABLE IF NOT EXISTS`); new installations also include these in `schema.sql`.

**Security:** Review links are bearer links. Anyone given the link can read the unpublished draft, and the token must be shared carefully. Tokens are random 256-bit secrets and only their SHA-256 hashes are stored in D1. The review page sends a `Referrer-Policy: no-referrer` header. Do not use review links for sensitive or classified learning content without additional authentication controls. The basic submission cap is not a substitute for robust abuse controls. No file attachments, threaded discussions, reviewer sign-in or email notifications are included in this first version.
