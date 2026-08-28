# Four51 Theme Development Notes

Living reference for building ModernTheme-style Four51/OrderCloud storefront themes. Started
during the ModernTheme build for Thumbprint's `gpsandbox` tenant; kept updated as we learn more
here and on future theme projects. This is a knowledge base, not a changelog — record patterns
and gotchas that will matter again on a *different* theme/tenant, not one-off content fixes.

## Platform basics

- **Stack**: AngularJS 1.2, `ngRoute`, no build tooling — static files deployed as-is. No `npm
  build`, no bundler. Edit files directly; what's in git is what ships.
- **Deployment**: Four51 admin has a "Git File Deployment" page (Products/Admin area) that
  auto-deploys on merge to `master`. It also lists deployment history per commit with a
  per-commit "Redeploy" button, and a "Branches" dropdown + "Commits" list with per-commit
  "Deploy Commit" buttons for testing a branch/commit independently of `master`.
- **Terminology**: this is "Four51" to the client, not "OrderCloud" (Four51 is built on
  OrderCloud but the client-facing admin and docs use Four51 terms). Admin concepts: Spending
  Accounts, Approval Rules, Groups, Cost Centers, Categories, Catalogs.
- **Routing**: `app/js/routing.js` — check this first on any new page to find the controller +
  template pair, and whether the template path is a real git-tracked partial or a `.hcf`
  (admin-managed fragment, see PDT section below).

## The PDT (Product Detail Template) is not in git

The main product page (`/product/:id`) and its "edit spec form" routes resolve to `.hcf`
fragments (`productview.hcf`, `specform.hcf`, `addToOrderSpecForm.hcf`) served dynamically from
the **Four51 admin**, not from this repo. Look for `concatProductView`/`concatSpecFormView` in
`routing.js` — those routes never touch `app/partials/`.

- Managed in the admin at **Products > Product Detail Templates**.
- Keep a reference copy in `pdt-templates/` (e.g. `pdt-templates/ModernTheme-PDP.html` here) so
  the markup is at least visible in git, and copy any admin edits back into it — but the admin
  copy is the one that's actually live. They **will** drift if you forget.
- The admin editor is a **shared, cross-client tool** — be careful not to touch another client's
  template while editing this one.
- Custom Angular elements in the PDT need explicit closing tags (see the self-closing tag bug
  below) — this bites here more than anywhere else because it's hand-edited in a web textarea
  with no linting.

## Restyle methodology (screen-by-screen)

1. **Preserve every real binding.** `ng-click`, `ng-show`, `ng-if`, controller function calls,
   filters — copy them verbatim. This is a visual-only restyle unless you find and explicitly
   call out a real bug (see "latent bugs" below) — never quietly change business logic while
   restyling.
2. **Read the controller before touching the template.** Know what's real scope data vs. what
   you'd be fabricating. Never invent sample copy, prices, or placeholder business data — ask,
   or leave it out.
3. **Reuse existing `mt-` classes before inventing new ones.** `grep -n "^\.mt-" app/css/custom.css`
   first. Buttons, cards, field patterns, pills, pagination, tables all have established classes
   by now (see below).
4. **Page wrapper pattern**: give the page's root element a new `mt-` class (`.mt-pdp`,
   `.mt-checkout`, `.mt-kit`, etc.), with an inner `.mt-container` for max-width centering. Pages
   needing a full-bleed cream background use the negative-margin trick — see below for the
   exact value, which we got wrong once.
5. **All new CSS goes in `app/css/custom.css`**, appended at the end under a
   `/* ===== ModernTheme: <page name> ===== */` comment block. Never edit `bootstrap-451.css`
   directly — override it from custom.css instead.
6. **Mobile**: Bootstrap's own `col-md-*`/`col-sm-*` grid auto-stacks below 768px, so most layouts
   need zero extra work. Custom flex/grid layouts need their own `@media (max-width: 767px)`
   rule. Actually test at a real mobile width before calling a page done — several bugs below
   were only visible there.

## Design tokens (this tenant's palette — re-derive per client, don't copy blindly)

```
Page background (full-bleed sections): #FAF8F4
Card/content surface:                  #fff
Heading text:                          #211F19
Body text:                             #262420
Muted/secondary text:                  #726D5F
Borders/hairlines:                     #E8E4DA
Teal accent:                           #0F6B63  (hover: #0C544E)
Error/danger text:                     #B3261E
Warning pill bg/text:                  #FCEFD8 / #A85D00
Success/"done" pill bg/text:           #E3F1EE / #0F6B63
Font:                                  'Inter', 'Droid Sans', sans-serif
Card/button radius:                    8-12px
```

