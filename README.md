# Indie Web Starter

A Cloudflare-based IndieWeb starter with:

- `indie-web-starter-backend`: SonicJS headless CMS API (D1 + R2)
- `indie-web-starter-frontend`: Hono + Mustache frontend worker
- template-driven rendering for pages, collection detail pages, and collection archives
- dashboard tools for content editing, feed following, and webmention workflows

This README explains the whole project, with extra focus on editing templates and frontend code.

## 1. Architecture At A Glance

## Runtime shape

- Backend worker runs on port `8788` in local dev.
- Frontend worker runs on port `8787` in local dev.
- Frontend reads content from backend via `API_URL` and (in production) can use a Cloudflare service binding (`API_BACKEND`) for worker-to-worker fetches.

## Key folders

- `indie-web-starter-backend/src/index.ts`: backend app boot + collection registration
- `indie-web-starter-backend/src/collections/*.collection.ts`: collection schema definitions
- `indie-web-starter-backend/src/routes/webmentions.ts`: backend webmention ingest + query API
- `indie-web-starter-frontend/src/index.ts`: frontend app boot + route registration
- `indie-web-starter-frontend/src/routes/*.ts`: frontend routes (pages, collections, dashboard/auth, feed, webmention)
- `indie-web-starter-frontend/src/templates/*`: Mustache HTML templates
- `indie-web-starter-frontend/src/services/required-collections.ts`: template `requiredData` loader
- `indie-web-starter-frontend/src/utils/sonic.ts`: typed content/collection API client

## Rendering model

1. Route fetches content/metadata.
2. Route builds a plain view model object.
3. `render(template, data)` renders template via Mustache.
4. The output is wrapped in the global layout from `src/templates/base.ts`.

## 2. Prerequisites

- Node.js `18+` (Node `20+` recommended)
- npm
- Cloudflare account
- Wrangler CLI (installed per package via dev dependencies)

## 3. First-Time Setup

Run these from repository root.

## 3.1 Backend setup

```bash
cd indie-web-starter-backend
npm install
cp wrangler.jsonc.example wrangler.jsonc
```

Start backend:

```bash
npm run dev
```

Backend will be at `http://localhost:8788`.

## 3.2 Frontend setup

Open another terminal:

```bash
cd indie-web-starter-frontend
npm install
cp wrangler.jsonc.example wrangler.jsonc
npm run dev
```

Frontend will be at `http://localhost:8787`.

`npm run dev` does all of this:

- builds Tailwind CSS to `public/output.css`
- watches CSS changes
- watches/generates template indexes
- runs Wrangler dev server

## 4. Core URLs You’ll Use

Public/frontend:

- `/` home page
- `/:page` page templates (example: `/home` if you add such template)
- `/:collection` collection archive pages (example: `/posts`)
- `/:collection/:slug` collection detail pages
- `/feed` RSS feed
- `/webmention` webmention endpoint

Authenticated/dashboard:

- `/login`
- `/dashboard`
- `/dashboard/:collection`
- `/dashboard/:collection/new`
- `/dashboard/:collection/:id`
- `/dashboard/following`
- `/dashboard/following/feed`
- `/:collection/instructions` (template token helper per collection)

## 5. Frontend Editing Guide (Most Important)

## 5.1 What to edit for visual changes

Global shell/layout:

- `indie-web-starter-frontend/src/templates/base.ts`

Homepage:

- `indie-web-starter-frontend/src/templates/pages/home.ts`

Collection detail templates:

- `indie-web-starter-frontend/src/templates/collections/*.ts`

Collection archive templates:

- `indie-web-starter-frontend/src/templates/collections-archive/*.ts`

Shared dashboard shell fragments:

- `indie-web-starter-frontend/src/templates/dashboard-shell.ts`

Tailwind source:

- `indie-web-starter-frontend/src/styles/input.css`

Generated files (do not hand-edit):

- `src/templates/pages/index.ts`
- `src/templates/collections/index.ts`
- `src/templates/collections-archive/index.ts`
- `src/types/collections.generated.d.ts`
- `src/types/collection-field-kinds.generated.ts`

## 5.2 Mustache data you can use in templates

Common view properties include:

- `title`, `slug`, `status`, `createdAt`, `updatedAt`
- `collection`
- `data` (schema fields for this content item)
- `fields` (generic key/value fallback rendering view)
- `isAuthenticated`, `authUser`
- `collections` (extra collection data injected via `requiredData`)

Webmention-aware detail templates also get:

- `webmentions`
- `webmentionCounts` (`likes`, `reposts`, `replies`, `mentions`)
- `siteAuthorName`, `siteAuthorUrl`

Rich text behavior:

