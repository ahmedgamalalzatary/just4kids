# Just4Kids: old app vs new app, gaps and screen map

Created: 2026-10-12. Source: a full read of the old PHP app (`other/`, 65 files) compared with this repository. Product authority stays [project-contract.md](project-contract.md). Repository rules: [AGENTS.md](../AGENTS.md). This document supersedes the earlier `docs/parity-phases.md`, which has been removed.

This doc answers three questions:

1. What does the old app do that the new one does not? (sections 2–4)
2. Which screens look or flow differently, and how does each old page map to a new one? (section 5)
3. What do we still need the client or owner to decide? (section 8)

Owner decisions already made (2026-10-12):

- **Delivery fee is out of scope.** Do not add it anywhere.
- **Only the administrator records payments.** Barbers see the amounts but never enter them.

---

## 1. Summary

| # | Gap | Old app | New app | Size |
|---|---|---|---|---|
| G1 | Barbers without branches | Barbers stand alone | Every barber must belong to a branch; prices come from the branch | Large |
| G2 | Only the admin records payments | Admin enters the money; the barber's amount fields are switched off | Barber can press «تسجيل الدفع» | Small |
| G3 | How money is entered | Admin types the amounts (cash + link), per booking or as one **daily total per barber** | Fixed invoice price from the branch, one method, full amount only | Large (needs decision) |
| G4 | Blue "locked" time pill (**new request**) | Not in the old app either | Lunch gaps are hidden; a day off shows "no times" | Small–medium |
| G5 | Booking details on hover + Arabic time words | Hover tooltip; free pills show e.g. «الرابعة والنصف عصراً» | Tap only; no time words | Small |
| G6 | Phone-first booking form | Type the phone → client found and address filled in; new client created in the same form | Search a client, or open a «عميل جديد» dialog, then pick an address in a separate step | Medium |
| G7 | Booking notes | «ملاحظات» field, shown to the barber and in the WhatsApp message | None | Small |
| G8 | Extra address fields | Avenue (جادة), Gate (G), Blue number (blue), area picked from a searchable list | Area typed by hand; no avenue/gate/blue | Small |
| G9 | Local Kuwaiti phone | Type 8 digits | Full international format (`+965…`) | Small |
| G10 | Barber account fields | Username login, full name, gender, nationality, **account expiry date** | Phone login, display name, branch, password, photo | Small–medium |
| G11 | More roles | superadmin, admin, **carecenter**, **moder** | One admin + barbers | Medium |
| G12 | Order tracking report | «تتبع الاوردرات»: every action on every booking for a barber, printable | History only inside one booking | Medium |
| G13 | WhatsApp send is recorded | Sending to the barber is saved in the booking history | Link only, nothing saved | Small |
| G14 | "New booking" marker for barbers | A dot on bookings the barber has not opened yet | None | Small |
| G15 | After saving a booking | Two buttons: «إرسال الحجز واتساب للحلاق» / «لا ترسل، رجوع» | Goes straight to the booking page | Small |
| G16 | Visit length step | Pick one start time only | Must also pick the visit length (window) | Decision |
| G17 | Editing old bookings | Admin can edit any confirmed booking, including past ones and children counts | Only future, still-booked visits | Decision |

---

## 2. The client's three complaints

| Complaint | Verdict | Details |
|---|---|---|
| 1. See all barbers after login and tap one to book | **Already built** (P6) | `/` shows barber cards with «حجز لهذا الحلاق» (`components/home.tsx`). If the client still sees the old flow, the server was probably not redeployed after 2026-10-11. Check before anything else. |
| 2. Time pills with red / blue / white | **Half built** | Red (booked) and white (free) exist. Blue (locked) never existed in either app; it is a new request. See G4. |
| 3. Barbers not tied to branches | **Valid, real difference** | See G1. |

---

## 3. New request: blue "locked" pill (G4)

### What the client wants

Three pill colours on the barber-first booking screen (`/bookings/new`, `SlotPills`):

| Colour | Meaning | Tap |
|---|---|---|
| White | Open, can be booked | Select |
| Red | Booked | Show booking details |
| **Blue** | Locked: lunch break, day off, or closed by the admin | Show why it is locked |

### What exists now

`buildSlots` in `apps/web/src/lib/day.ts` builds pills only **inside** working hours. It returns `free | booked | past | blocked`:

- The lunch gap between two shifts is **not shown at all**.
- A day off (closed day or closing exception) shows the message "no times".
- `blocked` (dashed, grey) means "this visit length would run into another booking or closing time".

### Proposed change

1. Build pills across the barber's **whole day span**: from the earliest normal start to the latest normal end across the week, or a fixed span such as 09:00–24:00 to match the old app's 09:00–23:30 list.
2. Add a `locked` state for half-hours outside the day's working intervals: lunch gaps, before/after the shift, and a closed day or exception. Colour it blue (new tokens `status-locked` / `status-locked-soft`, light and dark).
3. On a day off, show the full row of blue pills with the label «إجازة» instead of the empty message.
4. Tapping a blue pill shows «مغلق: استراحة» (between shifts) or «مغلق: إجازة / استثناء» (closed day).
5. Keep `past` and `blocked` as they are, but make them look clearly different from blue.
6. **Open question:** should the admin be able to lock one half-hour directly from the pills, without editing working hours? That needs a small backend feature (a "time block" record that counts as unavailable, like a booking, but has no client). Today the only way is a dated schedule exception.

Tests: extend `apps/web/tests/day.test.ts` (lunch gap, closed day, exception day). If item 6 is approved, add API tests for availability.

---

## 4. Gaps in detail

### G1 — Barbers without branches

- **Old:** barbers are just users with `role = barber`. There is no branch. The money reports are per barber, plus one salon row.
- **New:** `employees.branch_id` is required. Bookings save the barber's branch and price that branch's adult/child prices. Reports group by branch.
- **Client wants:** barbers without a branch. Branches exist only for money and reports.
- **Change touches:** DB (`employees.branch_id` nullable or removed), contracts, the employee form, booking pricing, booking snapshots, branch and performance reports, the contract text.
- **Blocked by G3:** if barbers have no branch, where does a home visit's price come from? See section 8, Q1.

