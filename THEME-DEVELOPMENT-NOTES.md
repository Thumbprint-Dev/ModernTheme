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

## Session, login & logout mechanics

- **Who owns what**: `app/js/services/securityService.js`'s `Security` factory owns the session
  cookie (`init()` writes it, `auth()` reads it, `isAuthenticated()` decides, `logout()` clears
  it). `app/js/services/userService.js`'s `_logout()` calls `store.clear()`, `Security.logout()`,
  then POSTs `api('logout/user')`. `app/js/controllers/navCtrl.js`'s `$scope.Logout()` (Log Out
  menu item) and `app/js/controllers/Four51Ctrl.js`'s `LogoutByTimer()` (idle logout, currently
  30 minutes - `TimeOutTimerValue` in that file, easy to adjust per client) both trigger it — keep
  them in step, they've drifted out of sync before.
- **The cookie name** is `"user." + apiName` (apiName = first URL path segment, e.g.
  `user.Mollymaid`). On the deployed site the *server* sets it `path=/<app>` (no trailing
  slash), `SameSite=None; Secure; Partitioned`. Client code that doesn't match every one of
  those attributes when clearing it ends up writing a second, different cookie of the same
  name instead of clearing the real one.
- **Partitioned cookies (CHIPS) live in a separate jar.** Expiring one with a plain
  `document.cookie` write does nothing to it — it silently creates a new *unpartitioned* cookie
  of the same name and leaves the real, partitioned one untouched. A correct logout must repeat
  every attribute on the expiry write and cover every plausible path (`/<app>`, `/<app>/`, `/`),
  both plain and with `SameSite=None; Secure; Partitioned`.
- **This class of bug does not reproduce on localhost.** The dev server strips
  `Secure`/`SameSite=None` from proxied `Set-Cookie` headers, so locally the cookie is plain and
  a naive delete looks like it works. Verify any logout/session fix on the deployed site, never
  just locally.
