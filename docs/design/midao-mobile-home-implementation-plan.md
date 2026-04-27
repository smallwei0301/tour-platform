# Midao Mobile Home Implementation Plan

## Phase order
1. `MidaoIcon.tsx`
2. `MidaoLogo.tsx`
3. `data/midaoHomeData.ts`
4. `MidaoHeader.tsx`
5. `MidaoHero.tsx`
6. `MidaoSearchPanel.tsx`
7. `MidaoRouteCard.tsx`
8. `MidaoFieldNotes.tsx`
9. `MidaoBottomNav.tsx`
10. `MidaoMobileHome.tsx`

## Data mapping
- Chip 1 → 花蓮溪谷 → `/activities?region=hualien`
- Chip 2 → 高雄探洞 → `/activities?region=kaohsiung`
- Chip 3 → 台北老街 → `/activities?region=taipei`
- Featured route priority: use existing Hualien activity data if available; otherwise pick the best existing route that matches the editorial mood while still using real site data.

## Route mapping
- primary CTA → `/activities`
- secondary CTA → `/guides`
- featured card → existing `/activities/[region]/[slug]`
- bottom nav: `/`, `/activities`, `/guides`, `/me/orders`

## Acceptance flow
- Build one phase at a time
- Take screenshot after each visual phase
- Compare before continuing to next phase
- Do not proceed if the current phase is obviously off-spec