### G2 — Only the admin records payments (decided)

- **Old:** the barber's "Accept" page has its children and money fields commented out (`barber-order-accept.php`). The barber only marks the visit done. The admin enters the money (`tadeltahsel.php`).
- **New:** `POST /api/bookings/:id/payment` is open to the assigned barber, and the barber sees «تسجيل الدفع» (`components/booking-actions.tsx`).
- **Change:**
  - Add `auth.requireAdmin` to the record-payment route.
  - Hide «تسجيل الدفع» for employees; barbers keep the read-only payment view.
  - Update the contract line "Assigned employees can … record a full payment" and the tests (`apps/api/tests/payments.test.ts`, web tests).

### G3 — How money is entered (needs decision)

- **Old app, two ways:**
  1. Per booking: cash + link typed freely, total = cash + link. The barber's form for this is now switched off.
  2. **Daily per barber** («ادخال تحصيلات الحلاقين»): admin picks barber + date and types normal children, special children, cash and link. There is one row per barber per day, and the inputs are pre-filled from that day's completed bookings. The barber collections report («تقرير تحصيلات الحلاقين») and the comprehensive report («التقرير الشامل») read **these daily rows**, not the bookings.
- **New:** each booking has an invoice priced from its branch. One payment covers the full amount with one method (cash, link or KNET). Reports read those payments. Salon daily entry (P5) already works the "daily total" way, but only for the salon.
- **Options:**
  - A. Keep per-booking invoices, admin-only (after G2). This needs a price source once branches are gone (Q1).
  - B. Add a «تحصيلات الحلاقين» daily entry per barber, like the salon entry. Barber money is then typed by the admin, no prices are needed, and reports read the daily rows, as in the old app.
  - C. Both: bookings stay without money, and only daily entries count.
- Also decide: can one booking be paid partly in cash and partly by link? The old app allowed it; the new one does not.

### G5 — Hover details and Arabic time words

- **Old:** hovering over a booked pill (desktop) shows the time in words, customer, area, phone, children (special) and status. Hovering over a free pill shows the time in words, e.g. «الرابعة والنصف عصراً».
- **New:** tapping a booked pill shows the details below the pills. No hover, no time words.
- **Change:** add a hover tooltip on devices that have a mouse (keep tap for phones), and add the Arabic time-words helper (صباحاً / ظهراً / عصراً / مساءً / ليلاً).

### G6 — Phone-first booking form

- **Old flow:** barber card → date → tap a pill (select) or **double-tap** (open the form) → a form that starts with the WhatsApp phone. While typing, it looks up the client. If found, it fills in the name and the whole address. If not found, saving creates the client. The name is optional and defaults to the phone number. Saving also updates the client's address.
- **New flow:** barber → date + length → pill → search a client (or a «عميل جديد» dialog) → pick or add an address → counts → save.
- **Change:** make step 3 a single phone box with a live lookup:
  - **Found:** select the client and the last-used address.
  - **Not found:** show inline name + address fields and create the client and address together on save.

  Keep the server rules (one client per phone, required address parts). Decide whether the name may default to the phone (Q6).

### G7 — Booking notes

- **Old:** «ملاحظات / Notes» on create and edit. Shown on the barber's order details and added to the WhatsApp message.
- **New:** there are only per-address «instructions». The booking itself has no notes.
- **Change:** add optional `notes` to the booking (contracts, DB, edit and revision history). Show it in the booking detail, the barber views and the WhatsApp text.

### G8 — Extra address fields and area list

- **Old fields:** Area (searchable list from the `areas` table), Block, Street, House, Floor, Apartment, **Avenue (جادة)**, **Gate (G)**, **Blue number (blue)**, map link. The admin's add-customer form also has Route (طريق) and Chalet (شالية).
- **New fields:** area (free text), block, street, house number, building name, floor, apartment, instructions, Maps link, pin.
- **Change:** add optional `avenue`, `gate` and `blueNumber`, and include them in the WhatsApp text. A managed areas list was **left out** in parity scope; ask the client again (Q7), because the old form uses it for every booking.

### G9 — Local Kuwaiti phone typing

- **Old:** client phone is 8 local digits; barber phone gets `965` added automatically.
- **New:** international format is required.
- **Change (web only):** accept 8 digits and add `+965` automatically in the phone inputs. The stored value stays international.

### G10 — Barber account fields and expiry

- **Old:** username + password login (min 6), name and full name, WhatsApp phone, gender, nationality (list), photo, active, **account expiry date**. Login is refused after the expiry date ("حسابك منتهى الصلاحية").
- **New:** phone + password login (min 8), display name, branch, photo, enabled.
- **Gap:** account expiry date. Gender and nationality were stored but never shown anywhere, so they are low value. Username login: the contract chose phone login. Ask only if the client complains (Q8).

### G11 — Extra roles

- **superadmin / admin:** several admin accounts. The new contract allows exactly one administrator.
- **carecenter** (partner, «Care Center»): sees only the barbers on a partner list (`centarhlak`, with sort order), each barber's free/booked half-hours for a date, and taps a free time to open WhatsApp to the business (`99998360`) with a ready booking request. It cannot book or see client data.
- **moder** (moderator): the same partner view, plus the salon daily details and the comprehensive report.
- **New:** none of these. Ask whether the partner is still active (Q5).

### G12 — Order tracking report

- **Old «تتبع الاوردرات»:** pick a barber, then optionally a booking. Shows each booking with its status and every logged action (created, WhatsApp sent, updated, cancelled, completed) with actor, role, time and note. Has a print version.
- **Old «تقرير اوردات عميل»:** search a client by name and period. Shows totals (completed, cancelled, kids, cash, link) and each booking's action timeline.
- **New:** per-booking history (`booking-history.tsx`) and client history report (`/reports/clients`), but no cross-booking action timeline per barber.
- **Change:** add a «تتبع الحجوزات» report that lists history events for a barber or client over a period, with print. The data already exists in the visit, revision and payment history tables.