- If a collection field is richtext, frontend creates `data.<fieldName>Html`.
- Render with triple braces, for example: `{{{data.contentHtml}}}`.

## 5.3 Add a new static page template

1. Create file in `src/templates/pages/` (example `about.ts`).
2. Export template constant ending with `Template`:

```ts
export const aboutTemplate = /* html */ `
<section>
  <h1>About</h1>
  <p>My page.</p>
</section>
`;
```

3. Optionally export `requiredData` to preload collection content for that page:

```ts
export const requiredData = {
  collections: [{ name: "blog-posts", sort: "-created_at", limit: 5 }],
};
```

4. The page becomes available at `/:page` where page is filename (`/about`).

No manual route registration needed.

## 5.4 Add or customize a collection detail template

For collection `movie-reviews`, edit/create:

- `src/templates/collections/movie-reviews.ts`

Export must end with `Template` and match auto-index naming convention:

```ts
export const MovieReviewsTemplate = /* html */ `...`;
```

Detail route resolution:

- `/:collection/:slug` uses `collectionTemplates[collection]`
- if missing, falls back to generic `collection-content.ts`

## 5.5 Add or customize a collection archive template

For collection `movie-reviews`, edit/create:

- `src/templates/collections-archive/movie-reviews.ts`

Export should end with `ArchiveTemplate`:

```ts
export const MovieReviewsArchiveTemplate = /* html */ `...`;
```

Archive route (`/:collection`) view model includes:

- `items`
- `totalItems`
- `currentPage`, `totalPages`
- `hasPreviousPage`, `hasNextPage`
- `previousPageUrl`, `nextPageUrl`

If no custom archive template exists, `defaultCollectionArchiveTemplate` is used.

## 5.6 Inject cross-collection data into templates (`requiredData`)

You can add `requiredData` exports in:

- `base.ts` (global)
- page templates (`src/templates/pages/*.ts`)
- collection detail templates (`src/templates/collections/*.ts`)
- collection archive templates (`src/templates/collections-archive/*.ts`)

Format:

```ts
export const requiredData = {
  collections: [
    {
      name: "blog-posts",
      filters: [{ field: "status", operator: "equals", value: "published" }],
      sort: "-created_at",
      limit: 10,
    },
  ],
};
```

Then in Mustache:

- `{{#collections.blog-posts}} ... {{/collections.blog-posts}}`

## 5.7 Styling workflow (Tailwind v4)

- Source CSS: `src/styles/input.css`
- Built output: `public/output.css`
- Frontend layout includes `/output.css` in `base.ts`

During `npm run dev`, CSS rebuild/watch runs automatically.

If needed manually:

```bash
npm run css:build
npm run css:watch
```

## 5.8 Frontend routes map for customization

- `src/routes/pages.ts`: page and archive resolution logic
- `src/routes/collections.ts`: detail page logic, richtext rendering, webmention injection
- `src/routes/content-editor.ts`: custom editor UI + media upload helper endpoint
- `src/routes/feed.ts`: RSS generation and collection aggregation
- `src/routes/auth*.ts`: dashboard/auth/following/feed actions
- `src/routes/webmention.ts`: public webmention endpoint in frontend worker

## 6. Adding A New Collection End-to-End (Backend + Frontend)

## 6.1 Create backend collection schema

Add file in `indie-web-starter-backend/src/collections/`:

`your-collection.collection.ts` with `CollectionConfig` export.

Then register it in:

- `indie-web-starter-backend/src/index.ts`

inside the `registerCollections([...])` array.

## 6.2 Run backend and ensure collection exists

```bash
cd indie-web-starter-backend
npm run dev
```

Verify collection appears:

- `http://localhost:8788/api/collections`

## 6.3 Generate frontend types + template stubs

In frontend package:

```bash
cd indie-web-starter-frontend
npm run collections:typegen
```

This script:

- fetches collections from backend API
- regenerates typed collection mappings
- creates missing detail template stubs in `src/templates/collections/`
- creates missing archive template stubs in `src/templates/collections-archive/`

Note: it excludes system collections:

- `webmentions`
- `trusted-webmention-domains`
- `following-sources`
- `outbound-webmentions`

## 6.4 Style the generated templates

Edit the generated stubs to match your site design and field semantics.

## 6.5 Confirm dashboard editor field controls

`content-editor.ts` uses generated `collection-field-kinds.generated.ts` to build input UI by field type.

After schema changes, rerun:

```bash
npm run collections:typegen
```

so editor controls stay in sync.

## 7. Environment Variables

## Frontend variables

From `indie-web-starter-frontend/wrangler.jsonc.example` and code usage:

