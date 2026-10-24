# UX Redesign Proposal — October 2026

Branch: `claude/site-redesign-usability-ux-0f2246`

This document records the usability audit of the live board site and the
redesign implemented on this branch. It is written for maintainers, not for
site visitors; none of it is visible site copy.

## Audit Findings

Reviewed at 1280×860 (desktop) and 375×812 (phone) in light and dark modes,
with seeded posts in every category.

### Home and live board

1. **The board starts below the fold.** A display-size title, a tall empty
   hero band, and four bare buttons push the first post about one full screen
   down on desktop and two screens down on a phone.
2. **Cards are oversized for scanning.** Each post uses a 2rem serif title,
   tracked uppercase labels, and full-width attribute boxes. A desktop screen
   shows about two posts; a phone shows less than one.
3. **Browse and create actions are mixed together.** The header nav, hero
   buttons, and footer all repeat "Service projects / Borrow / Lend". The same
   phrase means "browse" in the filter strip and "post" in the header.
4. **Secondary controls compete with primary ones.** Search, sort, and the
   "Origin" location control share equal visual weight. "Origin" is jargon.
5. **Pagination labels assume chronological order.** "Newer posts / Older
   posts" is wrong when sorting by nearby or by replies.
6. **No relative time.** Absolute timestamps ("Oct 22, 2026, 8:07 AM") are
   slower to read than "2 hours ago" for activity-driven content.

### Posting forms

7. **Contact details come before the request.** Each form opens with name,
   contact method, and notification settings; the thing being requested is
   last. People think about what they need first.
8. **No grouping.** Ten or more fields sit in one flat grid with no section
   headings, so the form reads as one undifferentiated wall.
9. **Success and error messages render off-screen.** Results appear at the top
   of the form while the submit button is at the bottom, so a successful post
   looks like nothing happened.
10. **Optional fields are inconsistently marked.** "Need it by" is optional but
    unmarked; "Contact note (optional)" is marked.
11. **The public-contact disclosure sits beside the submit button**, after the
    contact fields have already been filled in.
12. **The contact block is duplicated** verbatim across three pages.

### Post detail

13. **The reply form opens below the entire thread**, far from the button that
    opened it, and asks for contact details before the message.
14. **Moderation and owner tools carry equal weight with the main action.**
    "Public actions", "Owner tools", and "Safety and moderation" are all
    labelled panels.

### Global

15. **Low-contrast form boundaries.** Input borders use 8–12% alpha, well below
    the WCAG 1.4.11 non-text contrast minimum of 3:1.
16. **Unbounded line length.** Content stretches to the full viewport width
    minus padding; body text and forms become hard to track on wide screens.
17. **Heavy reliance on tracked uppercase micro-labels**, which are harder to
    read than sentence case at small sizes.
18. **Entrance animations gate visibility.** The hero fades in from opacity 0,
    which also ignores `prefers-reduced-motion`.
19. **Account and Help are hidden in the footer.**
20. **Styles are duplicated** across pages (buttons, notices, fields,
    `sr-only`), which lets the pages drift apart.

## Design Principles

- **Board first.** The board is the product; it should be visible on arrival.
- **One way to post.** A single "New post" entry point offers the three post
  types everywhere, separate from browsing filters.
- **Scan, then dive.** Compact cards carry type, title, place, time, and reply
  count; full detail lives on the post page.
- **Ask in the order people think.** What → where/when → how to reach you.
- **Show results where the eye is.** Move focus to success and error states.
- **Self-explanatory over instructional.** No new taglines or how-to copy;
  layout, labels, and ordering carry the flow.

## Card Content Budget

Each board card is limited to four pieces of information, with the most
important words first:

1. **Title**: what is needed or offered.
2. **Type**: Service, Borrow, or Lend, shown as a coloured word.
3. **Place**: the location or neighbourhood, or the distance when sorting by
   nearby.
4. **Age or status**: for example "2 hours ago", or "Fulfilled".

The whole card links to the post page. That page holds everything else: the
author, reply count, details, attributes, contact, and actions.

This is one identity anchor (the title) plus three supporting facts. That is
a conservative design target, not a hard cognitive cutoff:

- Working memory holds about 3–5 independent chunks, averaging about four.
  Capacity falls as items get more complex. Miller's 7±2 is not a UI limit.
  Source: Cowan, "The magical number 4 in short-term memory", *Behavioral and
  Brain Sciences* 24 (2001).
- A visible screen acts as external memory. Users can therefore scan many more
  than four cards in a regular list; the four-chunk limit applies within a
  card, not to the list as a whole.
- Attention concentrates near the top of a page and at the start of each line:
  in Nielsen Norman Group eye tracking, about 74% of viewing time fell in the
  first two screenfuls. Titles lead each card, and the type word leads the
  second line.
- The common claim that "users read only about 20% of words" is an indirect
  time-budget estimate (Nielsen Norman Group, 2008), not a measured limit. It
  supports cutting card text, but not any exact count.

Cards carry no buttons. The single action is opening the post. Facts people
need to compare posts use the same fields, in the same order, on every card.

## Information Architecture

| Area | Before | After |
| --- | --- | --- |
| Header | Board, Service projects, Borrow, Lend, theme | Board, Directory, Help, Account, **New post ▾**, theme |
| Home | Title, hero buttons, poster, board | Title + three post tiles, then the board |
| Footer | Help, Directory, repeated post links, account, theme | Grouped: Board / Post / Resources, theme |
| Forms | Flat grid, contact first | Fieldsets: request → contact → notifications |
| Post page | One long card, reply form at the bottom | Main column + action sidebar; reply form focuses on open |

## Implemented on This Branch

- `front-end/src/assets/css/main.css`: shared design system — content width,
  type scale, buttons, fields, notices, badges, per-type accent colours, focus
  rings, 3:1 form borders, reduced-motion handling.
- `SiteHeader.vue` + `NewPostMenu.vue`: browse vs. create split, keyboard- and
  Escape-dismissable "New post" disclosure menu.
- `index.vue`: a compact hero with post tiles, a single-row board toolbar,
  and filter tabs. Each board card is one link limited to four pieces of
  information (see Card Content Budget). Loading shows skeleton placeholders,
  and the pagination labels no longer assume date order.
- `BoardSubmissionPage.vue` + `BoardContactFields.vue`: grouped fieldsets,
  shared contact block, disclosure next to contact fields, focused result
  panel linking to the new post, recent-posts rail.
- `service-request.vue`, `item-request.vue`, `item-lending.vue`: request
  details first.
- `post.vue`: header with type/status badges, two-column layout, action
  sidebar, message-first reply form that receives focus.
- `Footer.vue`, `help.vue`, layouts: consistent page header and container.

Existing behaviour is preserved: URL-synced filters, nearby sorting privacy,
draft storage, anti-bot flow, management links, reporting, and every
accessible name used by the Playwright suite.

## Proposed Follow-ups (Not Implemented)

- **Service project titles.** Service posts use the project type ("Cleanup")
  as their title. Adding a short required "Title" field would make the board
  far easier to scan, but it changes the API contract and stored records.
- **Account, admin, directory, and search internals.** These pages inherit the
  new shell, width, and typography but keep their own component styles. They
  should be migrated to the shared classes in a follow-up.
- **Theme tokens.** Add an explicit `--site-field-border` token per scheme
  instead of deriving it with `color-mix`, once the scheme set is reviewed.