### G13 — WhatsApp send is recorded

- **Old:** «واتساب» goes through `tawgeh.php?wa_id=` / `send_whatsapp.php`, which saves "إرسال تفاصيل الحجز إلى الحلاق عبر واتساب" in the booking's log before opening `wa.me`.
- **New:** `lib/day.ts` builds the `wa.me` link in the browser and saves nothing.
- **Change:** add a small endpoint that records a "sent to barber" history event, called just before the link opens. Show it in the booking history and in G12.

### G14 — "New booking" marker for barbers

- **Old:** `is_seen_by_barber`. A dot shows on bookings the barber has not opened yet.
- **Change:** store `seenByBarberAt` when the assigned barber first opens the booking, and show a dot in the barber's lists until then. Optional; ask (Q9).

### G15 — After saving a booking

- **Old:** a success message plus two buttons, «إرسال الحجز واتساب للحلاق» and «لا ترسل، رجوع لصفحة حجوزات اليوم».
- **New:** a toast, then the booking page.
- **Change:** show the same two choices after create (WhatsApp uses G13).

### G16 — Visit length step (decision)

- **Old:** one start time; a booking blocks only its own half-hour (overlaps are possible).
- **New:** start + length (20 min – 4 h); the whole window is blocked (no overlaps).
- The new rule is safer. To keep the old speed, preselect a default length (e.g. 30 or 60 min) so the client only taps a pill. Ask which default (Q4).

### G17 — Editing past bookings (decision)

- **Old:** the admin can edit date, time, children, address and notes of any confirmed booking (barber stays the same).
- **New:** edits only while the visit is booked and starts in the future. The barber can be changed (better). Corrections after the visit are limited to status.
- Ask whether the admin needs to fix counts on finished visits (Q10).

---

## 5. Screen map: old page → new page

### Admin

| Old page | What it does | New page | Difference |
|---|---|---|---|
| `admin-dashboard.php` | Sidebar (Barbers / System / Reports), barber cards (photo, Live/Offline, location, "Now with … expected end", «كلف الحلاق بمهمة», «Loc now»), 4 tiles: توجيه الحجز, شغل الحلاقين, شغل الصالون, تقرير الصالون | `/` admin home | Same layout idea. New cards show current/next visit and today's count. Live location, GPS overlay, notifications popup and sound are left out. |
| `admin-booking.php?barber_id=` | Barber header, date, 30-min pills (red booked with hover details, selected orange), double-tap opens the form | `/bookings/new?barber=` steps 1–2 | Visit length added (G16), tap instead of hover (G5), no blue (G4), steps on one page instead of a second page. |
| `temp_bookings.php` | Phone-first form: kids/special (1–10), area list, address, map link, notes, date, time; save → WhatsApp / back | `/bookings/new` steps 3–5 | G6, G7, G8, G15. New also counts adults. |
| `tawgeh.php` «توجيه الحجز» | Date filter; table: barber photo, date, time chip with period, customer ID, kids, special; WhatsApp / edit / cancel | `/bookings` day view | New adds a barber filter and prev/next day. Cancel now asks for a reason (better). WhatsApp send is not recorded (G13). |
| `edit_appointment.php` | Edit date, time, kids, address, notes | Booking detail → edit dialog | G7, G17. New can reassign the barber. |
| `admin-order-view.php` | Booking details + change status (unlinked in current menu) | `/bookings/[id]` | Covered. |
| `confirmed-bookings-admin.php`, `cancelled-bookings-admin.php` | Lists by status (only linked from an old dashboard copy) | `/bookings` list + filters | Covered. |
| `newbarber.php`, `edit_barber.php`, `barbers-list.php` | Add / edit / list / stop barbers | `/employees`, `/employees/[id]` | G1, G10. |
| `Working_hours.php` | One start–end per weekday + on/off switch | `/employees/[id]` schedule | New is richer: several shifts per day and dated exceptions. |
| `newcustomer.php`, `editcustomer.php`, `customers_list.php` | Add / edit / stop clients; one address per client | `/clients`, `/clients/[id]` | New allows many addresses and needs a reason to stop a client. G8, G9. |
| `newarea.php` | Manage areas list | — | Left out (Q7). |
| `newservice.php` | Services & prices (not in menu, prices never used) | Branch prices | Not needed. |
| `tadeltahsel.php` «ادخال تحصيلات الحلاقين» | Daily barber money entry | — | G3. |
| `hlaktahsel.php` «تقرير تحصيلات الحلاقين» | Per barber over a period: clients, normal/special kids, cash, link, total, share | `/reports/barbers` | New reads booking payments, old reads daily entries (G3). |
| `tahsel.php` «شغل الحلاقين» | Today per barber + period summary (done/cancelled orders, kids) | `/reports/barbers`, `/reports/haircuts` | Covered by data; not one page. Could become the home tile target. |
| `shamel.php` «التقرير الشامل» | Barbers + salon totals with share | `/reports/comprehensive` | Covered (P5); source differs (G3). |
| `salonwork.php` | Salon daily entry: kids, link, cash, KNET | `/salon` | Covered (P5, per branch). |
| `salonreport.php` | Salon period table + chart + print | `/reports/salon` | Old has a chart; new has a table. |
| `salon_work_details.php` | Salon daily by method + shares (admin/moder) | `/reports/salon` | Covered. |
| `ttaborder.php`, `customerorders.php` | Tracking reports | `/reports/clients` (partly) | G12. |
| `temp-bookings-admin.php`, `complete-temp-booking.php` | Online requests from the public form | — | Left out (customer-facing). |

### Barber

