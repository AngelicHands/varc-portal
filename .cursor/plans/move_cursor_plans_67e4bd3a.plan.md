---
name: Move Cursor plans
overview: Move this repo’s Cursor plan files from ~/.cursor/plans into varc-portal/.cursor/plans and track them in git. Leave other projects’ plans in the global folder.
todos:
  - id: mkdir-plans
    content: Create varc-portal/.cursor/plans/
    status: completed
  - id: mv-varc-plans
    content: Move the 10 VARC .plan.md files from ~/.cursor/plans into the repo folder
    status: completed
  - id: verify
    content: Confirm those files exist in the repo and are gone from the global folder; other plans untouched
    status: completed
isProject: false
---

# Move VARC Cursor plans into the repo

Cursor currently stores all plans globally in [`/Users/hai.tran/.cursor/plans/`](/Users/hai.tran/.cursor/plans/). This project has none under [`.cursor/plans/`](.cursor/plans/) yet. Destination is **[`/Users/hai.tran/Working/repositories/varc-portal/.cursor/plans/`](.cursor/plans/)** (Cursor also reads workspace plans from there). They will be **committed** so the team can share them.

## Files to move (this project only)

From `~/.cursor/plans/` → `varc-portal/.cursor/plans/`:

- [`backup_restore_check_a59d5ad7.plan.md`](/Users/hai.tran/.cursor/plans/backup_restore_check_a59d5ad7.plan.md) (current backup/restore plan)
- [`varc_cms_plan_775a3528.plan.md`](/Users/hai.tran/.cursor/plans/varc_cms_plan_775a3528.plan.md)
- [`argocd_on-demand_deploy_79f9e32b.plan.md`](/Users/hai.tran/.cursor/plans/argocd_on-demand_deploy_79f9e32b.plan.md)
- [`namespace_varc_manifests_f51c1776.plan.md`](/Users/hai.tran/.cursor/plans/namespace_varc_manifests_f51c1776.plan.md)
- [`media_upload_storage_e8166143.plan.md`](/Users/hai.tran/.cursor/plans/media_upload_storage_e8166143.plan.md)
- [`valkey_cms_cache_c16e459c.plan.md`](/Users/hai.tran/.cursor/plans/valkey_cms_cache_c16e459c.plan.md)
- [`page_template_builder_5b014233.plan.md`](/Users/hai.tran/.cursor/plans/page_template_builder_5b014233.plan.md)
- [`admin_form_builder_b48e3ee7.plan.md`](/Users/hai.tran/.cursor/plans/admin_form_builder_b48e3ee7.plan.md)
- [`home_page_redesign_7bcb9e27.plan.md`](/Users/hai.tran/.cursor/plans/home_page_redesign_7bcb9e27.plan.md)
- [`disable_x-powered-by_98329f34.plan.md`](/Users/hai.tran/.cursor/plans/disable_x-powered-by_98329f34.plan.md)

Use `mv` (not copy) so the global folder is not left with duplicates.

## Leave in `~/.cursor/plans/`

Plans for other repos (ClassQ, exam platform, gateway VMs, generic backup-restore workers, Redis session cache, etc.). Do not move agent transcripts, terminals, or canvases.

## Git

- Do **not** add `.cursor/plans/` to `.gitignore`.
- Do **not** commit until you ask — after the move, files are untracked until a later commit request.

## Note

The open backup/restore plan will live at `.cursor/plans/backup_restore_check_a59d5ad7.plan.md` after the move. Cursor should pick it up from the workspace; if the Plan UI still points at the old global path, reopen it from the project folder.
