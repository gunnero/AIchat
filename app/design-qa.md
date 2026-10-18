# Design QA — option 1 prototype

## Approved monochrome revision — 18 October 2026

The client approved the project with one change: black-and-white colors. This replaces the original palette; the historical comparison below documents the earlier layout implementation.

- Replaced chromatic colors across customer/admin views, sharing, usage, feedback, hover/selected/disabled states, overlays and focus indicators. The supplied logo displays in grayscale; its original file is preserved.
- Kept the existing layout, typography, content and interaction logic. Status meanings remain explicit in text, independent of color.
- Reviewed [desktop](../docs/screenshots/monochrome-desktop.png), [sharing with keyboard focus](../docs/screenshots/monochrome-share.png), [admin](../docs/screenshots/monochrome-admin.png) and [mobile](../docs/screenshots/monochrome-mobile.png). The usage dialog's progress fill is black on a light track; sidebar progress stays light on a dark track.
- Principal text contrast is at least 4.74:1; control border/white contrast is 3.69:1. See the updated design-system table.
- Lint, typecheck and the existing 14 behavior tests passed. No new tests are needed for this palette-only change.
- Desktop (1487 × 1058) and mobile (390 × 844) rendered without horizontal page overflow. Sharing checkbox keyboard focus remained visible; the browser reported no console warnings/errors.

## Original option 1 verification — 16 October 2026

Date: 16 October 2026. final result: passed

## Evidence and matching state

- Source visual truth: [selected option 1](../assets/ai-kundetypeassistent-selected-concept.png).
- Implementation: [desktop capture](../docs/screenshots/desktop.png), local in-app browser at http://127.0.0.1:4173/.
- Both reference and final desktop capture: 1487 × 1058 pixels, CSS viewport 1487 × 1058, device pixel ratio 1. No density resampling before comparison.
- State: initial private welcome-email conversation, standard plan, 180/300 remaining, no modal or streamed request.
- [Full-view comparison](../docs/screenshots/comparison-final.png): source and implementation in the same 2974 × 1100 composite, with 42px labels above the original-size views.
- [Focused conversation comparison](../docs/screenshots/comparison-detail.png): identical x=330, y=100, width=1157, height=690 regions, side by side at original density. This makes typography, bubbles, logo and copy controls readable.
- [First comparison](../docs/screenshots/comparison-first.png), [tablet](../docs/screenshots/tablet.png), [mobile](../docs/screenshots/mobile.png), [mobile sharing](../docs/screenshots/mobile-share.png), [admin](../docs/screenshots/admin.png).

The browser panel clipped a larger viewport in viewport-only captures. Full-page captures were used to obtain the complete 1487px layout; DOM width and image dimensions were checked. Initial mobile/tablet captures occurred before paint and were replaced; the saved final evidence contains the rendered app.

## Findings and comparison history

Initial result: blocked pending the following fixes.

| Severity | Finding | Fix and final evidence |
| --- | --- | --- |
| P2 | History rows could create a horizontal scrollbar at the smaller desktop width. | Explicit minimum widths and overflow handling. Final desktop/tablet show contained rows with ellipsis. |
| P2 | The supplied logo's outer black canvas appeared as a dark ring. | Centered and framed the real image with a modest image crop. Final composite shows the green mark without the canvas. |
| P2 | Desktop-authored line breaks produced isolated words on tablet/mobile. | Allow paragraph reflow below 1191px. Tablet and mobile captures show natural wrapping. |
| P2 | Mobile share icon lost its text label when the visual caption was hidden. | Added a persistent accessible label; browser accessibility tree reports “Del med Helle.” |
| P2 | The mobile drawer needed keyboard containment and focus return. | Background content becomes inert; Tab cycles in the drawer, Escape closes and restores the menu opener. Verified with keyboard. |
| P2 | Mobile share confirmation fell below the first dialog viewport. | Reduced the selection viewport at mobile sizes. The final 390 × 844 capture shows both action buttons. |

After these changes, the reference and final desktop images were opened together in the full and focused comparisons above. No actionable P0/P1/P2 visual findings remain.

## Required fidelity surfaces

- **Fonts/typography:** self-hosted Source Sans 3 closely matches the reference's humanist forms, hierarchy and density. Body/heading weight and wrapping checked in the focused composite. Smaller viewports deliberately reflow paragraph text.
- **Spacing/layout:** 330px sidebar, 102px header, avatar/text alignment, message spacing, bottom allowance and composer follow the reference. Small single-digit-pixel differences do not alter hierarchy. Tablet/mobile use responsive arrangements because no corresponding source mock was supplied.
- **Colors/tokens:** evergreen, warm cream and sage match the reference direction. Solid tokens replace the slight generated-image texture. Principal text contrast ratios are documented in docs/design-system.md.
- **Images/icons:** the actual supplied raster logo is used, never redrawn. Phosphor outline icons are consistent throughout. Customer initials match the mock's text treatment. No placeholder illustrations or fabricated SVG assets.
- **Copy/content:** initial Danish conversation matches the chosen design. Added demo disclosure, error/empty/usage/admin states are intentional extensions of the task. Mock prices are explicitly illustrative; no live-service claim is made.

## Interaction verification

Browser-rendered checks covered:

- Existing history selection; new-conversation suggestion; send, streamed completion and allowance decrement.
- Slow-response wait and stop; cancellation restored the interface and left allowance unchanged.
- Copy action displayed success.
- Selected-message sharing: deselected the customer message, confirmed only the assistant message, opened that copy in the admin inbox, then revoked it.
- Administrator overview contains account metadata and no unshared chat titles.
- Changed Sofie's package to Plus and paused access; the customer view showed 880/1000 remaining and disabled generation.
- Native dialogs, Escape behavior, mobile drawer Tab/Shift+Tab cycle and focus return.
- Layouts at 1487 × 1058, 1280 × 720, 820 × 1180, 390 × 844 and 320 × 740. Checked body width and composer visibility; no horizontal page overflow.
- Browser console error/warning query returned an empty list during the completed interaction run.

Automated tests additionally cover failed-reply draft recovery/retry, allowance exhaustion, duplicate and new invitations, immutable/revoked snapshots, complete streamed text, and literal untrusted-HTML rendering.

## Follow-up polish and limits

- P3: replace the small source logo with a higher-resolution original when available.
- P3: generated-reference icon proportions and font rasterization vary slightly from the selected real library/font.
- No physical-device software keyboard or comprehensive assistive-technology audit was run.
- The mock speed is not evidence of real OpenAI latency. Frontend privacy states do not prove backend authorization. Authentication, storage isolation and GDPR operations remain later milestones.

## Implementation checklist

- [x] Match the selected desktop design and inspect full/focused comparisons.
- [x] Fix all identified P0/P1/P2 issues and recapture.
- [x] Verify responsive controls and primary interactions.
- [x] Check browser errors and document honest limitations.
- [x] Keep a labelled local preview available for review.

final result: passed
