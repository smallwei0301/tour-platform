# GH-1290 dynamic re-emit UI close-gate: not automatable in local harness

## Why the local browser check is not automatable here

The GH-1290 browser smoke for `/guide/availability` is blocked in this environment by `LOCAL_BROWSER_RESOURCE_BLOCKED`:

- The local browser harness exceeds the available inotify watch limit while loading the web app.
- The local preview path also hits IPv6 localhost binding/routing instability.

Because those are host-resource/browser-harness failures rather than product failures, the browser acceptance check should be treated as a manual/preview close-gate instead of a local automated test in this worktree.

## Alternate close-gate after owner-approved migration apply

Owner approval is required before applying the production/preview migration. After the migration is applied, run the close-gate against the Vercel preview on `/guide/availability`:

1. As a guide, create or edit an availability rule with:
   - Dynamic re-emit: ON
   - Buffer after: 30 minutes
   - A window that includes a 09:00 booking and room for a 10:30 re-emitted slot
2. Confirm API persistence for the rule returns `use_dynamic_reemit: true`.
3. With a confirmed 09:00-10:00 booking, verify the guide preview re-emits the next available slot at 10:30.
4. Verify traveler `/booking` availability shows parity with the guide preview for the same activity/rule/day.

## Gate order

1. Owner approves migration apply.
2. Apply migration to the preview/target Supabase project.
3. Run the Vercel preview smoke above on `/guide/availability` and traveler `/booking`.
4. Close only after API persistence is true and both guide/traveler surfaces show the expected 10:30 dynamic re-emit parity.