- **The in-memory `logout = true` flag is not proof the session is gone.** `Security.logout()`
  sets it so `isAuthenticated()` returns false for the rest of the current page's life, but it
  dies on the next load. If the cookie itself survived, the next load reads it back, decides the
  visitor is signed in, and renders the header — while the user object it can't actually fetch
  leaves that header showing only Cart/Account and nothing else. That combination ("looks logged
  out for a moment, then looks half logged-in on reload") is this bug's signature.
- **Redirect to login with a real navigation, not Angular routing**:
  `$window.location.href = '/' + $451.apiName + '/login'`. `$location.path('/login')` followed
  by `location.reload()` doesn't work — `$location` only writes the URL on the next digest, one
  tick after `reload()` has already re-fetched the page being left. Also don't gate the redirect
  on `$scope.isAnon` — that's false on any site that requires sign-in, so the redirect silently
  never fires.
- **How to actually verify a fix**: `document.cookie` can't see partition/path/sameSite
  attributes — use `(await cookieStore.getAll()).filter(c => c.name.startsWith('user.'))` in the
  browser console instead. Check before and after logout; two entries with the same name at
  different paths is normal *and is exactly how this bug hides* — only "gone from `cookieStore`
  entirely" counts as proof.
- Fixed by Jimwell Rabino (another developer working in this same repo) in commits `50d7995a`
  (redirect) and `baa6cb32` (cookie expiry) — a separate, unrelated logout bug (native navigation
  racing an `ng-click` handler on `href="#"` links without `event.preventDefault()`) was fixed
  earlier the same week; both were real, distinct root causes behind similar-looking "logout
  doesn't work" symptoms.

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

### Kit data model: `NextKitLineItem` chain + `IsConfigurable`/`IsConfigured` flags

A kit's components are NOT a nested array on the order response - they're a singly-linked list
off the kit-parent line item: `parentLineItem.NextKitLineItem.NextKitLineItem...`, each node a
full LineItem-shaped object (same shape as a top-level `order.LineItems[i]` - real `Product`,
`Variant`, `Specs`, `Quantity`, not a partial/synthetic stub) carrying `KitItemID` (matches it back
to `Kit.KitItems[i].ID`), `IsKitChild`, `IsConfigurable` (false = the component is fixed/included,
never shown as needing action), and `IsConfigured` (server-computed - true once whatever that
component requires, variant selection and/or specs, is satisfied). `app/js/services/kitService.js`'s
`Kit.mapKitToOrder(kit, lineitem)` walks this chain and cross-assigns `kititem.LineItem = lineitem`
for each match - this mutates in place, it never replaces the `Kit.KitItems` array or its entries,
so object references captured before a save stay valid to reuse after one (just make sure to
re-derive anything that reads mutable fields - see the next entry).

Any kit-aware UI (the builder wizard, the cart's kit-contents summary) should walk this same chain
rather than inventing a new data shape - `app/js/services/orderService.js`'s `_extend()` already
walks it once (for `KitIsInvalid`) and again for `KitChildren` (see below), and
`app/js/controllers/kitCtrl.js`'s `findNextUnconfiguredItem()` walks `Kit.KitItems` filtering on
`IsConfigurable && !IsConfigured` - reuse these flags rather than re-deriving "does this need
attention" from scratch.

**`orderService.js`'s `_extend()` now also builds `li.KitChildren`** (a flat array, single level,
matching the existing `KitIsInvalid` walk's depth - no kits-of-kits) on every kit-parent line item,
with the same per-item processing (`SpecsLength`, File-spec auth-URL fixup) applied to top-level
line items - available anywhere `_extend()` runs (every order fetch/save), so the cart's "View kit
contents" toggle needed zero new API calls.

### Don't cache a line-item/order reference across saves - re-derive it fresh instead

The kit builder wizard (`kitCtrl.js`) auto-advances to the next unconfigured component after each
save, and returns to the kit-parent panel once everything's done. The first draft of that "return
to parent" logic cached the parent's `LineItem` object once, at initial page load, to restore later.
That's wrong: every `saveItem()` call replaces `$scope.currentOrder` wholesale with a fresh server
object graph - updated pricing (`LineTotal`) included, as children get configured - so a reference
captured once at load goes stale. The fix: always re-derive from the current state instead of
trusting a cached pointer - `$scope.LineItem = $scope.currentOrder.LineItems[$scope.kitIndex]`,
computed fresh at the moment you need it, not stored ahead of time. **General lesson: in a flow
with repeated save-then-redisplay cycles, anything you show the user afterward should be read from
the just-returned fresh state, never a reference kept from before the save.**

### Never let a sibling/descendant controller directly assign a shared scope property

`$scope.currentOrder` (and `$scope.user`) are owned by `Four51Ctrl.js`, sitting on `<html>` - every
other controller (`navCtrl.js`, `categoryCtrl.js`, `productCtrl.js`, ...) reads them via AngularJS's
normal prototypal scope inheritance. That inheritance only works one direction: a **read** on a
descendant scope falls through to the parent's value, but an **assignment**
(`$scope.currentOrder = x`) *always* creates a new own property on whichever scope ran it, silently
shadowing the inherited one from that point on - regardless of whether that scope is a true
descendant (`productCtrl.js`/`categoryCtrl.js`, via `ng-view`) or a sibling (`navCtrl.js`, via
`<navigation>`, which is *not* nested inside `ng-view` at all - it's a separate branch of the DOM
under `#content`).

This bit three times in the same debugging session, each looking like a different bug until traced
back to the same cause:

1. **`navCtrl.js`'s `removeMinicartItem()`** assigned `$scope.currentOrder = order` (or `null`)
   directly in its own success callback. Removing an item updated nav's own mini-cart display
   correctly (it was reading its own now-shadowed copy), but `Four51Ctrl.js`'s real `currentOrder` -
   the one every OTHER page reads - never changed. A category-page add-to-cart right after a
   mini-cart removal then merged into a line item the server had already deleted, and came back
   with a raw `"Object reference not set to an instance of an object"` exception.
2. **`categoryCtrl.js`'s `addSimpleProductToCart()`** did the same thing on success
   (`$scope.currentOrder = o`), plus the old `if (!$scope.currentOrder) $scope.currentOrder = {}`
   initialization pattern - the very first time that ran with no cart yet, it created the shadow.
   `productCtrl.js`'s `addToOrder()` had the identical initialization pattern.
3. **`categoryCtrl.js`'s `User.save($scope.user, function(u) { $scope.user = u; })`** - the exact
   same mistake, one property over. The first add-to-cart in a page session still worked, because
   `Four51Ctrl.js`'s `event:orderUpdate` listener (see below) checks
   `order.ID === $scope.user.CurrentOrderID` *before* this async `User.save` callback had returned
   and shadowed `$scope.user` - but every add after that mutated only the now-disconnected local
   copy. `Four51Ctrl.js`'s real `user.CurrentOrderID` silently stopped updating, so its guard
   silently stopped matching, and `currentOrder` stopped syncing - while the cart badge count
   (computed straight from the broadcast payload, with no such guard) kept updating regardless.
   The visible symptom: cart badge correctly says "1", mini-cart panel says "Your cart is empty".

**The fix, applied consistently:** the object that legitimately owns a piece of shared state
(`Four51Ctrl.js` for `currentOrder` and `user`) is the *only* place that should ever assign to it.
Every mutating flow elsewhere (add to cart, remove from cart, save the user) already broadcasts an
event on completion (`event:orderUpdate` via `orderService.js`'s shared `_then()` helper, which
fires on success *and* failure paths alike unless explicitly suppressed) - add a listener on the
owning scope, guarded by an ID match so it can't accidentally apply someone else's data (e.g. an
approver opening a different shopper's order from Order History also broadcasts this event), and
let every other controller just read the inherited value. Where a subordinate controller genuinely
needs to build up a request payload locally before saving (e.g. constructing the LineItem to add),
use a **local variable**, never `$scope.currentOrder` itself - `var order = $scope.currentOrder ||
{ LineItems: [] };` - and never reassign `$scope.user`; mutate its fields in place
(`$scope.user.CurrentOrderID = x`) or merge a fresh copy's fields into the *existing* object
(`angular.extend($scope.user, freshUser)`), never replace the reference.

**How to catch this class of bug**: the symptom is always "worked once, then silently stopped
staying in sync" - if a scope property is definitely being updated somewhere (confirmed via a
`console.log`/breakpoint) but a DIFFERENT part of the page never reflects it, suspect a shadowing
assignment on a scope in between, not a missing update. `angular.element(el).scope()` in the
browser console, on an element from each suspect view, lets you directly compare
`scope.currentOrder === otherScope.currentOrder` (identity, not just value) to confirm.

**The stock page controllers shadow `currentOrder` too - and that's only safe until something else
changes the order while that page is open.** `cartCtrl.js` and `checkOutViewCtrl.js` (also
`orderHistoryViewCtrl.js`, `favoriteOrderCtrl.js`, `lineItemEditCtrl.js`, the kit/spec controllers
and the checkout directives) all do `$scope.currentOrder = data` after their own saves. That's fine
in isolation, but the mini-cart is always on screen: removing an item from it while the cart page
was open left the cart page holding the deleted line item, and its next quantity autosave got the
same "Object reference not set" error back. Fix pattern used: each such page listens for
`event:orderUpdate`, ignores its own saves (they broadcast the exact object it just assigned, so
`order === $scope.currentOrder`), and reacts only when an update for the **same order ID** arrives
with a **different set of line item IDs**. The cart page swaps in the fresh order. Checkout does
`$route.reload()` instead, because its shipping/billing/payment directives hold references into the
order; keying on line item membership means those directives' own shipping/payment saves never
trigger the reload. When auditing a new theme, grep for `$scope.currentOrder = ` and ask of each
hit: "what happens if the mini-cart changes the order while this view is open?"

**`$modal.open()` (ui-bootstrap 0.10) parents the modal's scope to `$rootScope` unless you pass
`scope:`.** `$rootScope` sits *above* `Four51Ctrl` on `<html>`, so a modal inherits neither
`$scope.user` nor `$scope.currentOrder`. The quick-add modal's `$scope.user.CurrentOrderID = o.ID`
threw right after the order had already saved server-side: spinner stuck forever, and the throw
also skipped `_then`'s `event:orderUpdate` broadcast, so the mini-cart never updated. Always open
modals with `scope: $scope`. Confirm with a throwaway controller that captures its `$scope` and
check `.user` on it. Don't read `.modal-content`'s scope: the modal-window directive has an
isolate scope, so that check gives a false result.

**Kit routes address the kit by array index (`/kit/:id/:lineitemid`, where `lineitemid` is
its position in `LineItems`), not by ID.** Removing anything *ahead* of the kit from the mini-cart
shifted it down a slot. The next component save then read `order.LineItems[staleIndex]` and
`Kit.mapKitToOrder` threw on `undefined`: the save had succeeded, but the page was stuck.
`kitCtrl.js` now remembers the kit's line item ID and re-routes to its new index whenever it moves.
The deeper kit routes (spec form, variant) still use the same index scheme. Unfinished kits are
hidden from the mini-cart, so a kit can't remove *itself* from under its own page that way.

**Derive UI counts from the owned state, not from event payloads.** The cart badge used to count
whatever order the last `event:orderUpdate` carried. After a full page load it was blank whenever
that first broadcast fired before `navCtrl` existed (seen on the kit page), even though the
mini-cart, bound to `currentOrder`, was correct. A `$watch` on a function of the inherited
`currentOrder` can't drift out of sync that way.

**Quantity inputs are `type="text"`, so `lineitem.Quantity` is a string.** Any arithmetic on it
needs `parseInt(x, 10)`. `addOrMergeLineItem()` did `existing.Quantity + lineItem.Quantity`, and
adding 2 more of an item already in the cart at 1 produced quantity **12**. Server-returned
quantities are numbers, which is why category-page adds (hard-coded `Quantity: 1`) never showed it.

### `ng-repeat` needs a stable `track by` key when the underlying object gets replaced wholesale

Directly downstream of the above: because `Four51Ctrl.js`'s `event:orderUpdate` listener replaces
`$scope.currentOrder` **wholesale** (a brand new object graph from the server, not an in-place
update of the existing one) on every single add/remove, the mini-cart's
`ng-repeat="item in currentOrder.LineItems"` had no `track by` and defaulted to AngularJS's
object-identity tracking. Every update therefore looked like "the whole list was removed, an
entirely new list was added" - full DOM teardown and rebuild instead of an in-place diff. Under two
updates close together (a client-side optimistic push - `ProductDisplayService.addOrMergeLineItem()`
pushes the new LineItem into the array immediately, before the save even resolves - followed shortly
by the server's confirmed response replacing the whole object) a stale DOM node could briefly
coexist with its replacement: the product visibly appeared twice in the mini-cart for roughly a
second, then one copy vanished. Confirmed live by recording `$scope.currentOrder.LineItems` and the
actual rendered DOM at 30-50ms resolution while reproducing it: **the underlying data array never
had a duplicate at any point** - only the DOM did, for exactly as long as the old and new render
passes overlapped.

The first fix attempt (`track by (item.ID || item.Product.InteropID)`) was still wrong, for a subtle
reason: a newly-added item has no `ID` yet (the client-side optimistic push doesn't have one - only
the server's confirmed response does), so the *effective key itself* changed the moment that
response arrived (`"MMD-0818-WHT"` → the real server ID) - `ng-repeat` still saw a key disappear and
a different key appear, so the flash happened on literally every add, not just remove-then-add.
**The `track by` expression must evaluate to the same value for the same conceptual item across its
entire lifecycle**, from the optimistic push through the confirmed response - `item.ID` fails that
test for a brand new item; `item.Product.InteropID` (plus `item.Variant.InteropID` when present, to
distinguish different variants of the same product) does not, since both are known and unchanged
from the moment the LineItem is first constructed client-side.

**General lesson for any list bound to an object that gets wholesale-replaced on save**: always add
an explicit `track by`, and audit it for any field that's populated asynchronously (a server-assigned
ID, a computed total, anything not present on the optimistic/local version) - a `track by` key that
can change value for what's semantically the same item defeats the entire purpose of adding one.

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

### An SVG logo with only a `viewBox` collapses to 0x0 inside a flex container

`molly_maid-logo.svg` carries `viewBox="0 0 309.79 132.77"` and no `width`/`height`
attributes. `img.naturalWidth` still reports `300x129` (the spec's default object
size resolved against the ratio), so the image looks loaded in the console — but
flex layout treats the intrinsic size as *absent*, and `.mt-brand` is
`display: flex`, so the logo laid out at exactly 0x0 and rendered as nothing.

Debug tell: `complete: true`, `naturalWidth` non-zero, `getComputedStyle().width`
`0px`. `max-height` alone cannot fix it — nothing pins a dimension for the ratio to
resolve against. `.mt-brand-logo` now sets `height: 32px; width: auto`.

### Adding a modifier class above the base rules it has to beat

`.mt-hero-image h1 { color: #fff }` was inserted *before* `.mt-hero h1 { color: var(--mt-color-text-strong) }`.
Equal specificity (0,1,1), so source order decided it and the hero heading stayed
dark on the photo while the eyebrow and subheading went white — a half-applied
look that reads as an image problem, not a CSS one. Fixed by doubling up the
class: `.mt-hero.mt-hero-image h1`, which wins on specificity wherever it sits in
the file.

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

### `bootstrap-451.css` resets every `<ul>` on the site to `list-style-type: none`

An unscoped `ul { list-style-type: none; margin: 0; padding: 0; }` in the base stylesheet (meant
for nav-style lists elsewhere in the stock templates) silently strips bullet markers from **any**
`<ul>`, including one rendered from admin-authored rich-text content (a product description's
bulleted feature list, `ng-bind-html`'d in verbatim with no sanitization - see `trustedDescription()`
in `productDisplayService.js`). Restoring `padding-left`/`margin` for a scoped selector like
`.mt-pdt-description ul` is not enough on its own - it fixes the indentation but the list still
renders with no visible bullet at all, since `list-style-type` is a separate property this reset
also zeroes out. Any scoped list styling in this theme needs to explicitly set
`list-style-type: disc` (or `decimal` for `ol`) alongside whatever spacing it restores - never
assume the browser default survives just because you didn't touch it. Same family of gotcha as the
`img { display: block }` and `div { position: relative }` resets noted elsewhere in this doc -
`bootstrap-451.css` resets more tag-level defaults than you'd expect, and admin-authored HTML
content is the most likely place to run into one you haven't hit yet.

### `position: sticky` can silently fail on a `<header>` nested inside a custom directive element

The site header (`.mt-header`, an actual `<header>` element) had `position: sticky; top: 0;` and
looked completely correct in every diagnostic - `getComputedStyle` reported `sticky`, no ancestor had
non-visible `overflow`, no `transform`/`filter`/`perspective`/`contain` anywhere in the chain, the
containing block was tall enough - yet it scrolled away with the page instead of staying pinned, in
Chrome, reproducibly. `position: fixed` on the exact same element worked immediately, proving nothing
was fighting the positioning itself. The actual fix: move `position: sticky` up one DOM level, onto
the wrapping `<section>` around `<header>` (this theme wraps the nav in a custom `<navigation>`
directive element, itself inside a `<section>`), leaving `<header>` unpositioned - confirmed via a
live DOM inspection loop that isolated it to specifically the `<header>` tag one level down, not the
wrapper, not the ancestor chain, not the CSS rule itself. No confirmed root cause beyond "this exact
nesting triggers it in Blink" - if a future theme's sticky header mysteriously doesn't stick despite
every classic cause checking out clean, try moving `position: sticky` one level up before spending
more time on it.

### A mobile `@media` override lost to an unconditional same-specificity rule declared later in the file

A mobile-only block (`@media (max-width: 767px)`) set `.mt-minicart-panel { width: auto; ... }`
and `.mt-minicart { position: static; }` to stop the mini-cart dropdown from overflowing past
the viewport edge on narrow screens. It kept losing anyway: several thousand lines further down
the file, an **unconditional** (non-media) `.mt-minicart-panel { width: 340px; ... }` and
`.mt-minicart { position: relative; }` block existed from when the feature was first built.
Same specificity (single class selector) on both sides, so **source order** decided it, and the
later unconditional rule always won regardless of viewport — a media query's relevance to
"mobile" counts for nothing in the cascade; only specificity and position in the file do.

**Rule: before shipping an override for any selector, grep the whole file for that selector
first.** If a same-specificity rule for it already exists elsewhere, either place the new
override physically after that rule (right next to it, so the relationship is visible in the
file), or bump specificity on purpose — don't rely on `@media` scoping alone to win a tie. Also:
a fix that visually checked out once right after deploying isn't proof it's correct if that
check was informal — verify overrides like this on a real narrow device after every subsequent
change to the same file, not just once.

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

### `overflow: hidden` + `border-radius` can silently stop clipping a large absolutely-positioned image — `isolation: isolate` fixes it

A tile with `position: relative; border-radius: 14px; overflow: hidden;` containing a large
absolutely-positioned `<img>` filling it via `inset: 0` rendered with **hard square corners** —
the photo completely ignored the parent's rounded clip, even though the parent's own box was
genuinely rounded (confirmed by temporarily giving it a plain `outline`, which showed the correct
curve) and `getComputedStyle()` reported the correct `border-radius` the entire time. The
computed style being correct is not proof the clip is actually being applied — check the real
rendered corner (a screenshot, or a temporary bright `outline` on the container to compare its
true shape against what the image is doing).

**Cause**: Chrome promotes a large absolutely-positioned image to its own GPU compositing layer,
and that layer can bypass an ancestor's `overflow: hidden` + `border-radius` clip entirely unless
the ancestor establishes its own stacking context. Adding `isolation: isolate` to the clipping
container (`.mt-dept-tile` here) fixed it immediately — confirmed live by toggling it on and off
and watching the clip start/stop working.

**We broke this once already** by removing `isolation: isolate` in a later pass, assuming it was
only there to support a `::after` gradient overlay we were also removing in that same change — it
wasn't decorative, it was the only thing making the clip work. **If a container relies on
`overflow: hidden` + `border-radius` to clip a large image, don't remove `isolation: isolate`
(or any other stacking-context-establishing property) from it without re-checking the actual
rendered corner, not just re-reading the CSS.**

**Coda — a second, unrelated round of "still looks square" after the real fix landed**: once
`isolation: isolate` was restored, the clip genuinely worked (confirmed with the definitive test
below), but the user still reported square corners. The actual remaining issue was that 14px is
just too small a radius to visually register as "rounded" rather than "square" at this tile's
real rendered size (roughly 280-380px wide) — especially compressed in a screenshot. Bumped to
40px and it read as clearly rounded. **Don't assume every "still looks wrong" report is the same
bug reappearing — verify the actual current state again** (in this case, with
`document.elementFromPoint(tile.getBoundingClientRect().left + 2, top + 2)`: for any radius > 0,
that exact corner pixel can never be part of the rounded shape, so if it resolves to the `<img>`
the clip is broken, and if it resolves to something behind/around it the clip is working — a
strictly more reliable check than eyeballing a screenshot, which is easy to misjudge for a subtle
radius).

**Round three — `isolation: isolate` alone still wasn't 100% reliable across interaction states**:
after the 40px fix shipped, the user reported the corners looking "weird cut off" at rest and
"way more rounded" on hover — i.e. inconsistent between resting and hover-transform-triggered
repaint states, not just uniformly wrong. Root cause: the container's clip (`overflow: hidden` +
`isolation: isolate`) depends on the browser correctly re-applying the compositing-layer clip
every time the child image repaints (e.g. on the `transform: scale(1.06)` hover), and that
re-application isn't perfectly consistent — the corner-pixel test above can pass at rest and still
flash incorrectly for a frame during/around the transform.

**The more robust fix: don't rely solely on the parent's clip — also set `border-radius` directly
on the clipped element itself** (here, `.mt-dept-tile .mt-placeholder-photo { border-radius: 40px }`
in addition to the container's existing clip, not instead of it). This makes the image's own paint
correct regardless of whether the ancestor's compositing-layer clip is applied at that instant.
Verified with the same `elementFromPoint()` corner test run twice — once at rest, once with the
hover transform forced on via JS (`img.style.transform = 'scale(1.06)'`) — both passed on all four
corners of every tile. **Lesson: for "clip a large/transformed child to a rounded container" bugs,
treat the container's `overflow: hidden` + `isolation: isolate` clip as necessary but not
sufficient — belt-and-suspenders with a matching `border-radius` on the child itself is the
reliable fix, especially when the child also has a `transition`/`transform` that triggers repaints.**

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

### `overflow-x: auto` on one axis silently clips the other axis too

Setting only `overflow-x: auto` (no `overflow-y` declared) on a flex row that also contains an
absolutely-positioned dropdown child (`.mt-cat-nav-row` containing `.mt-cat-dropdown`) clipped the
dropdown's vertical overflow completely, even though nothing about the rule looks Y-axis-related.
**Per the CSS spec, if one overflow axis is set to anything other than `visible`, the browser
computes the *other* axis as `auto` too** - you can't have a truly `visible` axis paired with a
non-`visible` one; explicitly writing `overflow-y: visible` next to `overflow-x: auto` doesn't
prevent this, the browser silently resolves your `visible` back to `auto` anyway. If a container
needs horizontal scroll on narrow viewports but must let an absolutely-positioned child (a
dropdown, tooltip, popover) overflow vertically elsewhere, scope the `overflow-x: auto` to a media
query for just the viewport width that actually needs it, rather than applying it unconditionally.

### Order save field-preservation race

When a form field's value needs to be "preserved" across an async `Order.save()` (billing
address, payment method, etc. that some other concurrent save might clobber), **read the value to
preserve inside the save's success callback, at response time** — not before the request was
sent. Capturing it before the request means a *second*, concurrent save (e.g. an automatic
autosave firing from a different section of the checkout page) can overwrite that field with a
stale value while the first save is still in flight, and your "preserved" value is now wrong.

## Category product sorting already exists end-to-end - it's an admin config gap, not a theme gap

Before building a "sort by price / best-selling" feature, check `app/partials/productListView.html`
and `app/js/controllers/categoryCtrl.js` first - **the mechanism is already fully wired and
styled** (a `.mt-sort` `<select>` bound to `currentCategory.SortOptions`, feeding a `sort` scope var
that a `$watch` turns into `sorter`/`direction` inputs for Angular's own `orderBy` filter on the
product grid). It's invisible today only because `currentCategory.SortOptions` - an array of
`{SortValue, Display}` pairs returned by `Category.get(...)` - is empty for every category in this
tenant. **This is set in the Four51 admin per-category, not in theme code.** Any `SortValue` string
becomes a literal client-side `orderBy` field path against the `Product` object (with one special
case: a value containing `"Price"` maps to `StandardPriceSchedule.PriceBreaks[0].Price`); append
`" DESC"` to reverse it.

**"Best Selling" - confirmed NOT available.** The admin's per-category Sort Options screen
(Buyers > [Company] > Groups > Admin > categories tab > edit a category > Sort Options table) is a
**fixed list of exactly 7 built-in options**: Default Sort, Product Name A-Z/Z-A, Product ID
A-Z/Z-A, and Price Lowest-to-Highest/Highest-to-Lowest - there is no free-form field picker and no
sales-volume/popularity option anywhere in it. A "Best Selling" sort is not something the platform
exposes at all here; it would need real custom backend work (aggregating order history yourself),
not a config change.

**Useful technique discovered doing this research:** this theme is a fork of the public
`Four51/Four51Storefront` GitHub repo (also present locally as the `upstream` git remote). When
something looks like it might be a platform-level convention rather than something specific to this
build, `gh search code "<term>" repo:Four51/Four51Storefront` (or `gh api
repos/Four51/Four51Storefront/contents/<path>`) is a fast way to check the reference implementation
without needing to clone it - this is exactly how the sorting mechanism above was confirmed to be
the platform's own intended pattern, not a leftover fragment of this theme's own restyle.

### The sort dropdown's `ng-model="sort"` silently did nothing once actually turned on

Enabling Price sort options in the admin (above) surfaced a real, previously-latent bug: selecting
an option in the `<select>` visibly updated the dropdown but never reordered the product grid.
Root cause, confirmed by walking the live scope chain (`angular.element(el).scope()`, then
`.$parent` repeatedly, checking `hasOwnProperty('sort')` at each level): `productListView.html`
renders inside `categoryView.html`'s `ng-if="!isHome"` section, and **`ng-if` creates its own child
scope** (unlike `ng-show`/`ng-hide`, which don't). `ng-model="sort"` is a bare, undotted primitive
reference - assigning to it from inside that child scope creates a **new, shadowing property on
the child scope** rather than updating `CategoryCtrl`'s own `$scope.sort` that its `$watch('sort',
...)` was actually observing. The watch's callback (which computes `sorter`/`direction` for the
`orderBy` filter) simply never fired again after the first read. This is the classic Angular 1.x
"dot rule" pitfall - **any `ng-model` that might render underneath an `ng-if` (or another
directive/element that creates a child scope) should bind to a property on an object
(`ng-model="thing.value"`), never a bare top-level name** - object property lookups resolve through
the prototype chain to the correct shared object regardless of how many scopes sit in between,
where a bare name gets shadowed the moment any descendant scope writes to it. Fixed by introducing
`$scope.sortSelection = {}` on the controller and binding/watching `sortSelection.value` instead.
Worth auditing for the same pattern anywhere else a bare (non-dotted) `ng-model` sits inside an
`ng-if`.

Separately: the platform's Sort Options API doesn't return a "Default Sort" entry at all (only the
options an admin has explicitly checked Active and that aren't the built-in "no sort" default come
back in `SortOptions`), so the hand-authored placeholder `<option value="">` meant to represent "no
sort selected" had no text and rendered as a blank line in the dropdown. Give it real text
(`{{'Default Sort' | r | xlat}}`) rather than leaving it empty.

## Self-registration already exists natively at `/admin` - don't assume it needs to be built

Went looking for a "create your own account" flow and initially concluded there wasn't one - no
`register`/`signup`/`createaccount` naming anywhere in the codebase, and the Four51 admin's "Custom
Logon Page" (`Buyers/LogonConfig`) and "Auto Profile Logon" (`Buyers/AutoProfileLogon`) features
turned out to be unrelated (the former is just a bare, unbranded fallback login form; the latter is
an SSO template-cloning auto-login mechanism for enterprise integrations, not self-service signup).
**That conclusion was wrong** - the real mechanism was hiding in plain sight under a name that
doesn't say "register" anywhere: `app/partials/userView.html`, routed at `/admin`
(`app/js/routing.js`), is the *same* form used for "My Account" - it branches on `user.Type ==
'TempCustomer'` (the auto-provisioned anonymous session every unauthenticated visitor already has)
to show "Logon as existing user" + "Lost login information" + a genuine "Create Account" panel
(First/Last Name, Username, Password, Email, submitting via the same `save()`/`User.save()` call
"My Account" edits use for a real customer) instead of the account-edit view. It's fully native,
already styled with the same `.mt-checkout-card`/`.mt-btn-accent` classes as the rest of the theme,
and requires zero backend work - it already works.

**Lesson: before concluding a capability doesn't exist, check pages a logged-out/temp session would
actually see, not just what a grep for the obvious feature name turns up** - the searches that led
to the wrong conclusion here were all correct on their own terms (there truly is no `register`-named
anything), the flow just lives under an unrelated-sounding template name because it reuses an
existing form rather than having a dedicated one. `app/partials/controls/login.html` (the standalone
`/login` route) had no link to this at all - fixed by adding a plain "Need an account? Click here"
link to `/admin`, styled like the existing "Need help logging on?" link already on that page.

## Per-site branding: `app/site.json`

There is no CMS behind this theme, and the platform has no field for a home-page
hero. `app/site.json` fills that gap: one deployed file per site, editable in
Four51 without forking the theme.

```json
{
	"favicon": "",
	"logo": { "url": "", "alt": "" },
	"theme": { "accent": "", "accentDark": "", "fontFamily": "", "fontUrl": "" },
	"shipping": { "allowedDomesticMethods": [] },
	"hero": {
		"image": "",
		"eyebrow": "Fall 2026 Collection",
		"heading": "Gear your team for the season ahead.",
		"subheading": "New apparel, drinkware and print kits, priced for your group.",
		"showButton": true,
		"buttonText": "Shop the collection",
		"buttonHref": "catalog"
	}
}
```

- **Hero button**: `hero.showButton` is a true/false switch (default `true`).
  `false` hides the call-to-action button but keeps `buttonText`/`buttonHref`
  in the file, so turning it back on is a one-word edit. Only a real JSON
  boolean is accepted -- a quoted `"false"` is ignored with a console warning,
  since as a non-empty string it would otherwise read as on.
- **Quick Address**: `address.showQuickAddress` (default `true`) shows or hides
  the Google Places "Quick Address" field on every address form -- checkout's
  New Address and the Addresses page. Turn it off for a site whose Google Maps
  key doesn't allow its domain, where the field only shows "Oops! Something
  went wrong." Same true/false rules as `showButton`. `addressinput` has an
  isolate scope, so `AddressInputCtrl` puts `SiteConfig.settings` on its own
  `$scope.site` -- the inherited one from `Four51Ctrl` doesn't reach it.

- `js/services/siteConfigService.js` holds the same keys as hard-coded fallbacks
  and merges the file over them, **ignoring blanks**. A site only fills in what it
  changes, a missing or half-written file still renders the stock theme, and
  clearing a value back to `""` restores the default.
- `Four51Ctrl` sits on `<html>`, so it puts the merged object on `$scope.site` and
  every view and directive below it inherits it. No extra injection needed to read
  branding in a new partial.
- **Logo precedence** (`partials/controls/nav.html`): `site.logo.url`, then the
  platform's `user.Company.LogoUrl`, then the company name as text. Leaving
  `logo.url` blank keeps whatever the admin set in Four51 -- the file is an
  override, not a replacement.
- **Accent colour**: `theme.accent` overrides `--mt-color-accent`, which drives all
  61 accent usages in `custom.css` -- links, buttons, focus rings, active states.
  The service writes it as an inline custom property on `<html>`, where it beats
  the `:root` rule, so `custom.css` keeps the theme default and the file only names
  the change. `theme.accentDark` (hover/pressed) is optional: left blank it is
  derived by darkening the accent 18%. Only colour-shaped values are accepted --
  the string ends up in a CSS declaration.
- **Accent contrast is a two-sided constraint**: the same token is link text *on*
  the page background and the background *behind* white button text, so it needs
  4.5:1 both ways. A brand pink usually does not clear that bar -- Molly Maid's
  logo pink `#db529c` is only 3.68:1 on white. Keep the hue and saturation, drop
  the lightness until it passes: `#B12571` is the same 327.6deg/65.6% at 6.2:1 on
  white and 5.9:1 on the page background, matching the stock teal's 6.4:1.
- **Favicon**: `favicon` repoints both `<link rel="icon">` tags in `index.html`,
  which otherwise stay on the platform's `storefrontfavicon.ico`. The service also
  strips their `type="image/x-icon"`, since the stock links declare ICO and a
  browser that trusts that attribute renders nothing for a PNG.
- **Font**: `theme.fontFamily` overrides `--mt-font-body`. Name just the family --
  the theme's own `'Inter', 'Droid Sans', sans-serif` is appended behind it, so a
  visitor without the font lands on Inter rather than the browser's default serif.
  A stack that already ends in a generic family is used verbatim.
- **`fontFamily` alone does not load anything.** It only names a family; the font
  still has to reach the visitor. `theme.fontUrl` is injected as a `<link
  rel="stylesheet">` for that -- a foundry URL, a Google Fonts one, or any
  stylesheet carrying the `@font-face`. Leave it blank and the family renders only
  for visitors who happen to have the font installed, which is exactly why a brand
  font looks right in-house and wrong in the wild. Check before promising one: many
  brand faces are commercially licensed and absent from Google Fonts, and the
  fallback is silent -- `document.fonts.check()` returns true for any name, so
  measure rendered text width against a deliberately bogus family instead.
- **Font coverage: headings everywhere, body copy inside the `mt-` roots.**
  `--mt-font-body` is set on the 17 page/component roots (`.mt-home`, `.mt-header`,
  `.mt-plp`, `.mt-checkout`, ...) plus a global `h1-h6`/`.h1-.h6` rule. It is *not*
  on `body` -- `bootstrap-451.css` sets `body { font-family: 'Droid Sans' }` and
  `custom.css` never overrides it -- so body copy outside those roots still falls
  back. `body { font-family: var(--mt-font-body) }` would close the gap, at the cost
  of restyling every un-restyled surface at once.
- **Headings were never on the theme font at all.** `bootstrap-451.css` pins
  `h1-h6` and `.h1-.h6` to `'Lato', sans-serif`, and nothing in this app loads Lato,
  so every heading silently fell back to the browser's default sans while body copy
  rendered in Inter. `custom.css` now re-points that exact selector list at
  `--mt-font-body`. Match the list including `.h1-.h6`: those class selectors
  outrank the bare elements, so overriding only `h1-h6` leaves the class form
  behind. It wins on source order alone, so it has to stay below the bootstrap
  `<link>` in `index.html`.
- **Hero image**: set `hero.image` and the woven placeholder gradient gives way to
  the photo, with `.mt-hero-image` adding a scrim and white copy so the text stays
  readable on any image. Leave it blank for the placeholder.
- **An empty shipper list now explains itself instead of vanishing.** The shipping
  method field carried `ng-show="user.ShipMethod != null && shippers"`, and
  **AngularJS 1.2 runs ng-show through `toBoolean()`, which counts an empty array as
  false** -- so the entire row disappeared the moment the list came back empty, with
  nothing to say why. It now tests `shippers != null`, which keeps the row up once the
  list has loaded (empty or not) and still hides it while the fetch is in flight, and
  a `.mt-shipmethod-empty` warning takes the select's place. The select is hidden
  rather than removed, so its `ng-required` still blocks submit -- there is no valid
  way to check out without a method, and this says so instead of failing silently.
- That `toBoolean` behaviour is worth remembering generally: `ng-show="someArray"` is
  false for `[]`, so any "we fetched it and got nothing" state written that way hides
  itself. Test `!= null`, or `.length`, depending on which you mean.
- The multiple-ship select applies `| noliverates` on top of the site.json filtering,
  so its emptiness is tested against `(shippers | noliverates).length` -- it can be
  empty when the single-ship one is not.
- **Testing this in the browser needs `$animate.enabled(false)`.** The app loads
  `angular-animate`, so `ng-hide` is applied asynchronously via `ng-hide-add` and a
  compiled-in-isolation fragment never finishes the transition -- an element mid-hide
  reads as visible and the assertion lies.
- **International-only carriers**: `shipping.allowedInternationalMethods` is the allowlist
  for an order shipping outside `shipping.domesticCountries` (default `['US']`), and
  `allowedDomesticMethods` becomes the domestic one. The rule is symmetric: an international
  address sees only the international list, and a domestic address never sees those
  carriers -- so a carrier named there is kept out of domestic checkout without also
  having to be excluded from `allowedDomesticMethods`. Leave `allowedInternationalMethods` empty and
  country plays no part; `allowedDomesticMethods` then applies everywhere. An unknown country
  counts as domestic, and an empty `domesticCountries` falls back to `US` rather than
  making every address international.
- **The country is resolved in the directive, not the filter.** The live stores that
  do this (`shipperFilter` in `CapitalVacationsUniforms` and `Everstory` under
  `storefront-files`) call `Address.get` from *inside* the filter and `return results`
  before the callback fires, so the first digest yields an empty list and it only
  fills in when a later digest happens to re-run -- and they re-request the address
  every digest, surviving only because `addressService` caches in `store`. A filter
  has to be synchronous. `ordershipping.js` resolves the address before calling the
  filter, which is where waiting is legitimate, and does it once per shipper fetch.
- **Country comes from the order-level ship address.** Rates are quoted per order and
  `$scope.shippers` is shared by both selects, so per-line-item addresses in
  multiple-ship mode do not each get their own list. The live stores have the same
  limitation.
- **Names match in full**, so `Fedex International` does not match `Fedex
  International Priority`; list each variant. The live stores use a case-insensitive
  *substring* (`indexOf('fedex international') > -1`) instead, which catches variants
  automatically but also catches anything else containing the phrase. Exact matching
  was kept here for consistency with every other name in `site.json`.
- **Puerto Rico is not handled.** `Everstory` treats `country === 'US' && state ===
  'PR'` as international because FedEx rates it that way. `domesticCountries` is
  country-only, so a PR address counts as domestic here. Add a state-level setting if
  a site needs it.
- **Restricting shipping methods**: `shipping.allowedDomesticMethods` is an allowlist -- the
  only method *names* the checkout dropdowns may offer, matched against the `Name`
  the API returns, trimmed and case-insensitively. Names, not IDs: the templates
  already bind `shipper.Name` and line items persist `ShipperName`, so names are
  what the app keys on everywhere else. The tradeoff is that renaming a method in
  the Four51 admin silently drops it from the allowlist, and nothing here can
  detect that.
- **Unrestricted is the fallback for every way the key can be absent**: an empty
  list, the `allowedDomesticMethods` key missing, the whole `shipping` section missing, or
  `site.json` itself missing. Same contract as every other blank in `site.json`, and
  the only safe reading -- a site that never fills this in must keep whatever the
  platform offers rather than lose checkout. The filter returns the original array
  untouched in all of those cases.
- **Overrides must match the shape of the default they replace** (`apply` in the
  service). A key defaulting to a list takes only a list; one defaulting to a string
  takes only a string. Anything else is ignored with a `$log.warn`, and the key keeps
  its default while the rest of the file still applies. This is not theoretical:
  `"allowedDomesticMethods": "UPS Ground"` instead of `["UPS Ground"]` used to be stored as a
  string and then iterated character by character, throwing `allowed.join is not a
  function` inside checkout. The filter re-checks the type for the same reason -- the
  difference between an unusable checkout and an unrestricted one is worth the
  duplication.
- **An allowlist fails differently from a blocklist**, which is worth keeping in
  mind when editing the list. A name matching nothing used to be harmless; now it
  removes a method rather than adding one, and a list matching nothing empties the
  dropdown. That is deliberate: silently falling back to every method would let a
  renamed method in the admin quietly re-expose one the site excluded, failing late
  and invisibly. Instead the filter `$log.warn`s naming both the configured list and
  what the order actually offered, so the mismatch is obvious in the console.
- **The filter runs at the source, not in the template.** `ordershipping.js` routes
  all three `Shipper.query` results through one helper so `$scope.shippers` is the
  only list anything sees. Filtering in the template instead would leave the raw
  list behind the name -> object lookup in `updateShipper` and behind the "is the
  saved shipper still available" check, so a hidden method would disappear from the
  dropdown while staying selected on the order. Checking availability against the
  filtered list also means a hidden-but-already-selected method gets cleared and
  re-picked, reusing the existing `Order.clearshipping` path.
- It is gated on `SiteConfig.loaded`, since `site.json` is fetched too -- without
  that, a fast shipper response gets filtered against an empty hide list.
- **This is a UI-level hide, not an entitlement.** The API still returns and still
  accepts the method; the platform decides what a site is entitled to. It can only
  narrow what the dropdowns offer, never add something back.
- **Lists merge whole, not per-entry** (`stringList` in the service): a site can
  shorten a list as well as extend it, and non-string entries are dropped rather
  than failing the file, the same spirit as ignoring a blank string.
- Paths are relative to `<base href>`, i.e. the deployed app folder, the same way
  partials load. An absolute URL to an image hosted elsewhere works too.
- Adding a key means adding it in *both* places -- the JSON and the service's
  defaults. A key only in the JSON is ignored.

## The address form saves on submit only

`partials/controls/addressInput.html` used to call `autoSaveIfValid()` from `ng-blur`
on every text field and `ng-change` on the selects and checkboxes -- 14 hooks. Tabbing
out of a field therefore persisted the address mid-edit.

- A half-typed street line could be written to the address book, and `Address.save`
  round-trips the whole object, so a partially filled form overwrote the stored one.
- Every save broadcasts `event:AddressSaved`, which `ordershipping.js` and
  `orderbilling.js` listen for. They reassign the order's `Ship`/`BillAddressID` and
  set `shipaddressform`/`billaddressform` to false -- so an autosave mid-edit could
  close the form underneath the shopper.
- `orderbilling.js` already carried defensive code for the fallout: a freshly-typed
  credit card lived only on the raw `CreditCard` object and "silently disappeared any
  time a billing field autosaved (e.g. blurring the bill-to name)". Removing the
  autosave removes the situation that guard exists for.

Saving now happens on submit only, via the form's `ng-submit="save()"`. The Google
Places path in `makeAddress` also no longer saves -- picking a suggestion fills the
fields in and nothing more. The submit button reads **Save** rather than Done.

**Testing this needs the directive, not the template.** `addressInput.html` has no
`ng-controller`; `AddressInputCtrl` is attached by the `addressinput` directive. Compile
`<addressinput address="..." user="...">`, not the raw partial -- compiling the partial
alone leaves `ng-submit="save()"` pointing at nothing, and a "no save happened" result
means only that the controller was never there.

## Editing an address did not refresh the card showing it

Both checkout directives resolve the displayed address inside a `$watch` on its id --
`ordershipping.js` watches `currentOrder.ShipAddressID` into `orderShipAddress`,
`orderbilling.js` watches `currentOrder.BillAddressID` into `BillAddress`. The
`event:AddressSaved` handlers then assign `ShipAddressID`/`BillAddressID` from the
saved address.

**Editing an existing address keeps its id**, so that assignment writes the same value
back, the watch never fires, and the card kept showing the pre-edit values until the
page was reloaded. The data was never stale -- `Address.save` writes through to
`451Cache.Address.<id>` and clears `451Cache.Addresses`, so the list and any later
`Address.get` were correct. Only the already-resolved object on the scope was stale.

The watch body is now a named function (`applyShipAddress` / `applyBillAddress`) called
from both the watch and the saved handler, so the saved address goes straight onto the
scope. Extracting it rather than assigning the scope property directly matters: both
watches also copy `FirstName`/`LastName` onto the order or its line items under
`EditShipToName`/`EditBillToName`, and that has to happen on an edit too.

**Watch out for this shape generally** -- `$watch` on an id, with the object fetched in
the callback, silently misses in-place edits. Anywhere the theme does this, saving needs
to push the new object in as well.

## Debugging techniques that paid off this session

- **Verify a deploy from the running app, not with `curl`.** The theme's
  `…/js/<host>.<site>.source.js` is a ~1.9KB loader stub when fetched without a session, so grepping
  it for new code always says "not deployed". Grepping it in a signed-in tab is no better. What works
  is reading the live controller source from the loaded module:
  `angular.module('451order')._invokeQueue` → find the `[name, fn]` entry → `String(fn)`. The code is
  minified, so search for string literals (event names, `reload()`), not local function names.

- **A native `confirm()`/`alert()` dialog will hang browser automation tools.** Both Claude's
  built-in browser and the Claude-in-Chrome extension dispatch clicks/keys through the DOM/CDP,
  which cannot interact with an OS-level native dialog - triggering one (e.g. clicking the
  mini-cart's remove button, which calls `confirm('Are you sure...')`) freezes the tool with a
  30-45s timeout and can wedge the tab entirely. Work around it by overriding the dialog *before*
  triggering the action that opens one: `window.confirm = function(){ return true; };` injected via
  the JS-exec tool. Re-apply after every navigation/reload - it doesn't survive a page load.
- **Instrument `XMLHttpRequest` to capture the real request/response bodies** when a generic
  client-side error message (or a stripped-down server error with no stack trace) hides what
  actually went wrong. Patching `XMLHttpRequest.prototype.open`/`send` to log method, URL, request
  body and response body for every `/api/` call, then reproducing the failure, surfaced the exact
  evidence that cracked the mini-cart bug open: the failing request's line item had `Quantity: 2`
  instead of `1`, proving the client was merging into a line item the server had already deleted -
  something no amount of reading the Angular controller code alone would have made obvious. (Angular
  apps built on `$resource` normally use XHR under the hood even where the code reads like `fetch`
  wrappers - patch both if unsure which is in play.)
- **Record a live DOM+scope timeline instead of trying to catch a race with screenshots.** A
  transient visual glitch (an item flashing duplicate then disappearing) is invisible to a single
  screenshot and too fast to click through manually. Polling both `angular.element(el).scope()`
  state and the actual rendered DOM text into an array every 30-100ms via `setInterval`, running for
  several seconds while the bug is reproduced (either by the agent itself, or - for something that
  only shows up under a real person's exact click timing - by the user interacting with the same
  shared browser tab live while the recorder runs in the background), then filtering the collected
  samples down to only the ones where something changed, turns a "we think it's a timing issue"
  guess into an exact, provable timeline. In this case it proved the underlying data array was
  correct the entire time and only the rendered DOM briefly diverged, which pointed straight at an
  `ng-repeat` tracking bug instead of a data bug.
- **When a symptom doesn't reproduce consistently, don't assume a single cause.** A specific
  product's add-to-cart intermittently threw *different* server exceptions (`Index was out of
  range` on one attempt, `Object reference not set to an instance of an object` on another) even
  after the actual client-side bug was fixed and confirmed working on other products. Isolate by
  testing the SAME sequence against a different, known-simple product before concluding a fix
  didn't work - it can reveal that a specific item's own server-side data is flaky for unrelated
  reasons, rather than the fix being incomplete.
- **`:has()` is safe to use in this theme's CSS** for scoping a rule to one specific structural
  relationship without touching a shared base rule everywhere else (e.g.
  `.mt-section:has(> .mt-quick-actions)` to tighten the gap after just one particular section,
  leaving `.mt-section`'s default spacing untouched elsewhere). Modern evergreen browsers all
  support it; no fallback needed for this theme's target browsers.

## Workflow

- **No branches or PRs — every change commits directly to `master`.** The user explicitly
  changed this convention mid-project ("do not create branches and PRs for changes, just commit
  it directly in our master branch"); the earlier branch+PR+auto-merge workflow described in
  older commit history no longer applies. Always sync first
  (`git fetch origin && git reset --mixed origin/master && git checkout-index -a -f`) so the
  commit's parent is genuinely current — another developer (Jimwell Rabino) also commits
  directly to this same `master`, so check `git log origin/master` for unfamiliar recent commits
  before assuming your local state is caught up.
- **Heredocs break on apostrophes** in commit messages in this shell setup. Use multiple `-m`
  flags instead of a single heredoc-based message, or avoid contractions.
- If your local edit and someone else's already-pushed commit both touch the tail of
  `custom.css` (a common spot since new component CSS tends to get appended there), re-sync and
  re-diff before committing — it's usually two independent, non-overlapping additions rather
  than a real logical collision, but confirm brace balance either way.
- After deploying, **verify against the live server directly** (`curl` the actual `.css`/`.html`
  file with a cache-busting query string) before concluding a fix didn't work — the browser doing
  the visual check is very likely just serving a stale cached copy of an asset, not proof the
  deploy failed. This happened repeatedly this session; the deploy was fine every time.
  **This only works for `.css`/`.html`.** JS is served through a bundled loader that `curl`
  can't see into. For JS changes, use the `_invokeQueue` check under "Debugging techniques".
- Auto-deploy on merge is usually near-instant (seconds to ~1 minute), but **it can silently
  stall for a specific commit** — confirmed once this session via the same `curl`-the-live-file
  check above, still showing the pre-merge content 10+ minutes after merging with no sign of
  picking it up. If a deploy is taking far longer than every prior one in the same session, don't
  keep waiting indefinitely — check the Four51 admin's **Git File Deployment** page for that
  commit and use its **Redeploy** button to force it through manually.
- A live walkthrough via a connected real browser (Claude in Chrome) catches things a code review
  never will — several of the bugs above were only found by actually looking at a rendered page
  at a real mobile width and noticing something was visually wrong, then tracing back to the
  cause.
- **`git fetch` works fine; `git push` over HTTPS does not** in this environment — seen two
  different ways across sessions: a hang (confirmed via `GIT_TRACE`/`GIT_CURL_VERBOSE` stalling
  specifically on the pack-protocol POST body, unrelated to credentials — reproduced across
  plain HTTP/1.1, forced protocol v0, and a larger `http.postBuffer`, so don't bother re-trying
  those tweaks first), and separately a hard failure (`fatal: could not read Username for
  'https://github.com'` — no credential helper configured for HTTPS push specifically). **`gh`
  CLI commands (`gh api`, `gh search code`, etc.) all still work fine either way** — they go over
  plain REST, not git's smart-HTTP pack protocol. Ship changes by building the commit directly
  through GitHub's Git Data API instead: create a blob per changed file (`gh api .../git/blobs`,
  base64 content), a tree from `master`'s current tree (`base_tree`) plus those blobs (`sha: null`
  for a deleted path — the tree endpoint's returned sha should exactly equal what
  `git cat-file -p HEAD` reports as your local commit's tree if the local commit and the API tree
  really match), a commit from that tree with `master`'s current commit sha as parent, then move
  `refs/heads/master` itself to it
  (`gh api repos/<owner>/<repo>/git/refs/heads/master -X PATCH -f sha=... -F force=false`) — no PR
  step, this lands directly (see the no-branches-or-PRs rule above). Re-sync local state
  afterward (`git fetch && git reset --mixed origin/master && git checkout-index -a -f`). A
  reusable script for this exists in scratchpad from when this was worked out
  (`gh_commit.sh` - recreate it the same way if it's not there in a future session: blobs → tree →
  commit → ref-update, one function per step). Worth a quick retry of plain `git fetch` first each
  session in case the underlying issue has resolved - this was environment-specific, not a design
  limitation of git itself.

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
- **One specific product (Molly Maid's "Pan Scraper") intermittently fails to add to cart with a
  raw platform exception** - `Index was out of range...` on one attempt, `Object reference not set
  to an instance of an object` on another, neither consistently, and this is genuinely separate
  from the scope-shadowing bug documented above (confirmed by testing the identical sequence
  against other, unaffected products, which worked cleanly every time both before and after that
  fix shipped). Checked and ruled out: the "Default" price break checkbox being unchecked (normal
  across every product on this tenant, not specific to this one) and the product's "Reserved"
  inventory count (legitimate placed-but-unfulfilled orders, not orphaned test data). Whatever's
  actually wrong is server-side, in this specific product's own data - price schedule and
  inventory tracking config both looked normal in the admin UI, so the cause wasn't identified.
  If this recurs on a future theme/tenant with a specific product behaving the same way, it's
  likely a data issue on that product, not a theme bug - compare its full admin configuration
  against a working product field-by-field, or ask Four51 support to check server-side.
