# Preflight — Brand Identity & UI Direction

Version 1.0 · Product design brief · November 2026

## 1. Brand foundation

**Name:** Preflight  
**Descriptor:** Email health, verified.  
**Product category:** Email authentication and deliverability hygiene.  
**Promise:** Test the real setup, understand the evidence, fix issues safely, and catch regressions early.

### Positioning
Preflight is the calm, technically rigorous copilot between an email-sending platform and a campaign launch. It is not a spam-score fortune teller. It is an evidence-led operations tool for founders, lifecycle marketers, agencies and email infrastructure teams.

### Personality
- Precise, not intimidating.
- Calm under pressure.
- Technical but plain-spoken.
- Honest about uncertainty.
- Practical and quietly confident.

### Voice
Use short, direct sentences. Name the protocol and explain the consequence. Distinguish observed facts from recommendations. Prefer “We found two SPF records” over “Your email setup is broken.” Prefer “Not checked yet” over a false green status. Avoid hype, urgency theatre and AI jargon.

**Approved product line:** “Preflight tests your real email setup, helps you fix it step by step, and alerts you when it changes.”

## 2. Visual concept

A modern technical instrument panel with the restraint of a well-designed editorial publication. The visual metaphor is a pre-flight checklist: clear sequence, explicit status, legible evidence, no decorative cockpit cosplay. The interface should feel like dependable infrastructure software, not a generic AI startup template.

The dashboard starter in `apps/web/src` establishes the initial direction: warm-cool near-white canvas, deep ink typography, muted green for verified states, restrained amber for attention, hairline dividers, compact technical metadata, a fixed navigation rail and data-dense but breathable panels.

## 3. Colour system

Use CSS variables and semantic tokens. Avoid introducing new colours ad hoc.

| Token | Hex | Usage |
|---|---|---|
| `--canvas` | `#F6F7F8` | Main application background |
| `--surface` | `#FFFFFF` | Primary panels and navigation |
| `--ink` | `#202A32` | Primary text |
| `--ink-soft` | `#44525A` | Secondary headings |
| `--muted` | `#7B8790` | Supporting text |
| `--line` | `#E8ECEE` | Borders and dividers |
| `--brand` | `#294F4D` | Primary actions, selected nav |
| `--brand-deep` | `#1D4140` | Hover / pressed action |
| `--success` | `#247B60` | Verified / pass |
| `--success-bg` | `#E8F3EE` | Success surface |
| `--warning` | `#AD782A` | Attention / warning |
| `--warning-bg` | `#FBF3E5` | Warning surface |
| `--danger` | `#B34D4A` | Confirmed failure only |
| `--danger-bg` | `#F8EDEC` | Failure surface |
| `--unknown` | `#78858B` | Not checked / unknown |

Rules:
- Brand green is a functional accent, not a background wash.
- Amber means attention, never general decoration.
- Red is reserved for actionable failure or destructive actions.
- Never rely on colour alone; pair status colour with text and an icon/shape.
- Avoid gradients in the product UI. Flat colour is the default.
- Maintain WCAG AA contrast for text and controls.

## 4. Typography

**Primary UI family: Manrope** (400, 500, 600, 700, 800). Use for interface text, headings and controls.  
**Technical/data family: DM Mono** (400, 500). Use for DNS records, email addresses, timestamps, score denominators, protocol labels, code and compact metadata.

Hierarchy:
- Page title: 24–28px, 800, slightly tight tracking.
- Panel title: 12–14px, 700–800.
- Body: 11–13px, 400–500, line-height 1.55–1.7.
- Supporting labels: 9–10px, 500, muted.
- Technical values: 10–12px DM Mono.

Do not use more than these two families. Do not make all text tiny to force density; evidence tables must remain comfortably readable. Use tabular numerals for metrics.

## 5. Layout and component principles

- 8px spacing rhythm, with 4px micro-adjustments where necessary.
- Main rail around 244px desktop; top bar around 64px.
- Main content max-width around 1360px.
- Panel radius 6–8px; buttons and inputs 4–6px.
- Use thin borders before shadows. Shadows should be rare and nearly imperceptible.
- Prefer aligned rows, tables, timelines, status lists and evidence drawers over repeated feature-card grids.
- One clear primary action per screen. Secondary actions are quiet text or outlined buttons.
- Use Lucide icons consistently, 15–18px, stroke width 1.8–2. Use no emoji as interface icons.
- Charts should answer a question; do not add decorative charts to empty space.
- Use motion only to clarify state changes; 120–180ms, respect `prefers-reduced-motion`.

### Required screen patterns
**Overview:** score + coverage, one highest-priority finding, test inbox, domain list, recent activity.  
**Domain detail:** tabs for Overview, Authentication, DNS records, History, Settings.  
**Report:** summary, coverage, auth matrix, evidence, Received chain, message structure, recommended fix and limitations.  
**Fix:** record name/type/value/TTL, copy affordance, provider-specific instructions, user confirmation, verification timeline.  
**Monitoring:** schedule, last check, detected drift, alert destination and delivery history.

### Data visualisation
- Scores always include coverage and methodology context.
- Use a compact score ring only as a secondary summary; the actual check list is authoritative.
- Evidence tables show source, observed value, expected value, timestamp and confidence.
- Unknown is a first-class state, not a pale green.

## 6. Copy system

### Good examples
- “DMARC policy is set to monitoring only.”
- “We found one SPF policy. Recursive lookup count is still being checked.”
- “DKIM selector not provided. We can read it from a received message.”
- “DNS response differed across resolvers. Check again after propagation.”
- “This confirms authentication hygiene, not inbox placement.”

### Avoid
- “Revolutionize your email game.”
- “Unlock the power of seamless deliverability.”
- “Your emails are guaranteed to land in inboxes.”
- “AI-powered magic fixes everything.”
- “All systems go!” when checks are unknown or incomplete.

