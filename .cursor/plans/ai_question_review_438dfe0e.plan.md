---
name: ai question review
overview: Add a setup-admin-only AI review flow for questions that calls the configured provider, applies suggested edits back into the open question form, and records an internal note when AI-based changes are saved.
todos:
  - id: model-and-notes
    content: Add internal question notes plus AI review endpoint request/response shape in backend quiz models and handlers.
    status: completed
  - id: provider-integration
    content: Implement provider selection and short structured AI review call using OpenAI-first fallback to Cursor.
    status: completed
  - id: modal-apply-flow
    content: Wire the question modal button to call the backend and apply AI suggestions into the current unsaved form.
    status: completed
  - id: save-note-and-verify
    content: Append the AI-update note on save when AI-suggested content was applied, then verify with build/tests.
    status: completed
isProject: false
---

# AI Question Review Plan
## Scope
Implement the `Review by AI` button in the question modal so setup admins can request a short AI review of the current question draft. The backend will prefer `OpenAI` when both credentials exist, otherwise fall back to `Cursor`, and will reject the action when no supported credential is configured.

## Backend
- Extend the quiz question model in [backend/internal/quiz/models.go](/Users/hai.tran/Working/repositories/classqIO/backend/internal/quiz/models.go) with an internal `notes` field for question-level notes, alongside the already-added `ai_reviewed` flags.
- Add a dedicated admin quiz endpoint in [backend/internal/quiz/handler.go](/Users/hai.tran/Working/repositories/classqIO/backend/internal/quiz/handler.go) for `Review by AI` that:
  - requires setup admin
  - requires `AI_INTEGRATION_ENABLED=true`
  - requires the AI question-analysis switch to be enabled
  - accepts the in-memory question draft: prompt, answers, correct-answer state, explanation, source, and current notes
- Add provider-calling logic in the quiz store/service layer (likely [backend/internal/quiz/questions.go](/Users/hai.tran/Working/repositories/classqIO/backend/internal/quiz/questions.go) or a new focused helper file under `backend/internal/quiz/`) that:
  - chooses provider by credential availability: OpenAI first, then Cursor
  - builds a short-output prompt requesting concise structured suggestions only
  - parses a minimal JSON response containing suggested replacements for prompt / explanation / source / answers and an indication of whether anything changed
- Reuse the existing encrypted AI credentials from [backend/internal/users/settings.go](/Users/hai.tran/Working/repositories/classqIO/backend/internal/users/settings.go); do not expose plaintext credentials in responses.
- On normal question save, if the form contains accepted AI-suggested changes, append an internal note such as `Updated based on AI suggestion` into the new question `notes` field before persisting.

## Frontend
- Update the question modal in [frontend/src/views/ContentManagementView.vue](/Users/hai.tran/Working/repositories/classqIO/frontend/src/views/ContentManagementView.vue) so the setup-admin-only `Review by AI` button:
  - calls the new backend endpoint with the current unsaved form draft
  - shows loading / error feedback
  - if the AI returns changes, patches the open form state in place (question text, answers, explanation, source, and `ai_reviewed` flags) so the user can review and save manually
  - tracks whether the current draft contains AI-suggested content so save can attach the internal note
- Keep the button UI-only for setup admins, but rely on the backend as the true permission gate.
- Add any needed localized strings in [frontend/src/i18n/locales/en-US.json](/Users/hai.tran/Working/repositories/classqIO/frontend/src/i18n/locales/en-US.json) and [frontend/src/i18n/locales/vi.json](/Users/hai.tran/Working/repositories/classqIO/frontend/src/i18n/locales/vi.json).

## Suggested Response Contract
Use a compact JSON result from the AI provider, for example:

```json
{
  "changed": true,
  "prompt": "...",
  "explanation": "...",
  "source": "...",
  "answers": [
    { "id": "a1", "text": "...", "is_correct": true },
    { "id": "a2", "text": "...", "is_correct": false }
  ],
  "summary": "Short one-line review summary"
}
```

This keeps the provider response short and makes frontend form replacement deterministic.

## Verification
- Backend compile/tests around quiz/admin handlers and provider selection logic.
- Frontend build plus a manual modal check that:
  - non-setup-admins never see the button
  - setup admins can click it only when AI integration + option are enabled
  - returned AI suggestions update the open form without auto-saving
  - saving afterward appends the internal AI-update note.
