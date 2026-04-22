# Issue #12 — Guide Availability Dashboard Gap Audit (Implementation Stage)

## Scope
This audit focuses on DoD alignment for guide availability operations and only closes implementation gaps.

## Acceptance Criteria Mapping

1. **Guide ownership correct across CRUD**
   - Rules API: already enforced on GET/POST/PUT/DELETE via `guide_id = session.guideId`.
   - Blackout API: previously lacked update path; now added `PUT /api/guide/blackout-dates/[blackoutId]` with strict ownership checks.

2. **/guide/availability is fully usable**
   - Existing dashboard shell + CRUD + preview already present.
   - This change adds blackout edit flow to remove a core usability gap.

3. **Weekly fixed availability rule create/edit works**
   - Existing implementation supports rule create/update/delete and remains unchanged.

4. **Blackout single-day/range CRUD works**
   - Added blackout update endpoint + UI edit modal path.
   - Supports both single-day and date-range by editable `starts_at`/`ends_at`.

5. **Preview/downstream consistency after changes**
   - On create/update/delete blackout, UI triggers `loadData()` + `loadPreview()`.

6. **UX complete enough for stable QA**
   - Added explicit edit button for blackout records and modal in update mode.

7. **Guide/admin consistency**
   - Kept guide-side ownership constraints and did not alter admin authority model.

## Non-goals honored
- No architecture rewrite
- No scope expansion into unrelated guide ops
- No scheduling model expansion

## Operational Notes
- Blackout update path is guarded by CSRF + guide session + ownership checks.
- Validation enforces valid datetime and `starts_at < ends_at`.