- `API_URL`: backend base URL
- `WEBMENTION_ENDPOINT_URL`: backend ingest URL
- `WEBMENTION_ALLOWED_HOSTS`: allowed target host list for webmention endpoint
- `WEBMENTION_SHARED_SECRET`: shared secret used by frontend when forwarding ingest calls
- `SITE_TITLE`, `SITE_DESCRIPTION`: RSS metadata
- `SITE_PROFILE_IMAGE`, `SITE_AUTHOR_IMAGE`, `SITE_LOGO_URL`: RSS image hints
- `SITE_AUTHOR_NAME`, `SITE_AUTHOR_URL`: author metadata in templates
- `SITE_URL`, `PUBLIC_SITE_URL`: host inference for webmention validation
- `ARCHIVE_PAGE_SIZE`: archive pagination page size
- `SONIC_TIMEOUT_MS`: backend request timeout
- `MEDIA_API_URL`: optional separate media API base

## Backend variables

From `indie-web-starter-backend/wrangler.jsonc.example` and code usage:

- `WEBMENTION_SHARED_SECRET`: required to authorize `/api/webmentions/ingest`
- `WEBMENTION_ALLOWED_HOSTS`: allowed frontend host(s) for target URL validation

## Secret setup example

```bash
cd indie-web-starter-backend
npx wrangler secret put WEBMENTION_SHARED_SECRET

cd ../indie-web-starter-frontend
npx wrangler secret put WEBMENTION_SHARED_SECRET
```

Use the same value in both workers.

## 8. Scripts Reference

## Backend scripts

- `npm run dev` start backend worker on `8788`
- `npm run deploy` deploy backend worker
- `npm run db:migrate` apply migrations to remote D1
- `npm run db:migrate:local` apply migrations to local D1
- `npm run db:reset` reset DB via Sonic helper
- `npm run type-check`
- `npm test`

## Frontend scripts

- `npm run dev` full frontend dev stack (css + watchers + wrangler)
- `npm run start` wrangler only
- `npm run deploy` deploy frontend worker
- `npm run templates:index` generate detail templates index
- `npm run pages:index` generate page templates index
- `npm run collections-archive:index` generate archive templates index
- `npm run collections:typegen` fetch schema + generate types/stubs
- `npm run recommended-feeds:generate` regenerate recommended feed snapshot data
- `npm test`

## 9. Tests

Backend:

```bash
cd indie-web-starter-backend
npm test
```

Frontend:

```bash
cd indie-web-starter-frontend
npm test
```

Frontend tests cover routing, template behavior, feed output, and webmention handling.

## 10. Deployment

Deploy backend then frontend (important, because frontend points to backend APIs).

Manual:

```bash
cd indie-web-starter-backend
npm run deploy

cd ../indie-web-starter-frontend
npm run deploy
```

Or from repo root:

```bash
./deploy.sh
```

Also run backend migrations in production as needed:

```bash
cd indie-web-starter-backend
npm run db:migrate
```

## 11. Template Editing Tips

- Prefer editing specific collection templates over generic fallback template.
- Keep route/template names aligned with collection `name` values.
- Use `{{{...}}}` only for trusted HTML fields (`...Html`), not raw user text.
- Keep generated index/type files out of manual edits.
- If template changes seem ignored, check that:
  - watcher is running (`npm run dev`)
  - template export names follow conventions
  - collection slug matches template file name

## 12. Common Troubleshooting

Frontend shows 500 on content pages:

- Confirm backend is running on configured `API_URL`.
- Check backend collections endpoint returns valid data.

New collection not visible in frontend templates/editor:

- Ensure backend collection is registered in backend `src/index.ts`.
- Run `npm run collections:typegen` in frontend.
- Restart frontend dev server if needed.

Webmentions fail with 401/403/422:

- Ensure both workers use same `WEBMENTION_SHARED_SECRET`.
- Verify `WEBMENTION_ALLOWED_HOSTS` includes your frontend hostname.
- Verify target URL shape is exactly `/:collection/:slug`.

Archive pagination not behaving as expected:

- Check `ARCHIVE_PAGE_SIZE` value.
- Ensure status filtering aligns with auth state (drafts visible only for authenticated users).

## 13. Current Content Model Reference

Public-facing collection templates currently exist for:

- `blog-posts`
- `events`
- `movie-reviews`
- `music-reviews`
- `news`
- `outfits`
- `pages`
- `posts`
- `spotify-playlists`
- `outbound-webmentions`

System collections used primarily for workflows:

- `webmentions`
- `trusted-webmention-domains`
- `following-sources`

## 14. Suggested Daily Frontend Workflow

1. Start backend (`8788`) and frontend (`8787`).
2. Edit template file in `src/templates/...`.
3. Refresh page and verify HTML/data bindings.
4. If schema changed, run `npm run collections:typegen`.
5. Run frontend tests before commit.