| Old page | What it does | New page | Difference |
|---|---|---|---|
| `barber-dashboard.php` | Two big cards: Today's bookings (open count) and Today's revenue; "Keep GPS ON" | `/` barber home | Same idea (P6). New also lists today's visits. |
| `barber-orders.php` | Open confirmed orders table, any date filter, order popup, new-order dot, Accept / Cancel | `/bookings` («حجوزاتي») | G14. New uses cards and shows all statuses. |
| `barber-order-view.php` | Details, WhatsApp chat with the customer, start / complete | `/bookings/[id]` | Covered (arrived = old "in progress"). |
| `barber-order-accept.php` | "Save & complete" (money fields switched off) | Visit step «تم» | Covered. Payment button must go (G2). |
| `barber-order-cancel.php` | 7 fixed reasons | `CancelVisitDialog` | Covered (P6). |
| `barber-performance.php` | Own daily rows: kids, special, cash, online, total, completed, cancelled, % shares | `/reports/barbers` («أدائي») | Check the daily breakdown and % columns. |
| — | — | `/schedule`, `/profile` | New only. |

### Partner / moderator

| Old page | New page |
|---|---|
| `carecenter.php`, `carecenter-barber-slots.php` | — (G11) |
| `moder.php`, `moder-barber-slots.php`, `shamelmoder.php`, `salon_work_details.php` | — (G11) |

### Shared / public

| Old page | New page |
|---|---|
| `login.php` (username, "Keep me signed in") | `/login` (phone; 7-day session) |
| `index.php` (public landing, ads, contact form, PWA install) | Left out |
| `quick-book.php` (public quick booking → WhatsApp) | Left out |

### Layout and look

- Old admin pages mix English and Arabic; the barber pages are English with Tagalog button text («CLICK HERE / PINDUTIN DITO»). The new app is Arabic-only by contract. If the barbers read English or Tagalog better, raise it again (Q3).
- Old booking is two pages (pills page → form page). New is one page with five steps.
- Old uses tables almost everywhere (barbers, clients, day list, barber orders). New uses cards on phones and tables on wide screens.
- Old pages each have their own top bar with Back + Logout. New has one shell: sidebar on desktop, bottom bar on phones.
- Old time format is 12-hour English (`5:00 pm`). Check that the new pills use the same 12-hour Arabic style the client expects.

---

## 6. Left out on purpose (do not build unless the client asks again)

- Delivery fee (owner decision 2026-10-12).
- Live GPS tracking, "Loc now", the GPS-required overlay.
- Notifications popup, sound, browser/push notifications, screen wake lock.
- PWA install, public landing page, public quick-book and online requests.
- English/Tagalog UI.
- Services & prices list (never used for money in the old app).

---

## 7. Old behaviour that must not be copied (bugs)

- `barber-order-accept.php` with the fields switched off: completing a visit saves **0 children and 0 KWD** over the booked values.
- Slot check compares start times only, so two bookings can overlap (e.g. 17:00 and 17:15).
- Database errors are shown to users with full messages; `display_errors` is on in production.
- `connect.php` keeps the live database password in the code.
- New clients get their phone number as their password (`temp_bookings.php`).
- Admin cancel writes a fixed text instead of a chosen reason.
- Area list is hard-coded in `admin-booking.php` and `tawgeh.php` as well as stored in the `areas` table. Fintas is wrongly labelled «الفحيحيل» (should be «الفنطاس»).

---

## 8. Questions for the client / owner

1. **Price without branches (G1/G3):** if barbers have no branch, does a home visit use one business-wide adult/child price, or does the admin type the amount (as in the old app)?
2. **Money entry (G3):** keep per-booking payments (admin only), add a daily per-barber collection entry like the old «ادخال تحصيلات الحلاقين», or both? May one visit be paid partly in cash and partly by link?
3. **Language:** do the barbers need English screens?
4. **Default visit length (G16):** 30 or 60 minutes?
5. **Partner/moderator accounts (G11):** is the Care Center partner still active? Do you need more than one admin?
6. **Client name (G6):** may a new client be saved with only a phone number?
7. **Areas list (G8):** do you want a fixed, searchable areas list again?
8. **Barber login (G10):** keep phone login? Do you need an account expiry date?
9. **New-booking dot (G14):** wanted? **Yes (owner, 2026-10-12):** show the dot until the assigned barber opens the booking.
10. **Past bookings (G17):** must the admin be able to fix counts or times on finished visits?
11. **Blue pill (G4):** should the admin lock a single half-hour directly from the pills, or is editing working hours enough?

---

## 9. Suggested order

1. Confirm the server runs the latest version (`15db80f` or later) and show the client.
2. G2 (admin-only payments). Decided; small.
3. G4 + G5 (blue pills, hover, time words). Web-only unless Q11 is "yes".
4. G7, G8, G9, G13, G15. Small items the client uses every day.
5. G6 (phone-first booking).
6. After Q1–Q2 are answered: G1 + G3 together.
7. G12, G14, G11, G10 depending on answers.

---

## 10. Delivery slices and tracker

The work above is split into small slices you can check one at a time. Each slice runs from end to end (contracts → database → API → web → tests) and is finished only when you have checked it yourself.

### Rules for every slice

- **Start:**
  - The slice's "Blocked by" questions are answered and written into this doc (section 8) and [project-contract.md](project-contract.md).
  - The area being changed is green before any edit: lint, typecheck, tests and build for the touched packages.
  - Every slice in its **Depends on** column is "Verified". Only real dependencies count; a slice never waits for unrelated work (see section 11).
- **Work:** tests first (red → green), small steps, no unrequested extras.
- **End:**
  - The touched area is green.
  - Slices marked **Full check** run `pnpm check` for the whole repository.
  - New migrations are applied to the test and development databases.
  - An evidence line is added under the slice: what changed, tests, `pnpm check` result, date.
- **You verify:** follow the slice's "How to verify" steps in the browser (desktop and a phone-width window), then tick "Verified". A slice may be committed only when you ask for it.
- **States:** `Blocked` (waiting for an answer) → `Ready` → `In progress` → `Done` (built + green) → `Verified` (checked by you).

### Tracker

