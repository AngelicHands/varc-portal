---
name: Admin Form Builder
overview: Add a CMS-managed form builder with configurable fields, page/template embedding via a new block type, public submission handling, and an admin submissions inbox.
todos:
  - id: form-models
    content: Define `FormDefinition` and `FormSubmission` models plus validation schemas
    status: completed
  - id: admin-forms-ui
    content: Add admin forms list/editor screens and navigation entry
    status: completed
  - id: block-embed
    content: Extend block schema/builder/renderer with `formEmbed`
    status: completed
  - id: submit-flow
    content: Add public submission endpoint with validation and persistence
    status: completed
  - id: review-inbox
    content: Add admin submissions list/detail views and basic status management
    status: completed
  - id: verification
    content: Add focused validation/render/submit verification for the first release
    status: completed
isProject: false
---

# Admin Form Builder

## Goal
Add a new CMS feature where admins can create reusable forms with configurable fields, place them into pages/templates via the existing block system, and collect submissions in MongoDB for review in admin.

## Why This Shape Fits
The current portal already has a structured page layout pipeline based on blocks and templates, while rich-text page content is sanitized and not suitable for live form embeds.

Key extension points:
- `[src/lib/blocks/types.ts](/Users/hai.tran/Working/repositories/varc-portal/src/lib/blocks/types.ts)` defines block types and block `source/settings` schema.
- `[src/components/admin/page-editor.tsx](/Users/hai.tran/Working/repositories/varc-portal/src/components/admin/page-editor.tsx)` and the template builder already let editors customize page layouts.
- `[src/lib/blocks/resolve.ts](/Users/hai.tran/Working/repositories/varc-portal/src/lib/blocks/resolve.ts)` and `[src/components/portal/blocks/template-layout-renderer.tsx](/Users/hai.tran/Working/repositories/varc-portal/src/components/portal/blocks/template-layout-renderer.tsx)` are where a new block becomes live on public pages.

## Proposed Scope
Build a first version with:
- Reusable `FormDefinition` records in MongoDB.
- Supported field types: short text, long text, email, phone, select, checkbox, radio, date.
- Per-field settings: label, name/key, required, placeholder, help text, options, width.
- Public form rendering through a new `formEmbed` block in page/template layouts.
- Submission persistence in `FormSubmission` records.
- Admin screens for:
  - forms list/create/edit/delete
  - submission list + detail view per form
- Basic anti-abuse protection in the submission route: honeypot + simple server-side rate limit hook point.

## Data Model
Add new models:
- `[src/models/FormDefinition.ts](/Users/hai.tran/Working/repositories/varc-portal/src/models/FormDefinition.ts)`
  - `name`
  - `slug` or stable `key`
  - `description`
  - `status` (`draft|published`)
  - `submitLabel`
  - `successMessage`
  - `fields[]`
  - timestamps / soft-delete if desired to match CMS patterns
- `[src/models/FormSubmission.ts](/Users/hai.tran/Working/repositories/varc-portal/src/models/FormSubmission.ts)`
  - `formId`
  - `formNameSnapshot`
  - `payload` (normalized key/value map)
  - request metadata (`createdAt`, `ipHash` or redacted IP, `userAgent`, `pagePath` if available)
  - `status` (`new|reviewed|archived`)

Add Zod-backed schemas near existing validations, likely in `[src/lib/validations/article.ts](/Users/hai.tran/Working/repositories/varc-portal/src/lib/validations/article.ts)` or a new dedicated forms validation module.

## Admin UX
Add a new admin area, parallel to pages/articles/categories:
- routes under `src/app/admin/(dashboard)/forms/`
- editor component similar in shape to page/template editors
- field builder UI for add/reorder/edit/remove field definitions

Likely files:
- new list page
- new `[id]/page.tsx`
- new `new/page.tsx`
- new editor component under `src/components/admin/`

Also add navigation entry in the admin layout so forms are discoverable.

## Public Render + Submit Flow
1. Admin creates a form definition.
2. Editor adds a `formEmbed` block to a page/template layout and selects the form.
3. Public page render resolves the block to the selected form definition.
4. Renderer outputs a real HTML form component.
5. Submit posts to a new server endpoint or server action.
6. Server validates against the saved form schema, stores a `FormSubmission`, and returns success/error state.

A clean first route is a public POST endpoint such as:
- `[src/app/api/forms/[id]/submit/route.ts](/Users/hai.tran/Working/repositories/varc-portal/src/app/api/forms/[id]/submit/route.ts)`

This keeps public submissions decoupled from admin-only server actions and easier to evolve later.

## Block System Changes
Extend the existing block system with a new type:
- add `formEmbed` to `[src/lib/blocks/types.ts](/Users/hai.tran/Working/repositories/varc-portal/src/lib/blocks/types.ts)`
- extend block `source` with `formId` (and optionally locale text overrides)
- add label/palette entry in `[src/lib/blocks/labels.ts](/Users/hai.tran/Working/repositories/varc-portal/src/lib/blocks/labels.ts)`
- add builder controls in the template/page layout editor to choose a form
- resolve selected form data in `[src/lib/blocks/resolve.ts](/Users/hai.tran/Working/repositories/varc-portal/src/lib/blocks/resolve.ts)`
- render the block in `[src/components/portal/blocks/template-layout-renderer.tsx](/Users/hai.tran/Working/repositories/varc-portal/src/components/portal/blocks/template-layout-renderer.tsx)`

This avoids building a separate shortcode parser and stays aligned with the current page architecture.

## Permissions, Caching, and Ops
- Reuse existing article/site management permission patterns in `[src/lib/actions.ts](/Users/hai.tran/Working/repositories/varc-portal/src/lib/actions.ts)` and role helpers.
- Add cache invalidation for published form definitions if they are cached for public rendering.
- Ensure admin edit screens read live Mongo data, not public snapshots.
- Keep submission data out of public cache paths entirely.

## Testing / Verification
Plan for focused checks:
- schema validation for form definitions and submission payload normalization
- submit success path for a published form
- reject invalid/missing required fields
- verify `formEmbed` block renders correctly in a page layout
- verify admin can review stored submissions

## Rollout Notes
First version should intentionally skip advanced workflow features like notifications, CSV export, conditional logic, file uploads, and multi-step forms. The plan should keep room for those later by using structured field schemas and a dedicated submission model now.

```13:27:src/lib/blocks/types.ts
export const BLOCK_TYPES = [
  "richText",
  "pageContent",
  "heading",
  // ...
  "featuredSlider",
] as const;
```

That block registry is the natural insertion point for `formEmbed`, rather than building shortcode parsing into sanitized rich-text content.