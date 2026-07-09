# Design System

Direction: **minimalist, Apple-styled**. Calm, spacious, confident. The product handles fragile moments, so the UI must feel safe, quiet, and unhurried — generous whitespace, soft depth, no visual noise. Spend boldness in one place (the serif display + a single accent); keep everything else disciplined.

## Palette

Anchored to the brand from tryhovio.com (theme-color `#1C5C32` confirmed live).

| Token            | Hex       | Use                                   |
|------------------|-----------|---------------------------------------|
| `forest`         | `#1C5C32` | Primary — buttons, links, active state|
| `forest-deep`    | `#143F23` | Hover/pressed, dark accents           |
| `forest-tint`    | `#E7EFE9` | Subtle fills, selected rows           |
| `cream`          | `#FBF9F4` | App background                         |
| `paper`          | `#FFFFFF` | Cards, surfaces                       |
| `ink`            | `#1A1C1A` | Primary text                          |
| `ink-soft`       | `#5B615C` | Secondary text                        |
| `line`           | `#E8E5DD` | Hairline borders, dividers            |
| `success`        | `#1C5C32` | (reuse forest)                        |
| `warning`        | `#B8860B` | Caution states                        |
| `danger`         | `#B23A3A` | Errors only (never for crisis CTAs — see below) |

> If the live CSS exposes more exact tokens, replace these. Derive a 50–900 tint/shade scale from `forest` for Tailwind.

### Joy / accent palette (warm, used sparingly)

Forest is the only fully-saturated brand color and is reserved for **primary actions, brand, and active state**. These soft accents exist so the product feels **warm and human, not clinical** — a person using Hovio should not feel like "a patient." They are used as **gentle card-tint backgrounds, tags, and icon chips with dark `ink` text on top** (all pass AA). Use **3–4 at once, max** — color-coding distinct widgets — never a rainbow.

| Token             | Soft bg   | Deeper accent | Suggested use            |
|-------------------|-----------|---------------|--------------------------|
| `accent-sage`     | `#DCEDE2` | `#7FB59A`     | bridges to forest; calm  |
| `accent-sky`      | `#DCEAF2` | `#8FB8D4`     | sessions / informational |
| `accent-lavender` | `#ECE6F7` | `#B7A6E0`     | calendar / scheduling    |
| `accent-apricot`  | `#FBE3D0` | `#E8A87C`     | reminders / activity      |
| `accent-butter`   | `#F8EDC8` | `#E6C65C`     | grounding / highlights   |
| `accent-blush`    | `#F8DEE4` | `#E1A7B5`     | upcoming / warmth        |

Rules: accents are **desaturated and quiet** — never compete with forest; never used for primary CTAs; never for error/crisis. Pair each accent's soft bg with `ink`/`ink-soft` text and, where needed, its deeper variant for a small icon or tag. Keep large surfaces on `cream`/`paper`; let accents punctuate, not dominate.

**Crisis UI is visually distinct and never alarmist:** calm, clear, high-contrast, always-reachable. It uses its own restrained treatment (see `safety-and-privacy.md`), not the generic `danger` red, so it reads as *support*, not *error*.

## Typography

- **Display / headlines:** **Instrument Serif** — used with restraint, for hero lines and section titles only.
- **Body / UI:** **Inter** — everything else.
- Type scale (rem): 0.75 / 0.875 / 1 / 1.125 / 1.25 / 1.5 / 2 / 2.75 / 3.5. Tight leading on display, comfortable (1.6) on body. Sentence case everywhere.

## Spacing, radius, depth

- 4px base grid. Generous section padding (mobile 24px, desktop 64–96px).
- Radius: `sm 8` / `md 12` / `lg 16` / `xl 24` / `full`. Default cards `lg`.
- Shadows: soft and low — `0 1px 2px rgba(20,28,20,.04), 0 8px 24px rgba(20,28,20,.06)`. No hard drop shadows.
- Borders are hairlines (`line`), 1px.

## Components (build a small, consistent kit)

Button (primary/secondary/ghost/quiet), Input/Textarea/Select, Card, Sheet/Modal, Tabs, Avatar, Badge/Pill, Toast, Empty state, Skeleton/Loading, Nav (sidebar on desktop, bottom tab bar on mobile), the always-present **Crisis button**, and the chat **message bubble**. All keyboard-accessible with visible focus rings (`forest` at 2px offset).

## Motion

Three libraries, each with a clear job — do not let motion read as "AI-generated":
- **Lenis** — smooth scroll on long/marketing-ish surfaces (welcome page, onboarding). Disabled where it would fight native scroll (chat, dashboards).
- **GSAP + ScrollTrigger** — orchestrated reveals on the welcome page and onboarding only.
- **Motion** — component-level micro-interactions: page transitions, list stagger, button/press feedback, sheet/modal springs. Springs over linear easings; durations 150–350ms.
- **`prefers-reduced-motion` is respected globally** — all of the above degrade to instant/opacity-only.

## Responsiveness

Mobile-first. Breakpoints `sm 640 / md 768 / lg 1024 / xl 1280`. Dashboard nav: **bottom tab bar on mobile**, **sidebar on ≥lg**. Chat fills the viewport on mobile with a sticky composer. Never require horizontal scroll. Tap targets ≥44px.

## Copy voice

Plain, warm, calm, never clinical, never salesy. Name things by what the person controls ("Start a session", "Book a therapist"), not by system internals. Errors explain what happened and how to fix it, in the interface's voice — never apologetic, never vague. Empty states invite the next action.

## Apple-minimal cues to lean on

Layered translucency used sparingly (no heavy glassmorphism), restrained color, big readable type, content-first layouts, motion that feels physical, and obvious affordances. When in doubt, remove one thing.

## Profile Card Design Guidelines ("Dream Design")

When designing therapist profiles, seeker profiles, or matched cards, always implement the following design pattern:
- **Gradient Backgrounds**: Use a vibrant green gradient mesh (incorporating Hovio's forest green `#1C5C32`) with a subtle noise/grain pattern.
- **Glassmorphic Cards**: Translucent outlined buttons, white text, and glass backgrounds over full gradients.
- **Circular Overlapping Avatar**: A circular avatar overlapping a top header banner.
- **Arrow CTA Button**: Full-width pill-shaped buttons at the bottom of the card containing a circular arrow icon on the left and centered action text.
- **Typography**: Keep Instrument Serif (`font-display`) headings at `font-normal` weight.