| Slice | Name | Gaps | Depends on | Blocked by | Migration | Size | Status | Verified |
|---|---|---|---|---|---|---|---|---|
| S0 | Starting point and deploy check | — | — | — | No | XS | Ready | [ ] |
| S1 | Payments are admin-only | G2 | S0 | — | No | S | Done | [ ] |
| S2 | Blue locked pills, hover details, time words | G4, G5 | S0 | — | No | M | Ready | [ ] |
| S3 | Admin locks a single half-hour | G4 (item 6) | S2 | Q11 | Yes | M | Blocked | [ ] |
| S4 | Booking notes | G7 | S0 | — | Yes | S | Done | [ ] |
| S5 | Address extras and 8-digit phone typing | G8, G9 | S0 | — | Yes | S | Ready | [ ] |
| S6 | Areas list | G8 | S5 | Q7 | Yes | M | Blocked | [ ] |
| S7 | WhatsApp send recorded + after-save choices | G13, G15 | S0 | — | Maybe | S | Ready | [ ] |
| S8 | Default visit length | G16 | S2 | Q4 | No | XS | Blocked | [ ] |
| S9 | Phone-first client step | G6 | S5, S6 (if approved) | Q6 | No | M | Blocked | [ ] |
| S10 | Barbers without branches + price source | G1 | S1 | Q1 | Yes | L | Blocked | [ ] |
| S11 | Daily barber collections | G3 | S1, S10 | Q2 | Yes | L | Blocked | [ ] |
| S12 | Booking tracking report | G12 | S7 | — | No | M | Ready after S7 | [ ] |
| S13 | "New booking" dot for barbers | G14 | S0 | — | Yes | S | Done | [ ] |
| S14 | Barber account expiry | G10 | S0 | Q8 | Yes | S | Blocked | [ ] |
| S15 | Corrections on finished visits | G17 | S10, S11 | Q10 | Maybe | M | Blocked | [ ] |
| S16 | Partner and moderator accounts | G11 | S2, S3 (if approved), S11 | Q5 | Yes | L | Blocked | [ ] |
| S17 | Client review and production rollout | all | every other slice Verified or dropped | — | — | M | Blocked | [ ] |

S10 and S11 must be planned together (Q1 and Q2 answered at the same time) because both change where money comes from. The order of work and what can run in parallel are in section 11.

---

### S0 — Starting point and deploy check

- **Goal:** know exactly what the client is looking at, and start from a clean, green base.
- **Start:** none.
- **Work:**
  - `docs/parity-phases.md` was removed in the doc reorganisation; this document supersedes it.
  - Run `pnpm check`.
  - Confirm the VPS runs commit `15db80f` or later; if not, redeploy with `scripts/deploy.sh`.
- **End:** `pnpm check` green; the server version is recorded below.
- **How to verify:** log in on the live site as admin; the home page shows barber cards with «حجز لهذا الحلاق».
- Evidence:

### S1 — Payments are admin-only (G2)

- **Goal:** only the administrator records payments; barbers see them read-only.
- **Start:** S0 verified. Payments area green.
- **Work:**
  - API: `POST /api/bookings/:id/payment` requires admin (403 for employees).
  - Web: hide «تسجيل الدفع» for employees; the barber still sees the invoice, its status and the payment history.
  - Contract: replace "record a full payment with its method" in the employee permissions.
- **Tests:** API: an employee gets 403 and the admin succeeds. Web: the button is hidden for employees.
- **End:** touched area green; contract updated.
- **How to verify:**
  1. As a barber, open a completed visit: there is no payment button, and the amount is visible.
  2. As the admin, open the same visit and record the payment.
  3. Back as the barber, the visit shows "paid" with its method.
- Evidence: 2026-10-12. API: `POST /api/bookings/:id/payment` now runs `auth.requireAdmin` (an employee gets 403 `FORBIDDEN`); the payment service keeps its ownership and state checks. Web: `canRecordPayment(booking, isAdmin)` returns false for barbers, and both call sites (booking-detail header and the barber `VisitCard`) pass the session role, so «تسجيل الدفع» is hidden while the invoice, its status and the payment history stay visible read-only. Contract: `docs/project-contract.md` employee-permissions line and the payment paragraphs now state only the administrator records payments. Tests (red → green): `apps/api/tests/payments.test.ts` 21 passed (new "refuses cash recording by employees; only the administrator records" case; the `record` helper defaults to admin; `recordedBy`/actor assertions now the administrator); `apps/web/tests/visit-rules.test.ts` 5 passed (added "never offers cash recording to barbers"). Targeted green: `turbo run lint typecheck` for api+web (6/6 tasks) and `turbo run build` for api+web (4/4 tasks); full API project 20 files/168 tests passed; full web project passed. No migration. Not yet verified in the browser.

### S2 — Blue locked pills, hover details, time words (G4, G5)

- **Goal:** the booking pills show white (open), red (booked) and blue (locked), with details on hover (desktop) and tap (phone).
- **Start:** S0 verified. `apps/web` green.
- **Work:**
  - `lib/day.ts`: build pills over the whole day span, and add a `locked` state with a reason (`break` or `day-off`).
  - New light/dark colour tokens for the locked state.
  - A day off shows a row of blue pills labelled «إجازة».
  - Tooltip on hover for booked, locked and free pills; tap keeps working.
  - Arabic time-words helper (صباحاً / ظهراً / عصراً / مساءً / ليلاً).
- **Tests:** `day.test.ts` covers a lunch gap, a closed weekday, a closing exception, a replacement-hours exception, and the time words at 09:00, 12:30, 16:30, 19:00 and 22:00.
- **End:** `apps/web` green.
- **How to verify:**
  1. Give a barber two shifts (e.g. 10–14 and 16–22): the 14:00–15:30 pills are blue and say «استراحة».
  2. Pick that barber's day off: all pills are blue and say «إجازة».
  3. Hover over a booked pill on desktop: the customer, area, phone, children and status appear.
  4. Repeat on a phone-width window by tapping.
- Evidence:

### S3 — Admin locks a single half-hour (G4 item 6)

- **Blocked by:** Q11 (only if the answer is "yes").
- **Goal:** the admin can lock or unlock one or more half-hours straight from the pills, with an optional reason.
- **Start:** S2 verified; Q11 answered.
- **Work:**
  - New "time block" table + migration.
  - Availability treats a block like a booking: no client, never invoiced.
  - Admin-only create/delete endpoints with CSRF.
  - The pill menu offers «قفل» / «فتح»; blocks show as blue with their reason.