## 7. Anti-AI-slop requirements — mandatory

This section is based on recurring complaints in Reddit design/developer discussions, including r/website, r/webdesign, r/webdev, r/micro_saas, r/ClaudeAI and r/UI_Design. The point is not that any single visual pattern is forbidden in all design; the problem is stacking familiar defaults without a product-specific reason. A recent Reddit comparison also cautions that individual choices such as Inter or an indigo accent are not enough on their own to establish “AI-made” design. Use judgment and coherence, not superstition.

### Do not use these patterns as defaults
1. **Purple-to-blue gradient hero** or “neon nebula” background.
2. **Glowing blurred blobs**, radial spotlights or mesh gradients behind ordinary content.
3. **Glassmorphism everywhere:** frosted translucent panels, blur layers and shiny borders.
4. **Pill badge eyebrow above every heading**, especially “NEW”, “AI-POWERED” or “NEXT-GEN”.
5. **Centered hero template** with giant vague headline, short subhead and two competing CTAs.
6. **Three or four identical rounded feature cards** with a generic icon tile, title and one-line description.
7. **Nested card-on-card layouts** with excessive rounded rectangles and soft shadows.
8. **Gradient headline text** or one arbitrarily highlighted word in a different colour/font.
9. **Tiny decorative labels everywhere** that add no information.
10. **Emoji used as product icons**, status markers or heading decoration.
11. **Generic stock illustrations and abstract 3D blobs** unrelated to email infrastructure.
12. **Fake social proof:** invented testimonials, fake customer logos, unsupported user counts, suspiciously round metrics.
13. **Vague AI copy:** “unlock”, “elevate”, “supercharge”, “seamless”, “revolutionary”, “game-changing”, “the future of”.
14. **Over-animated scroll reveals** where every section fades/rises into view.
15. **Decorative charts** with no underlying real data or clear question.
16. **Random icon colour rainbow** or unrelated pastel tiles.
17. **Fake live statuses** and buttons that do nothing.
18. **Default template sameness:** same hero, same feature grid, same pricing blocks, same testimonial section regardless of product.

### Product-specific replacements
- Show a real report, DNS record, header excerpt or Received-chain timeline instead of generic hero artwork.
- Use structured evidence rows instead of icon-card grids.
- Use a single dark green action colour, neutral canvas and meaningful status colours.
- Use technical monospace typography for records and timestamps to create product-specific texture.
- Write headings that name the exact state or task.
- Show a clear “unknown” or “not yet checked” state rather than decorative confidence.
- Let the product interface itself be the visual proof.

### Design review test
Before accepting a screen, ask:
- Could this exact screen belong to a generic AI CRM, analytics tool or chatbot? If yes, make it more specific to email authentication.
- Is every card, badge, icon, animation and colour doing useful work?
- Does the hierarchy make the next action obvious?
- Is there real evidence or is this a fabricated placeholder?
- Does the screen remain coherent when data is empty, failed or unknown?
- Have we avoided stacking three or more cliché patterns from the list above?

## 8. Do / Don't summary

| Do | Don't |
|---|---|
| Use clear technical language | Use hype and vague promises |
| Show evidence and timestamps | Invent success states |
| Use restrained green and amber | Use neon purple gradients |
| Use tables and timelines | Use endless identical cards |
| Make one action prominent | Make every button primary |
| Design empty/error/unknown states | Show fake activity to fill space |
| Use subtle borders and spacing | Stack glass, glow and shadow effects |
| Make responsive, accessible layouts | Shrink everything to fit desktop |
| Use actual product screenshots/data | Use unrelated stock imagery |

## 9. Reference research

The following public discussions informed the anti-slop checklist. Reddit is community opinion, not a universal design law. Quora search did not surface a sufficiently specific, verifiable first-hand discussion in the available results, so this document does not attribute any claims to Quora.

- Reddit, “tried to measure what makes a site look ‘AI-made’” (r/website, Oct 27 2026): https://www.reddit.com/r/website/comments/1xgukte/tried_to_measure_what_makes_a_site_look_aimade/
- Reddit, “Are there any dead giveaways of an AI designed website?” (r/webdesign, Nov 10 2026): https://www.reddit.com/r/webdesign/comments/1xsqm9l/are_there_any_dead_giveaways_of_an_ai_designed/
- Reddit, “How do you minimize ‘AI look’ in designs?” (r/ClaudeAI, Oct 13 2026): https://www.reddit.com/r/ClaudeAI/comments/1x4za5g/how_do_you_minimize_ai_look_in_designs/
- Reddit, “Stop making vibecoded sites that look like ai slop” (r/micro_saas, Apr 13 2026): https://www.reddit.com/r/micro_saas/comments/1skltqv/stop_making_vibecoded_sites_that_look_like_ai_slop/
- Reddit, “Preventing the AI slop look” (r/webdesign, Jun 28 2026): https://www.reddit.com/r/webdesign/comments/1uhuovu/preventing_the_ai_slop_look/
- Reddit, “Question about websites looking like ‘AI slop’” (r/UI_Design, Sep 4 2026): https://www.reddit.com/r/UI_Design/comments/1w70kqb/question_about_websites_looking_like_ai_slop/
- Reddit, “What’s the most overhyped trend in modern web design right now?” (r/webdev, Apr 27 2026): https://www.reddit.com/r/webdev/comments/1sx2417/whats_the_most_overhyped_trend_in_modern_web/

Recurring sentiments: generic sameness matters more than any one font or colour; purple neon gradients, blur/glass effects, pill eyebrows, card grids, generic copy and fake proof are common complaints. Some commenters explicitly warn against labelling every rounded corner, border or gradient as slop in isolation.