Do **not** copy a reference design's color palette wholesale when the user shares one for
inspiration (e.g. a competitor's kit-builder UI, a Pinterest screenshot). Borrow the *pattern*
(status pills, card headers, layout rhythm) and render it in the theme's own established tokens.
Mixing in a second unrelated palette makes the site look inconsistent page-to-page.

## Established reusable components (grep custom.css for the full/current list)

- `.mt-container` — max-width wrapper for content spacing
- `.mt-eyebrow` — small-caps section label
- `.mt-btn-accent` — primary filled teal button; `.mt-header-btn` — secondary bordered button
- `.mt-checkout-card` / `.mt-checkout-card-title` — white bordered rounded card, the default
  "group of related content" container used on most restyled pages
- `.mt-pdp-title` / `.mt-pdp-meta` / `.mt-pdp-price` — page H1, small muted text, bold price
- `.mt-field` — label-above-input pattern for plain forms
- `.view-form-icon` fix (scoped per page, e.g. `.mt-pdp .view-form-icon`) — the legacy admin
  spec-form fields (`ocselectionfield`/`octextfield`/etc. from
  `app/lib/oc/ordercloud-specforms.js`, and the raw `label.required`/decorative-icon markup used
  throughout the stock templates) all need this same restyle: hide the decorative `.fa-*` icon,
  small-caps muted label, red asterisk on `.required`, clean bordered input. **Every new page
  with form fields needs this scoped in** — it's easy to restyle the surrounding card and forget
  the fields still look raw.
- `.mt-*-pill` (see the kit page's `.mt-kit-pill*` for the visual recipe) — rounded status badge,
  reusable pattern for any "state" indicator (order status, message status, kit item
  configuration state)
- `.mt-pagination` — wraps the `<pagination>` directive
- `.mt-report-table` — generic striped/bordered data table, wrap in `.mt-report-table-wrap` with
  `overflow-x: auto` for wide tables on mobile

## Latent bugs found in the stock Four51 templates (not introduced by us — pre-existing)

### Self-closing custom element tags

Browsers do not honor a trailing `/` on an element they don't recognize as void (custom Angular
directives like `<staticspecstable/>`, `<priceScheduleTable/>`, `<quantityfield/>`, `<textarea/>`
is *not* void either). A self-closed custom tag is parsed as an **unclosed opener** — every
sibling that follows becomes a silently swallowed hidden child until the parser hits some real
closing tag. This has caused real, hard-to-spot bugs: an entire results table hidden inside a
`<loadingindicator/>`, an "Add to Cart" button swallowed by `<priceScheduleTable/>`, etc.

**Rule: every custom element gets an explicit `<tag></tag>` close, never `<tag />`.** Grep
`grep -oE "<[a-z]+[a-z-]* [^>]*/>" file.html` on any file you're restyling as a first pass — the
count of matches is your latent-bug count before you've even started on CSS.

### `.451xxx`-prefixed classes are invalid unescaped CSS selectors

Four51 emits classes like `451qa_...`/`451_...` (leading digit). `.451xxx { }` is invalid CSS
(class selectors can't start with an unescaped digit) and silently matches nothing. If you ever
need to target one, use an attribute selector: `[class~="451qa_home_link"]`.

## Bugs we introduced ourselves while restyling — watch for these patterns

### CSS shorthand collision when combining two classes on one element

`<div class="mt-container mt-section">` — if `.mt-section` uses the `padding` shorthand
(`padding: 40px 0`) and `.mt-container` also sets `padding` (`padding: 0 24px`), both classes
have equal specificity (0,0,1,0 each) and the one declared **later in the stylesheet** wins by
source order — the shorthand doesn't merge, it **replaces all four sides**. This zeroed out
`.mt-container`'s horizontal padding everywhere `.mt-section` was combined with it, which was
invisible on desktop (plenty of surrounding whitespace) but left every section heading flush
against the screen edge on mobile, where the container is the full viewport width.

**Rule: any class meant to be combined with `.mt-container` (or any other class supplying its own
padding/margin) must use `padding-top`/`padding-bottom` only, never the shorthand**, unless you
genuinely intend to override all four sides.

### `.mt-checkout-card .input-group` + a button inside it, at narrow widths

`.mt-checkout-card .input-group { display: flex; }` overrides Bootstrap's legacy
`display: table` layout, but the legacy `.input-group .form-control { width: 100% }` and
`.input-group-addon, .input-group-btn { width: 1% }` rules are still active (they were originally
meaningless table-layout quirks, not real width constraints) and now fight the new flex layout
for real: the input claims 100% of the row regardless of any button beside it, pushing the button
— and on a narrow card, the whole page — past the container edge.

**Rule: any `.input-group` you make `display: flex` needs an explicit counter-override**:
`.form-control { flex: 1 1 auto; width: auto; min-width: 0; }` and
`.input-group-btn { flex: 0 0 auto; width: auto; }`. We eventually moved this fix to the shared
`.mt-checkout-card .input-group` rule itself so every current and future page inherits it
automatically, instead of patching each page's search bar separately after each new one broke.

### Flexbox line-break trick: don't confuse "force a new row" with "stretch to fill it"

`margin-left: auto` pushes an item to the far right of a flex row at wide widths; when the row
wraps at mobile widths, that same item floats alone at the far right of *its own* wrapped line
with a big empty gap to its left — not what you want.

The **wrong** fix: giving the item `flex: 1 1 100%`. That does force it onto its own line, but
`flex-basis: 100%` is *also* what makes it stretch to fill that entire line — you can't decouple
"force wrap" from "full width" using flex-grow/shrink alone once flex-basis is 100%.

The **right** fix (standard CSS trick): add an invisible zero-height sibling *before* the item
with `flex-basis: 100%; height: 0;`. That spacer eats the rest of the current line, forcing
everything after it onto a fresh line, while the actual item keeps `flex: 0 0 auto` (its natural,
compact size) on that new line.

```css
.spacer { flex-basis: 100%; height: 0; }
.item { flex: 0 0 auto; margin-left: 0; }
```
If the item is conditionally shown (`ng-hide`/`ng-if`), the spacer needs the *same* condition, or
it'll force a blank line even when the item itself is hidden.

### `align-items: stretch` doesn't always reliably size a flex item — verify, don't assume

Making a page's outer wrapper (`#content`) a flex column for a sticky footer turned its child
(`.container-view`) into a flex item. In theory `align-items: stretch` (the default) should size
it to 100% of the container's width automatically with zero extra CSS. In practice this didn't
hold — `.container-view` was instead sizing to its own content's min-content width, which is
wider than the viewport on mobile the moment a page has a long heading or a multi-column row
inside it, causing real, page-wide horizontal overflow that was easy to miss on desktop (where
there's slack to absorb it) and glaring on mobile.

**Rule: don't trust `align-items: stretch` to "just work" on a flex item whose content could be
wide — verify the actual rendered width at a narrow viewport, and add an explicit
`width: 100%; min-width: 0;` on the item if it isn't stretching correctly.**

### The full-bleed page-wrapper negative margin: match the real padding exactly, don't guess

Full-bleed page sections (`.mt-home`, `.mt-pdp`, `.mt-checkout`, etc.) cancel the parent
`.container-view`'s own padding with a negative margin so the cream background can run edge to
edge. `.container-view`'s real padding (`bootstrap-451.css`) is **5px**, but every one of these
wrapper classes used `margin: -20px -15px 0` — over-cancelling by 10px on each side. Invisible on
desktop; on mobile it bled page content 20px past the edge with no buffer.

**Rule: check the actual computed padding of what you're cancelling before picking the negative
margin value** — don't reuse a value from a different project/reference without verifying it
against this codebase's real numbers. It should have been `margin: -20px -5px 0` from the start.

### InteropID string comparisons: never assume the casing you configured matches the real data

`AppConst.featuredCategoryInteropID` was set to `'Featured'`, but the actual category's InteropID
in this tenant's live data is lowercase (`'featured'`). `Product.search()`'s server-side category
lookup apparently tolerates the case mismatch, so the existing "Featured for your team" carousel
worked fine all along — but a *new* client-side `===`/`indexOf` comparison we added (excluding
Featured from "Shop by category") was case-sensitive and silently let it through.

**Rule: any InteropID comparison against an `AppConst`-style config value should be
case-insensitive** (`.toLowerCase()` both sides) unless you've verified the real admin data's
casing yourself. Don't trust a config constant's casing just because it "looks right" or because
a *different*, more forgiving code path (like a server search) happens to work with it.

### `localStorage` caches the category tree, user, and order — with no expiry

`Category.tree()` (`app/js/services/categoryService.js`) checks `localStorage['451Cache.Tree.<tenant>']`
first and **never hits the network at all** if a cached copy exists, no matter how stale. Same
pattern for `Category.get()` (per-category cache) and elsewhere for user/order data. A brand new
admin-created category will not appear — even after a normal refresh, even after logging out and
back in — until that specific `localStorage` key is cleared.

**When a change made in the Four51 admin doesn't show up on the storefront, clear
`localStorage` (or that specific `451Cache.*` key) before assuming it's a code bug.** We
confirmed this by fetching straight from the live `custom.css`/API with `curl` (bypassing the
browser entirely) more than once this session before realizing the *browser's* cache — not the
CDN's — was the culprit.

### Restricted-quantity price schedules need their own default-quantity guard

A price schedule with `RestrictedQuantity: true` only allows specific break quantities (e.g. 100
/ 250 / 500 / 1000) picked from a `<select>`, not an arbitrary number. Every place in this app
that defaults `LineItem.Quantity` to `1` on page load (`productCtrl.js`, `kitCtrl.js`,
`quickAddModalCtrl.js`) was doing so unconditionally — `1` never matches one of the restricted
options, so the `<select>` visually shows blank (Angular can't select a nonexistent option) while
the real bound value stays `1`, which immediately fails the `MinQuantity` check and shows a raw
validation error before the customer has touched the page.

**Rule: any "default the quantity to X" logic must check `PriceSchedule.RestrictedQuantity` first
and skip defaulting entirely if true** — there's no sensible single default among a restricted
list; let the customer pick.

### Cart line-item merge identity

Adding the same product to the cart twice should combine into one row with the summed quantity,
not create a visual duplicate. The *only* correct equality check is: same `Product.InteropID` +
same `Variant.InteropID` + same values for any `CanSetForLineItem` (non-variant-defining) specs.

**Never add a product-`Type`-based exception** (e.g. "always treat VariableText/VBOSS as unique,
skip merging"). It seems safer at first (personalized print items feel like they should never
merge) but it's both unnecessary and wrong: a genuinely different customization on those product
types *always* produces either a different `Variant.InteropID` (VBOSS/MPower creates a new
variant per design) or a different spec value — both already block a false match on their own.
We shipped the type-based exception once, and it broke merging for the common real case (the
exact same already-configured decorated-apparel variant added twice).

### Order save field-preservation race

When a form field's value needs to be "preserved" across an async `Order.save()` (billing
address, payment method, etc. that some other concurrent save might clobber), **read the value to
preserve inside the save's success callback, at response time** — not before the request was
sent. Capturing it before the request means a *second*, concurrent save (e.g. an automatic
autosave firing from a different section of the checkout page) can overwrite that field with a
stale value while the first save is still in flight, and your "preserved" value is now wrong.

## Workflow

- One focused branch + PR per change, branched fresh off `origin/master` each time (never off
  another feature branch, and never off whatever's currently checked out without checking first —
  `git fetch origin master && git checkout -b <name> origin/master`).
- `gh pr create -R <owner>/<repo> ...` then `gh pr merge -R <owner>/<repo> <branch> --merge`
  immediately — this project's convention is auto-merge, no waiting for review, since merges to
  `master` auto-deploy live.
- **Heredocs break on apostrophes** in commit messages / PR bodies in this shell setup. Use
  multiple `-m` flags instead of a single heredoc-based message, or avoid contractions.
- If two PRs both append new CSS to the end of `custom.css` and the second was branched before
  the first merged, expect a merge conflict on the shared tail of the file — it's usually a fake
  conflict (two independent, non-overlapping additions that just happen to sit at the same
  location), not a real logical collision. Resolve by keeping both blocks, verifying brace count
  balances (`node -e "..."` brace-depth check) before committing the resolution.
- After deploying, **verify against the live server directly** (`curl` the actual `.css`/`.html`
  file with a cache-busting query string) before concluding a fix didn't work — the browser doing
  the visual check is very likely just serving a stale cached copy of an asset, not proof the
  deploy failed. This happened repeatedly this session; the deploy was fine every time.
- A live walkthrough via a connected real browser (Claude in Chrome) catches things a code review
  never will — several of the bugs above were only found by actually looking at a rendered page
  at a real mobile width and noticing something was visually wrong, then tracing back to the
  cause.

## Open items / things to revisit

- Admin-authored rich-text content (product descriptions, etc.) can contain raw stock Bootstrap
  classes (`btn btn-primary`) that don't pick up the theme, since we never override generic
  Bootstrap classes globally (to avoid unintended blast radius elsewhere). If this matters for a
  given client, consider a scoped override like `.mt-pdp-description .btn { ... }` rather than
  chasing every individual admin-authored button by hand.
- No genuine "browse the whole catalog, unscoped" view exists in Four51/OrderCloud as used here —
  `Product.search()` requires either a category or a search term client-side
  (`productService.js`'s `_search` guard short-circuits if all three are falsy), and it's
  unverified whether the backend would even handle a truly unscoped query well on a large
  catalog. If a client wants "browse everything," the reliable option is a real category that
  aggregates the whole catalog (what we did here, via an admin-created "All Products" category),
  not new unscoped-search plumbing.