- **Tests:**
  - API: a block makes a new booking, an edit, or a reassignment into that time fail.
  - API: an employee cannot create a block.
  - Web: the pill shows as locked.
- **End: Full check.**
- **How to verify:**
  1. Lock 13:00 for a barber: the pill turns blue.
  2. Try to book 12:30 with a 60-minute visit: it is refused.
  3. Unlock: the time can be booked again.
- Evidence:

### S4 — Booking notes (G7)

- **Goal:** an optional «ملاحظات» field on bookings, visible to the barber.
- **Start:** S0 verified. Bookings area green.
- **Work:**
  - Nullable `notes` (max 1000) in contracts, DB and migration.
  - Included in create, edit, revisions and history.
  - Shown on the booking detail, the barber's visit card and invoice view, and in the WhatsApp text.
- **Tests:**
  - API: create/edit with notes, revision before and after values, the barber can read them.
  - Contracts: length limits.
  - Web: the WhatsApp text includes the notes.
- **End: Full check** (migration).
- **How to verify:**
  1. Create a booking with a note: it shows on the booking page.
  2. Log in as that barber: the note shows on the visit.
  3. Edit the note: the history shows the old and new text.
- Evidence: 2026-10-12. New nullable `bookings.notes` varchar(1000) via migration `0014_sturdy_thunderbolt_ross.sql` (applied to test and development MySQL). Contracts: `notes` is optional on booking create/edit (trimmed, max 1000, blank normalizes to null) and a `string | null` defaulting to null on the booking and invoice responses, so existing stored snapshots (payment `bookingAtReceipt`, revision before/after) still parse. API: create stores notes; an edit sets or clears them (`nextNotes`, blank = clear) and the revision `before`/`after` carry the old and new text; the booking and invoice responses include notes, so the barber reads them on their own booking. Web: a «ملاحظات» textarea on the new-booking form and the edit dialog; the note shows on the booking detail, the barber's visit card and the invoice; the revision timeline lists the old/new note; the WhatsApp text appends `ملاحظات:`. Tests: `packages/contracts/tests/bookings.test.ts` (notes limits/normalization), `apps/api/tests/booking-edits.test.ts` (create + edit notes, barber reads them, revision before/after), `apps/web/tests/day.test.ts` (WhatsApp text includes notes). `pnpm check` green: lint, typecheck, 50 files/329 tests, build. Not yet browser-verified.

### S5 — Address extras and 8-digit phone typing (G8, G9)

- **Goal:** add the old address fields, and type Kuwaiti numbers as 8 digits.
- **Start:** S0 verified. Clients area green.
- **Work:**
  - Optional `avenue`, `gate` and `blueNumber` on addresses (contracts, DB, migration, address form, address display, booking snapshot, WhatsApp text).
  - Phone inputs accept 8 digits and add `+965` automatically; other countries still work with `+`.
- **Tests:**
  - API and contracts: the new fields are optional.
  - Web: phone helper cases (`51100056` → `+96551100056`, `+20…` unchanged).
  - WhatsApp text contains Avenue, Gate and Blue.
- **End: Full check.**
- **How to verify:**
  1. Add a client typing `51100056`: it is saved as `+965 5110 0056`.
  2. Add an address with an avenue, gate and blue number: all three show on a booking and in the WhatsApp message.
- Evidence:

### S6 — Areas list (G8)

- **Blocked by:** Q7.
- **Start:** S5 verified; Q7 answered.
- **Goal:** pick the area from a searchable list managed by the admin.
- **Work:**
  - `areas` table (Arabic name, active flag) + admin screen (add/edit/stop).
  - The address form uses a searchable picker.
  - Existing free-text areas are kept and shown as they are.
- **End: Full check.**
- **How to verify:**
  1. Add «الفنطاس»: it appears in the picker.
  2. Stop it: it disappears from new addresses but stays on old ones.
- Evidence:

### S7 — WhatsApp send recorded + after-save choices (G13, G15)

- **Goal:** every "send to barber" is saved in the booking history, and after saving a booking the admin chooses to send or go back.
- **Start:** S0 verified. Bookings area green.
- **Work:**
  - Admin endpoint that records a `sent_to_barber` history event, called just before `wa.me` opens (day list and booking page).
  - After create, a dialog: «إرسال الحجز واتساب للحلاق» / «لا ترسل، رجوع لحجوزات اليوم».
- **Tests:** API: the event is recorded with actor and time, and employees are refused. Web: the dialog actions work.
- **End: Full check.**
- **How to verify:**
  1. Create a booking and choose "send": WhatsApp opens with the details, and the booking history shows «أُرسل للحلاق».
  2. Create another and choose "back": you land on today's list.
- Evidence:

### S8 — Default visit length (G16)

- **Blocked by:** Q4.
- **Start:** S2 verified; Q4 answered.
- **Goal:** the visit length is preselected, so booking is: barber → tap a pill.
- **Work:** default length in `bookings/new`; the admin can still change it.
- **End:** `apps/web` green.
- **How to verify:** open «حجز لحلاق»: the length is already set, and tapping a free pill selects it straight away.
- Evidence:

### S9 — Phone-first client step (G6)

- **Blocked by:** Q6.
- **Goal:** the client step starts with the phone number, like the old form.
- **Start:** S5 verified (8-digit typing); S6 verified if Q7 was "yes" (the inline address form uses the areas picker).
- **Work:**
  - Phone box with live lookup.
  - **Found:** pick the client and their last-used address.
  - **Not found:** inline name (or phone-as-name, per Q6) + address fields. Saving creates the client and address, then the booking.
  - Server rules stay: one client per phone, required address parts.
- **Tests:** API: create-with-new-client succeeds, or fails as a whole (nothing half-saved). Web: found, not-found and stopped-client cases.
- **End: Full check.**
- **How to verify:**
  1. Type a known number: the name and address fill in.
  2. Type a new number, fill in the address and save: the client, the address and the booking all exist.
  3. Type a stopped client's number: a clear Arabic message, and no booking.
