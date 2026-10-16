# Option 1 design system

Source: assets/ai-kundetypeassistent-selected-concept.png (1487 × 1058). The supplied logo is used as a real image, circularly framed; it is not redrawn. The original source is small, so a higher-resolution logo remains a polish opportunity.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| Evergreen | #23443e | Sidebar and primary actions |
| Cream | #f4f1e9 | Workspace |
| Sage | #d5deca | Customer message bubbles |
| Sage strong | #8eb983 | Allowance progress |
| Ink | #1d2e37 | Main text |
| Muted | #5f6669 | Secondary copy |
| Paper | #faf9f5 | Composer, forms and dialogs |
| Line | #d7d7cc | Dividers |

Source Sans 3 is self-hosted, with regular 400, semibold 600 and bold 700. Phosphor light/regular icons match the outline style. UI initials are actual text, as in the mockup.

At the reference viewport: sidebar 330px; header 102px; conversation left inset 48px plus 58px avatar and 24px gap; body 21px / 1.38; response heading 33px / 1.2; composer 78px. The sidebar clamps between 280 and 330px. Tablet adjusts typography/spacing. At 760px and below, a focus-contained drawer replaces the persistent sidebar, with a 58px top bar and a compact composer.

## Measured color contrast

WCAG relative-luminance calculation on the actual solid tokens:

| Text / background | Ratio |
| --- | --- |
| Ink / cream | 12.42:1 |
| Muted / cream | 5.18:1 |
| Sidebar white #f5f7f1 / evergreen | 9.89:1 |
| Sidebar secondary #c2d2c7 / evergreen | 6.78:1 |
| Ink / sage | 10.10:1 |
| Evergreen / paper | 10.13:1 |

These principal text pairs exceed 4.5:1. This calculation is not a complete accessibility certification.

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
