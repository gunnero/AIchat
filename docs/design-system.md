# Option 1 design system

Layout source: assets/ai-kundetypeassistent-selected-concept.png (1487 × 1058). On 18 October 2026, the client approved the project and requested black and white. This palette supersedes the source image's green, cream and sage; layout and typography remain as approved. The supplied logo is circularly framed and displayed with CSS grayscale; its original file is preserved. The original source is small, so a higher-resolution logo remains a polish opportunity.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| Primary | #000000 | Sidebar and primary actions |
| Workspace | #ffffff | Workspace |
| Bubble | #f0f0f0 | Customer message bubbles |
| Progress fill | #eeeeee / #000000 | Light on sidebar; black in usage dialog |
| Ink | #171717 | Main text and explicit error copy |
| Muted | #626262 | Secondary copy |
| Paper | #ffffff | Composer, forms and dialogs |
| Line | #d6d6d6 | Non-interactive dividers |
| Control border | #858585 | Forms, composer and secondary controls |

All states use neutral grays, including hover, selected, disabled, status pills, notifications, backdrops and shadows. Active/invited/suspended statuses retain their text labels. Keyboard focus uses a dark ring on light surfaces and a white ring on the sidebar/mobile header; checkboxes and radio controls use a black accent.

Source Sans 3 is self-hosted, with regular 400, semibold 600 and bold 700. Phosphor light/regular icons match the outline style. UI initials are actual text, as in the mockup.

At the reference viewport: sidebar 330px; header 102px; conversation left inset 48px plus 58px avatar and 24px gap; body 21px / 1.38; response heading 33px / 1.2; composer 78px. The sidebar clamps between 280 and 330px. Tablet adjusts typography/spacing. At 760px and below, a focus-contained drawer replaces the persistent sidebar, with a 58px top bar and a compact composer.

## Measured color contrast

WCAG relative-luminance calculation on the actual solid tokens:

| Text / background | Ratio |
| --- | --- |
| Ink / white | 17.93:1 |
| Muted / white | 6.10:1 |
| Sidebar white / black | 21.00:1 |
| Sidebar secondary #c7c7c7 / black | 12.42:1 |
| Ink / message bubble | 15.73:1 |
| Placeholder #737373 / composer | 4.74:1 |
| Notice text #383838 / #f0f0f0 | 10.29:1 |
| Control border / white | 3.69:1 |

These principal text pairs exceed 4.5:1; control boundaries exceed 3:1. This calculation is not a complete accessibility certification.

## Components and states

- Primary, secondary, icon, share and new-chat buttons: hover, keyboard focus and disabled states. Send is disabled for empty input, exhausted allowance or paused access.
- Composer: labelled textarea, focused border, capped input, Enter send / Shift+Enter newline, IME composition protection and stop while streaming.
- History: selected state, truncation without horizontal overflow, per-conversation draft and an empty view with suggestions.
- Status: waiting, streaming, completed, cancelled, failure with retained draft, exhausted allowance and paused/expired access.
- Forms: native labels, required/email/date/number validation, duplicate-email error and confirmation feedback.
- Sharing: exact message selection, recipient explanation, preview, confirmed copy and revocation.
- Dialogs: native modal focus trapping, close control and Escape; mobile drawer traps focus and restores its opener.
- Reduced motion: transition suppression; no decorative animations.

The extra demo label and explanatory states are intentional. Prices and access controls are clearly simulated. The original attachment icon opens an explanation because customer file uploads are a later optional task.