- Evidence:

### S10 — Barbers without branches + price source (G1)

- **Blocked by:** Q1 (and plan it together with S11).
- **Goal:** barbers no longer belong to a branch; branches remain for money and reports.
- **Start:** S1 verified; Q1 and Q2 answered; contract updated; a full-repository baseline is green.
- **Work:**
  - `employees.branch_id` becomes optional or is removed (migration keeps existing data).
  - The barber form loses «الفرع».
  - Bookings take their price from the Q1 answer.
  - Booking snapshots and history stop requiring a branch.
  - Branch and performance reports are reworked to match.
  - The «فروع» screen keeps only what money and reports need.
- **Tests:**
  - API: creating a barber without a branch.
  - API: booking price follows the Q1 answer.
  - API: old bookings keep their saved branch and price.
  - Reports totals.
- **End: Full check.** Migration tested against a copy of the development data.
- **How to verify:**
  1. Add a barber with no branch, then book with them: the price matches Q1.
  2. An old booking still shows its original branch and price.
  3. The reports' totals did not change for past dates.
- Evidence:

### S11 — Daily barber collections (G3)

- **Blocked by:** Q2.
- **Start:** S1 and S10 verified (or built together with S10 in one plan); Q2 answered; a full-repository baseline is green.
- **Goal:** the admin records barber money the way the client works (see Q2), and the reports read from it.
- **Work (if Q2 = daily entry):**
  - `barber_collections` (barber, date, normal/special children, cash, link, KNET, server total, entered by, history).
  - One entry per barber per day, pre-filled from that day's completed visits.
  - Admin screen «تحصيلات الحلاقين».
  - The barber, comprehensive and invoice/cash reports read these entries.
  - Barbers see their own entries read-only.
- **Tests:**
  - API: unique barber+date, admin-only, history, totals.
  - Reports read the entries.
  - An employee sees only their own entries.
- **End: Full check.**
- **How to verify:**
  1. Enter today's money for one barber: the barber report and the comprehensive report show it.
  2. Edit it: the history shows both versions.
  3. Log in as that barber: the entry shows read-only.
- Evidence:

### S12 — Booking tracking report (G12)

- **Goal:** one printable timeline of everything that happened to bookings, by barber or client, over a period.
- **Start:** S7 verified (so WhatsApp sends appear too).
- **Work:**
  - Admin endpoint merging visit, revision, payment and WhatsApp events (filters: barber, client, from/to).
  - Report tab «تتبع الحجوزات» with print.
- **Tests:** API: filters, ordering, admin-only. Web: renders the events.
- **End: Full check.**
- **How to verify:** pick a barber and a week. Each booking lists created → sent → arrived → completed → paid, with who did each step and when, and prints cleanly.
- Evidence:

### S13 — "New booking" dot for barbers (G14)

- **Blocked by:** — (Q9 answered yes, 2026-10-12).
- **Start:** S0 verified; Q9 answered. Bookings area green.
- **Goal:** barbers see which bookings they have not opened yet.
- **Work:**
  - `seenByBarberAt` is set when the assigned barber first opens a booking.
  - A dot shows in the barber's lists and home until then.
  - It resets if the booking is reassigned to them or its time changes.
- **End: Full check.**
- **How to verify:** create a booking for a barber; the barber sees the dot until they open the booking, and it is gone after.
- Evidence: 2026-10-12. New nullable `bookings.seen_by_barber_at` datetime(3) via migration `0015_crazy_sage.sql` (applied to test and development MySQL). Contracts: `bookingResponseSchema` adds `seenByBarberAt: string | null` defaulting to null, so existing stored snapshots (revision before/after, payment bookingAtReceipt) still parse. API: `GET /bookings/:id` (and `/invoice`) sets the marker on the first open by the assigned barber only, via a conditional `seen_by_barber_at IS NULL` update; the administrator never sets it and another barber is denied 403; a reservation edit that moves the window or reassigns the barber clears it, while counts/notes/address-only edits keep it. Web: an orange `NewBookingDot` shows on the barber's visit cards (barber home and the day view) and on the barber's booking-list rows, gated by `isNewForBarber(booking, isAdmin)` so the administrator never sees it. Tests: `apps/api/tests/booking-edits.test.ts` (mark on barber open, not admin and not another barber, clear on window move and on reassignment), `apps/web/tests/visit-rules.test.ts` (marker rules). `pnpm check` green: lint, typecheck, 50 files/335 tests, build. Not yet browser-verified.

### S14 — Barber account expiry (G10)

- **Blocked by:** Q8.
- **Start:** S0 verified; Q8 answered. Auth area green.
- **Goal:** the admin can set an end date on a barber account.
- **Work:**
  - Optional `accessUntil` on accounts.
  - Login after that date is refused with a clear Arabic message, and existing sessions end.
  - Field on the barber page.
- **End: Full check.**
- **How to verify:** set yesterday's date on a test barber; their login is refused with the message. Clear the date and they can log in again.
- Evidence:

### S15 — Corrections on finished visits (G17)

- **Blocked by:** Q10.
- **Start:** S10 and S11 verified; Q10 answered.
- **Goal:** the admin can fix counts or times on finished visits, with a required reason and full history.
- **Work:** an admin "correction" edit for completed or past visits. It records a reason and the before/after values; money follows the payment-reconciliation rules (or S11 if daily entry is chosen).
- **End: Full check.**
- **How to verify:** fix the children count on yesterday's completed visit: the history shows the reason and the old/new values, and the reports update.
- Evidence:

### S16 — Partner and moderator accounts (G11)

- **Blocked by:** Q5.
- **Start:** S2 verified, S3 verified if Q11 was "yes", S11 verified (the moderator reports read its data); Q5 answered; a full-repository baseline is green.
- **Goal:** bring back only the roles the client still needs.
- **Work, depending on the answer:**
  - **Partner:** sees a chosen list of barbers and their free/booked/locked times for a date, and taps a free time to open WhatsApp to the business with a ready request. No client data.
  - **Moderator:** read-only salon and comprehensive reports.
  - **Extra admins:** contract change needed.
- **End: Full check**, including a permission test for every endpoint.
- **How to verify:**
  1. Log in as the partner: only the chosen barbers appear, there are no client details, and tapping a free time opens WhatsApp.
  2. Log in as the moderator: only the allowed reports open.
- Evidence:

### S17 — Client review and production rollout

- **Goal:** the client accepts the new app and it replaces the old one.
- **Start:** every slice is either Verified or marked "not needed" by the client.
- **Work:**
  - Walk the client through every screen from section 5 and record their feedback.
  - Fix what they reject (as new slices).
  - Final `pnpm check`, data import plan, deploy, and keep the old app read-only for rollback.
- **End:** the client confirms in writing; production runs the release; backups are verified.
- **How to verify:** the client books, sends to a barber, completes a visit, records money and opens the reports on the live site without help.
- Evidence:

---

## 11. Dependencies and parallel work (worktrees)

### What depends on what

Read left to right: a slice can start only when everything to its left on the same line is Verified. Slices on different branches do not need each other.

```
S0 ─┬─ S1 ── S10 ── S11 ─┬─ S15
    │                    └──────────┐
    ├─ S2 ─┬─ S3 ───────────────── S16 ── (S17 last)
    │      └─ S8
    ├─ S4
    ├─ S5 ── S6 ── S9
    ├─ S7 ── S12
    ├─ S13
    └─ S14
```

| Slice | Needs (Verified first) | Unlocks | Waiting on question |
|---|---|---|---|
| S0 | — | every slice | — |
| S1 | S0 | S10, S11 | — |
| S2 | S0 | S3, S8, S16 | — |
| S3 | S2 | S16 (if approved) | Q11 |
| S4 | S0 | — | — |
| S5 | S0 | S6, S9 | — |
| S6 | S5 | S9 (if approved) | Q7 |
| S7 | S0 | S12 | — |
| S8 | S2 | — | Q4 |
| S9 | S5, S6 (if approved) | — | Q6 |
| S10 | S1 | S11, S15 | Q1 |
| S11 | S1, S10 | S15, S16 | Q2 |
| S12 | S7 | — | — |
| S13 | S0 | — | — |
| S14 | S0 | — | Q8 |
| S15 | S10, S11 | — | Q10 |
| S16 | S2, S3 (if approved), S11 | S17 | Q5 |
| S17 | every other slice Verified or dropped | — | — |

- No slice needs a slice that comes after it in the list.
- A slice waiting on a question holds up only the slices it unlocks. For example, S3 waiting on Q11 holds up S16 and nothing else.
- "If approved": when the client answers "no" to that slice's question, the slice is dropped and stops being a requirement.

### Why some slices cannot run side by side even without a dependency

1. **Database migrations.** Drizzle numbers migrations in order (`0013_…`, next is `0014_…`) and keeps one shared journal (`packages/db/drizzle/meta`). Two branches that each generate a migration both create `0014`, and the merge breaks. **Rule: only one worktree with a migration at a time.** If a second one is needed, delete its migration after the first merges, rebase, and run `pnpm db:generate` again.
2. **Shared test database.** Every worktree's `.env.test` points at the same `just4kids_test` database, and `pnpm test` migrates and resets it. Two worktrees testing at once corrupt each other's runs. **Rule: each worktree uses its own test database** (e.g. `just4kids_test_s2` in that worktree's `.env.test`, created once), or tests run one worktree at a time.
3. **Ports.** Dev servers use fixed ports (API 4000/4001, web 3000). Run the app from one worktree at a time, or change `PORT` in that worktree's `.env`.
4. **Hot files** that several slices edit (expect small merge conflicts if they run together):

| File | Slices |
|---|---|
| `apps/web/src/lib/day.ts` (pills, WhatsApp text) | S2, S3, S4, S5, S7, S8 |
| `apps/web/src/app/(app)/bookings/new/page.tsx` | S2, S3, S7, S8, S9 |
| `apps/web/src/components/booking-actions.tsx` | S1, S7 |
| `packages/contracts/src/bookings.ts` | S4, S7, S10, S15 |
| `packages/contracts/src/clients.ts` + address form | S5, S6, S9 |
| `packages/contracts/src/auth.ts` + auth module | S14, S16 |
| Reports (`modules/reports`, `components/reports.tsx`) | S10, S11, S12 |

### Lanes (one worktree each)

| Lane | Slices, in order | Migrations |
|---|---|---|
| A — Booking screen | S2 → S8 → S3 | S3 only |
| B — Booking data | S4 → S7 → S12 | S4, maybe S7 |
| C — Clients and addresses | S5 → S6 → S9 | S5, S6 |
| D — Money | S1 → S10 → S11 → S15 | S10, S11, maybe S15 |
| E — Accounts | S14, S13, then S16 last | all three |

### What can start in parallel right now

After S0, these three are safe together:

| Worktree | Slice | Why it is safe |
|---|---|---|
| 1 | S1 — payments admin-only | No migration; API route + one button |
| 2 | S2 — blue pills | No migration; web only (`lib/day.ts`, booking page) |
| 3 | S4 **or** S5 (one of them) | Holds the only migration slot |

Then, as each merges:

- When S4 merges: start S5 (migration slot is free), and S7 if lane B is free.
- When S2 merges: S8 as soon as Q4 is answered.
- When S7 merges: S12 (no migration, can run beside any other worktree).
- **S10 and S11 run alone.** They change pricing, bookings and reports across the repo, so start them from a freshly merged `main` with no other open worktrees, and run the full `pnpm check` before and after.
- **S16 runs last** (before S17). It adds roles that need a permission check on every endpoint, including ones the other slices add.

### Merge routine for every worktree

1. Branch from the latest `main`. Name it `slice/S<n>-<short-name>`.
2. Before merging, rebase on `main`, then rerun that slice's checks (and `pnpm check` for slices marked Full check).
3. Merge one slice at a time. After each merge, the next worktree rebases before continuing.
4. Commits and merges only when you ask (AGENTS.md).
