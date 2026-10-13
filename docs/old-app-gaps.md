# Just4Kids: old app vs new app, gaps and screen map

Created: 2026-10-12. Source: a full read of the old PHP app (`other/`, 65 files) compared with this repository. Product authority stays [project-contract.md](project-contract.md). Repository rules: [AGENTS.md](../AGENTS.md). This document supersedes the earlier `docs/parity-phases.md`, which has been removed.

Updated: 2026-10-13. Current descriptions below reflect the implemented slices. Historical test results remain in each slice's evidence; an evidence line that says "not yet browser-verified" records the state when it was written, and the tracker's **Verified** column is the current browser status. The owner browser-verified S1, S2, S4, S5, S7, S10, S11, S13, S14 and S15 on 2026-10-13. The owner confirmed S0 complete on 2026-10-13; S12 browser verification is deferred for now, not marked verified.

This doc answers three questions:

1. What does the old app do that the new one does not? (sections 2–4)
2. Which screens look or flow differently, and how does each old page map to a new one? (section 5)
3. What do we still need the client or owner to decide? (section 8)

Owner decisions already made (2026-10-12):

- **Delivery fee is out of scope.** Do not add it anywhere.
- **Only the administrator records payments.** Barbers see the amounts but never enter them.

---

## 1. Summary

**Starting point:** S0 complete (owner-confirmed). **Built:** S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14 and S15 (15 slices). **Unfinished:** S16 and S17 (2 slices). **Browser-verified:** S1, S2, S4, S5, S7, S10, S11, S13, S14 and S15 (10 of 15 built); S3, S6, S8 and S9 verification remain and S12 verification is deferred for now. “Done” means implemented with recorded green checks; it does not confirm client acceptance.

| # | Gap | Old app | Current new app | Status / remaining work |
|---|---|---|---|---|
| G1 | Barbers without branches | Barbers stand alone | No branch on barbers or bookings (migration 0021); admin types booking cash/link price | Built (S10) |
| G2 | Only the admin records payments | Admin enters money | Admin-only API and payment controls; barber reads amounts | Built (S1) |
| G3 | How money is entered | Per-booking cash/link and daily totals per barber | Typed cash/link invoice price; one full receipt with one method; daily barber collections feed the collection reports | Built (S10, S11); split receipts remain excluded by contract |
| G4 | Blue "locked" time pill (**new request**) | Not in the old app either | Blue pills for breaks, closed days/exceptions and manual locks | S2 verified; S3 built, browser verification remains |
| G5 | Booking details on hover + Arabic time words | Hover tooltip and time words | Hover details and Arabic time words; tap retained | Built (S2) |
| G6 | Phone-first booking form | Phone lookup fills client/address; inline client creation | Phone lookup selects client and last-used address; inline optional name/address for a new phone, saved atomically with the booking | Built (S9); browser verification remains |
| G7 | Booking notes | Notes shown to barber and in WhatsApp | Notes in create/edit, details, revisions and WhatsApp | Built (S4) |
| G8 | Extra address fields | Avenue, gate, blue number and searchable areas | Address extras and searchable Arabic areas; old free-text addresses preserved | Built (S5, S6); S6 browser verification remains |
| G9 | Local Kuwaiti phone | Type 8 digits | Web accepts 8 digits; stores international format | Built (S5) |
| G10 | Barber account fields | Username, full name, gender, nationality, expiry | Phone login, display name, photo, enabled, expiry | Expiry built (S14); phone login retained; gender/nationality not added |
| G11 | More roles | superadmin, admin, **carecenter**, **moder** | One admin + barbers | Awaiting Q5 (S16) |
| G12 | Order tracking report | Printable cross-booking action timeline | Admin-only printable booking timelines by barber, client and visit period, including creation, visits, revisions, payments and WhatsApp sends | Built (S12); browser verification remains |
| G13 | WhatsApp send is recorded | Logs the action before opening WhatsApp | Admin action recorded before opening `wa.me` | Built (S7); records the action, not delivery confirmation |
| G14 | "New booking" marker for barbers | Dot until booking opened | Dot until assigned barber opens booking | Built (S13) |
| G15 | After saving a booking | WhatsApp / back choices | Dialog offers send / return to today's bookings | Built (S7) |
| G16 | Visit length step | Pick one start time | 30 minutes preselected; admin can change length; full window blocked | Built (S8); owner confirmed 30 minutes; browser verification remains |
| G17 | Editing old bookings | Admin can edit past confirmed bookings | Started/finished visits editable as corrections with required reason and history | Built (S15) |

---

## 2. The client's three complaints

| Complaint | Verdict | Details |
|---|---|---|
| 1. See all barbers after login and tap one to book | **Already built** (P6) | `/` shows barber cards with «حجز لهذا الحلاق» (`components/home.tsx`). S0 is complete per owner confirmation; the exact deployed commit is not recorded in this document. |
| 2. Time pills with red / blue / white | **Built** (S2, S3) | Red (booked), white (free) and blue (locked) pills, including manual half-hour locks. S2 verified; S3 browser verification remains. See G4. |
| 3. Barbers not tied to branches | **Built** (S10) | See G1. |

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

Built in S2: `buildSlots` in `apps/web/src/lib/day.ts` returns `free | booked | past | blocked | locked` across 09:00–24:00, extending earlier when the weekly schedule or a dated exception starts before 09:00.

- Half-hours outside the day's working intervals appear blue with a `break` reason; closed weekdays and closing exceptions use `day-off` («إجازة»).
- Booked and already-past pills take precedence over the locked state. A future day off shows blue pills; elapsed times retain the past state.
- `blocked` means the selected visit length would run into a booking, manual lock or closing time, and remains visually distinct from blue.
- Hover shows booking details or Arabic time words; tapping a locked pill shows its reason.
- Light/dark tokens `status-locked` / `status-locked-soft` are implemented.

### Manual half-hour locks (S3, Q11 answered)

**Owner decision (2026-10-13):** yes, the admin can lock/unlock a half-hour directly from the pills, without editing working hours. S3 implements separate time-block records with an optional reason, creator and time, but no client or invoice. On `/bookings/new`, «قفل / فتح الأوقات» switches to half-hour management; choose a free pill, optionally type a reason, then «قفل نصف الساعة». A blue manually locked pill shows its reason and offers «فتح نصف الساعة». Scheduled breaks and days off cannot be opened using this action. Locks must be future half-hours within working hours and one Kuwait day; midnight-crossing locks are refused. Dated exceptions still change working hours for one date.

Recorded tests: `apps/web/tests/day.test.ts` covers scheduled and manual locks, duration conflicts and time words; `booking-slot-pills.test.tsx` covers lock/unlock controls, reason, half-hour scope, errors and employee permissions. API tests cover creation, edits, reassignment, AI, restoration and racing writes. S2 is browser-verified; S3 is Done with full checks green, browser verification remains.

---

## 4. Gaps in detail

### G1 — Barbers without branches

- **Old:** barbers are just users with `role = barber`. There is no branch. The money reports are per barber, plus one salon row.
- **New (S10 built, branch removed 2026-10-13):** migration 0021 drops `employees.branch_id` and `bookings.branch_id` and strips the branch from stored booking snapshots; old history JSON is read without it. Barbers and bookings (old and new) have no branch. The admin types each booking's cash/link price. The booking-based «الفروع» report tab, the haircut «حسب الفرع» breakdown and the booking-report branch filter are gone; branches remain only for daily salon entries (salon/comprehensive reports).
- **Client wants:** barbers without a branch. Branches exist only for money and reports.
- **Implemented:** DB, contracts, API, barber forms without «الفرع», booking pricing/snapshots, reports. Barbers without a branch now appear in availability. Existing booking amounts remain unchanged.
- **Decision:** Q1 answered: the admin types cash + link; no branch-derived booking price. Browser-verified.

### G2 — Only the admin records payments (built, S1)

- **Old:** the barber's "Accept" page has its children and money fields commented out (`barber-order-accept.php`). The barber only marks the visit done. The admin enters the money (`tadeltahsel.php`).
- **New:** `POST /api/bookings/:id/payment` requires `auth.requireAdmin`. Payment controls are hidden for barbers; invoice and payment history remain read-only.
- **Implemented:** API, both web payment-control call sites, contract and permission tests. Browser-verified.

### G3 — How money is entered (decided and built, S10/S11)

- **Old app, two ways:**
  1. Per booking: cash + link typed freely, total = cash + link. The barber's form for this is now switched off.
  2. **Daily per barber** («ادخال تحصيلات الحلاقين»): admin picks barber + date and types normal children, special children, cash and link. There is one row per barber per day, and the inputs are pre-filled from that day's completed bookings. The barber collections report («تقرير تحصيلات الحلاقين») and the comprehensive report («التقرير الشامل») read **these daily rows**, not the bookings.
- **New:** each booking's invoice uses the admin's typed cash + link price. Per-booking receipts remain admin-only: one receipt covers the full invoice under one method (cash, link or KNET).
- **Decision (Q2):** keep per-booking payments and add daily barber collections. `/collections` supports one entry per barber/date, normal/special children, cash/link/KNET, a server-computed total and edit history. Barbers read only their own entries.
- **Reports:** barber and comprehensive collection money, and the invoice/cash collection summary, read daily barber collections. These are separate from per-booking invoice values and receipts. Salon daily entry remains separate.
- **Limit:** typed cash/link invoice fields and daily method totals do not enable split per-booking receipts. The current contract explicitly excludes partial/split receipts; changing that needs an explicit decision. Browser-verified.

### G5 — Hover details and Arabic time words

- **Old:** hovering over a booked pill (desktop) shows the time in words, customer, area, phone, children (special) and status. Hovering over a free pill shows the time in words, e.g. «الرابعة والنصف عصراً».
- **New (S2 built):** hover tooltips show booked-pill details and Arabic time words (صباحاً / ظهراً / عصراً / مساءً / ليلاً); tap details remain for phones. Browser-verified.

### G6 — Phone-first booking form

- **Old flow:** barber card → date → tap a pill (select) or **double-tap** (open the form) → a form that starts with the WhatsApp phone. While typing, it looks up the client. If found, it fills in the name and the whole address. If not found, saving creates the client. The name is optional and defaults to the phone number. Saving also updates the client's address.
- **New flow (S9 built):** barber → date + length → pill → phone lookup and address → counts → save.
- **Implemented:** step 3 starts with a single phone box and live lookup:
  - **Found:** select the client and the last-used address.
  - **Not found:** show inline name + address fields and create the client and address together on save.

  Server rules remain one client per phone and required address parts. Q6 is resolved from `other/temp_bookings.php` per owner direction: a blank name defaults to the international phone number. New client/address/booking/invoice/history save in one transaction; existing client details are never silently overwritten. Browser verification remains.

### G7 — Booking notes

- **Old:** «ملاحظات / Notes» on create and edit. Shown on the barber's order details and added to the WhatsApp message.
- **New (S4 built):** optional booking `notes` (max 1000 characters) in create/edit, DB, responses and revision history. Notes show in booking details, barber visit cards, invoices and WhatsApp text, separately from address instructions. Browser-verified.

### G8 — Extra address fields and area list

- **Old fields:** Area (searchable list from the `areas` table), Block, Street, House, Floor, Apartment, **Avenue (جادة)**, **Gate (G)**, **Blue number (blue)**, map link. The admin's add-customer form also has Route (طريق) and Chalet (شالية).
- **New fields:** area (searchable Arabic list for new dashboard addresses; old free text preserved), block, street, house number, building name, floor, apartment, instructions, Maps link, pin, plus optional `avenue`, `gate` and `blueNumber` (S5 built). Extras appear in address displays, booking snapshots and WhatsApp text.
- **Status:** the managed searchable areas list is built (S6); browser verification remains. Address extras are browser-verified.

### G9 — Local Kuwaiti phone typing

- **Old:** client phone is 8 local digits; barber phone gets `965` added automatically.
- **New (S5 built, web):** client, employee and login phone inputs accept 8 digits and normalize them to `+965…`; explicit international numbers remain supported. Stored values stay international. Browser-verified.

### G10 — Barber account fields and expiry

- **Old:** username + password login (min 6), name and full name, WhatsApp phone, gender, nationality (list), photo, active, **account expiry date**. Login is refused after the expiry date ("حسابك منتهى الصلاحية").
- **New:** phone + password login (min 8), display name, photo, enabled and optional account expiry date (`accessUntil`, S14 built). Expired accounts cannot log in and their existing sessions are ended.
- **Decision (Q8):** phone login stays; expiry is needed and implemented. Gender and nationality were not added. Browser-verified.

### G11 — Extra roles

- **superadmin / admin:** several admin accounts. The new contract allows exactly one administrator.
- **carecenter** (partner, «Care Center»): sees only the barbers on a partner list (`centarhlak`, with sort order), each barber's free/booked half-hours for a date, and taps a free time to open WhatsApp to the business (`99998360`) with a ready booking request. It cannot book or see client data.
- **moder** (moderator): the same partner view, plus the salon daily details and the comprehensive report.
- **New:** none of these. Ask whether the partner is still active (Q5).

### G12 — Order tracking report

- **Old «تتبع الاوردرات»:** pick a barber, then optionally a booking. Shows each booking with its status and every logged action (created, WhatsApp sent, updated, cancelled, completed) with actor, role, time and note. Has a print version.
- **Old «تقرير اوردات عميل»:** search a client by name and period. Shows totals (completed, cancelled, kids, cash, link) and each booking's action timeline.
- **New (S12 built):** admin-only «تتبع الحجوزات» report (`/reports/tracking`) that lists each matching booking with its full timeline — creation, WhatsApp sends, reservation edits/corrections, visit status changes and payments — with actor, role, time and reason. Filters: barber, client and visit-date period; prints cleanly. No new tables: it reads the existing visit, revision, payment and WhatsApp history. Per-booking history (`booking-history.tsx`) and the client report (`/reports/clients`) remain.
- **Remaining:** browser verification. With no period chosen, the report covers the current Kuwait week (Saturday–Friday); a lone from/to date covers 7 days; a period is at most 31 days, on the API and the screen (owner decisions 2026-10-13).

### G13 — WhatsApp send is recorded

- **Old:** «واتساب» goes through `tawgeh.php?wa_id=` / `send_whatsapp.php`, which saves "إرسال تفاصيل الحجز إلى الحلاق عبر واتساب" in the booking's log before opening `wa.me`.
- **New (S7 built):** `POST /api/bookings/:id/sent-to-barber` records the acting admin and time. The day list, booking detail and after-save send action use it; booking history shows the event. This records the action, not WhatsApp delivery confirmation. The sends also appear in the G12 tracking report (S12). Browser-verified.
- **Follow-up found during S9 (2026-10-13):** the existing after-save action calls `send.mutate` and immediately opens WhatsApp/navigates, before the server acknowledges the record. A failed request can therefore leave an opened message without a recorded action. This remains a separate follow-up; S9 changes only client lookup and booking creation.

### G14 — "New booking" marker for barbers

- **Old:** `is_seen_by_barber`. A dot shows on bookings the barber has not opened yet.
- **New (S13 built; Q9 answered yes):** `seenByBarberAt` is set when the assigned barber first opens the booking or invoice. A dot appears in barber home/day/list views until then; reassignment or a changed window resets it. Admin opens do not mark it seen. Browser-verified.

### G15 — After saving a booking

- **Old:** a success message plus two buttons, «إرسال الحجز واتساب للحلاق» and «لا ترسل، رجوع لصفحة حجوزات اليوم».
- **New (S7 built):** a dialog offers «إرسال الحجز واتساب للحلاق» (records the action, opens WhatsApp and the booking) or «لا ترسل، رجوع لحجوزات اليوم». Browser-verified.

### G16 — Visit length step (decided and built, S8)

- **Old:** one start time; a booking blocks only its own half-hour (overlaps are possible).
- **New:** start + length; the web offers 30-minute increments up to 4 hours, and the API accepts 20 minutes–4 hours. The whole window is blocked (no overlaps). The form already preselects 30 minutes.
- **Decision (S8, Q4, 2026-10-13):** the owner confirmed 30 minutes. Existing preselection is retained; the admin can change it. Targeted checks passed; browser verification remains.

### G17 — Editing past bookings (decided and built, S15)

- **Old:** the admin can edit date, time, children, address and notes of any confirmed booking (barber stays the same).
- **New:** future booked visits retain reservation-edit rules. Started or finished visits are editable by the admin as corrections with a required reason, before/after history, and working-hours/overlap checks; past dates are allowed in correction mode. The barber can also be changed. Edits preserve the agreed invoice amount.
- **Decision (Q10):** corrections are needed and implemented. Daily collection amounts are edited separately in `/collections`; a booking correction does not automatically rewrite those entries. Browser-verified.

---

## 5. Screen map: old page → new page

### Admin

| Old page | What it does | New page | Difference |
|---|---|---|---|
| `admin-dashboard.php` | Sidebar (Barbers / System / Reports), barber cards (photo, Live/Offline, location, "Now with … expected end", «كلف الحلاق بمهمة», «Loc now»), 4 tiles: توجيه الحجز, شغل الحلاقين, شغل الصالون, تقرير الصالون | `/` admin home | Same layout idea. New cards show current/next visit and today's count. Live location, GPS overlay, notifications popup and sound are left out. |
| `admin-booking.php?barber_id=` | Barber header, date, 30-min pills (red booked with hover details, selected orange), double-tap opens the form | `/bookings/new?barber=` steps 1–2 | Visit length added (G16). Hover details and tap both work (G5); blue locked pills for breaks and days off (G4). Steps on one page instead of a second page. |
| `temp_bookings.php` | Phone-first form: kids/special (1–10), area list, address, map link, notes, date, time; save → WhatsApp / back | `/bookings/new` steps 3–4 | G6, G7, G8, G15 built. New also counts adults and saves new clients atomically with bookings. |
| `tawgeh.php` «توجيه الحجز» | Date filter; table: barber photo, date, time chip with period, customer ID, kids, special; WhatsApp / edit / cancel | `/bookings` day view | New adds a barber filter and prev/next day. Cancel now asks for a reason (better). WhatsApp send is recorded (G13). |
| `edit_appointment.php` | Edit date, time, kids, address, notes | Booking detail → edit dialog | G7, G17. New can reassign the barber. |
| `admin-order-view.php` | Booking details + change status (unlinked in current menu) | `/bookings/[id]` | Covered. |
| `confirmed-bookings-admin.php`, `cancelled-bookings-admin.php` | Lists by status (only linked from an old dashboard copy) | `/bookings` list + filters | Covered. |
| `newbarber.php`, `edit_barber.php`, `barbers-list.php` | Add / edit / list / stop barbers | `/employees`, `/employees/[id]` | G1, G10. |
| `Working_hours.php` | One start–end per weekday + on/off switch | `/employees/[id]` schedule | New is richer: several shifts per day and dated exceptions. |
| `newcustomer.php`, `editcustomer.php`, `customers_list.php` | Add / edit / stop clients; one address per client | `/clients`, `/clients/[id]` | New allows many addresses and needs a reason to stop a client. G8, G9. |
| `newarea.php` | Manage areas list | `/areas` | Built (S6); names are Arabic per owner decision, instead of the old English names. |
| `newservice.php` | Services & prices (not in menu, prices never used) | — | Not needed: the admin types each booking's cash/link price (S10). |
| `tadeltahsel.php` «ادخال تحصيلات الحلاقين» | Daily barber money entry | `/collections` | Covered (S11). |
| `hlaktahsel.php` «تقرير تحصيلات الحلاقين» | Per barber over a period: clients, normal/special kids, cash, link, total, share | `/reports/barbers` | Covered (S11): reads the daily collections, as in the old app. |
| `tahsel.php` «شغل الحلاقين» | Today per barber + period summary (done/cancelled orders, kids) | `/reports/barbers`, `/reports/haircuts` | Covered by data; not one page. Could become the home tile target. |
| `shamel.php` «التقرير الشامل» | Barbers + salon totals with share | `/reports/comprehensive` | Covered (P5, S11): reads the daily barber collections and filters by period only, as in the old app. |
| `salonwork.php` | Salon daily entry: kids, link, cash, KNET | `/salon` | Covered (P5, per branch). |
| `salonreport.php` | Salon period table + chart + print | `/reports/salon` | Old has a chart; new has a table. |
| `salon_work_details.php` | Salon daily by method + shares (admin/moder) | `/reports/salon` | Partly covered. Missing: each method's % share and the day count; rows are per branch per day, not one row per day. Moderator access waits on G11. |
| `ttaborder.php`, `customerorders.php` | Tracking reports | `/reports/tracking` «تتبع الحجوزات», `/reports/clients` | Covered (S12): per-booking timelines by barber, client and period, with print. |
| `temp-bookings-admin.php`, `complete-temp-booking.php` | Online requests from the public form | — | Left out (customer-facing). |

### Barber

| Old page | What it does | New page | Difference |
|---|---|---|---|
| `barber-dashboard.php` | Two big cards: Today's bookings (open count) and Today's revenue; "Keep GPS ON" | `/` barber home | Same idea (P6). New also lists today's visits. |
| `barber-orders.php` | Open confirmed orders table, any date filter, order popup, new-order dot, Accept / Cancel | `/bookings` («حجوزاتي») | G14. New uses cards and shows all statuses. |
| `barber-order-view.php` | Details, WhatsApp chat with the customer, start / complete | `/bookings/[id]` | Covered (arrived = old "in progress"). |
| `barber-order-accept.php` | "Save & complete" (money fields switched off) | Visit step «تم» | Covered. The barber's payment button is gone (G2, S1). |
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

1. **Price without branches (G1/G3):** if barbers have no branch, does a home visit use one business-wide adult/child price, or does the admin type the amount (as in the old app)? **Answered 2026-10-12:** the administrator types the booking price as cash + link; there is no branch price (S10).
2. **Money entry (G3):** keep per-booking payments (admin only), add a daily per-barber collection entry like the old «ادخال تحصيلات الحلاقين», or both? May one visit be paid partly in cash and partly by link? **Answered 2026-10-12:** both — per-booking payments stay, and a daily per-barber entry is added that the reports read; a barber sees their own entries read-only (S11).
3. **Language:** do the barbers need English screens?
4. **Default visit length (G16) — answered 2026-10-13:** 30 minutes, confirmed by the owner. Keep the existing preselection; the administrator can change it per booking (S8).
5. **Partner/moderator accounts (G11):** is the Care Center partner still active? Do you need more than one admin?
6. **Client name (G6) — resolved 2026-10-13:** yes, follow `other/temp_bookings.php` (lines 252–255) per owner's instruction to use the old app for requirements. The inline booking name is optional and defaults to the international-format phone number. Standalone client creation still requires a name. S9 is built.
7. **Areas list (G8) — answered 2026-10-13:** yes, proceed with the managed searchable list from the old app; the owner chose Arabic names (the old management page used English). S6 is built.
8. **Barber login (G10) — answered 2026-10-12:** keep phone login (the contract's choice; the old app used a username). The client needs the account expiry date: the old app enforced it, so S14 is built.
9. **New-booking dot (G14):** wanted? **Yes (owner, 2026-10-12):** show the dot until the assigned barber opens the booking.
10. **Past bookings (G17):** must the admin be able to fix counts or times on finished visits? **Answered 2026-10-12:** yes, as a correction with a required reason and full history (S15).
11. **Blue pill (G4) — answered 2026-10-13:** yes, the administrator can lock/unlock individual half-hours directly from the pills (S3), with an optional reason.

---

## 9. Suggested order

Built and browser-verified: G1, G2, G3, G4 (scheduled locks), G5, G7, G8 (extras), G9, G10 (expiry), G13, G14, G15, G17. Built, not yet browser-verified: G4 (manual locks, S3), G12 (S12) and G16 (S8). What remains, in order:

S0 is complete (owner-confirmed 2026-10-13). S12 browser verification is deferred for now and does not hold up the remaining build slices.

1. S8 is built: the owner confirmed the existing 30-minute default; browser verification remains.
2. S3 is built (manual half-hour locks; Q11 answered yes). S6 is built (Arabic areas list; Q7 answered); browser verification remains.
3. S9 is built (phone-first client step; Q6 resolved from the old app per owner direction); browser verification remains.
4. Resolve Q5 and build S16 (roles) last before S17. Q3 (English screens) also needs an answer; no implementation slice is currently defined for it.
5. Complete S3, S6, S8, S9 and S12 browser verification before S17, then client review and production rollout.

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
| S0 | Starting point and deploy check | — | — | — | No | XS | Verified (owner-confirmed) | [x] |
| S1 | Payments are admin-only | G2 | S0 | — | No | S | Verified | [x] |
| S2 | Blue locked pills, hover details, time words | G4, G5 | S0 | — | No | M | Verified | [x] |
| S3 | Admin locks a single half-hour | G4 (item 6) | S2 | — | Yes | M | Done | [ ] |
| S4 | Booking notes | G7 | S0 | — | Yes | S | Verified | [x] |
| S5 | Address extras and 8-digit phone typing | G8, G9 | S0 | — | Yes | S | Verified | [x] |
| S6 | Areas list | G8 | S5 | — | Yes | M | Done | [ ] |
| S7 | WhatsApp send recorded + after-save choices | G13, G15 | S0 | — | Yes | S | Verified | [x] |
| S8 | Default visit length | G16 | S2 | — | No | XS | Done | [ ] |
| S9 | Phone-first client step | G6 | S5, S6 | — | No | M | Done | [ ] |
| S10 | Barbers without branches + price source | G1 | S1 | Q1 | Yes | L | Verified | [x] |
| S11 | Daily barber collections | G3 | S1, S10 | Q2 | Yes | L | Verified | [x] |
| S12 | Booking tracking report | G12 | S7 | — | No | M | Done; browser verification deferred | [ ] |
| S13 | "New booking" dot for barbers | G14 | S0 | — | Yes | S | Verified | [x] |
| S14 | Barber account expiry | G10 | S0 | Q8 | Yes | S | Verified | [x] |
| S15 | Corrections on finished visits | G17 | S10, S11 | Q10 | Maybe | M | Verified | [x] |
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
  - Confirm the VPS runs the latest `main` (at least `287a57f`, the branch removal, plus any later S12 commit); if not, redeploy with `scripts/deploy.sh`. `15db80f` (parity phase 6) predates every slice.
- **End:** `pnpm check` green; the server version is recorded below.
- **How to verify:** log in on the live site as admin; the home page shows barber cards with «حجز لهذا الحلاق».
- Evidence: 2026-10-13 — owner confirmed S0 is already complete. No new checks or deployment were performed for this status update; the exact deployed commit is not recorded here.

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
- Evidence: 2026-10-12, commit `c39e363` (merged `a0477bd`). `lib/day.ts`: the pills cover the whole day (09:00–24:00), a new `locked` state with a `break`/`day-off` reason, and a `timeWords` helper. `globals.css`: `status-locked` / `status-locked-soft` tokens, light and dark. Booking page: blue locked pills, hover tooltips for free/locked/booked (booked shows customer, area, phone, haircuts, status), a tap message for why a slot is locked, a day-off row and a legend entry. Tests: `apps/web/tests/day.test.ts` (lunch gap, closed weekday, closing exception, replacement exception, time words at 09:00/12:30/16:30/19:00/22:00). Not yet verified in the browser.

### S3 — Admin locks a single half-hour (G4 item 6)

- **Decision:** Q11 answered yes by the owner on 2026-10-13.
- **Goal:** the admin can lock or unlock one or more half-hours straight from the pills, with an optional reason.
- **Start:** S2 verified; Q11 answered.
- **Work:**
  - New "time block" table + migration.
  - Availability treats a block like a booking: no client, never invoiced.
  - Admin-only create/delete endpoints with CSRF.
  - «قفل / فتح الأوقات» switches the pills to half-hour management; «قفل نصف الساعة» / «فتح نصف الساعة» apply the action, and blocks show as blue with their reason.
- **Tests:**
  - API: a block makes a new booking, an edit, or a reassignment into that time fail.
  - API: an employee cannot create a block.
  - Web: the pill shows as locked.
- **End: Full check.**
- **How to verify:**
  1. Open `/bookings/new` for a barber on a future working date; click «قفل / فتح الأوقات», choose 13:00, add an optional reason and click «قفل نصف الساعة»: the pill turns blue.
  2. Try to book 12:30 with a 60-minute visit: it is refused.
  3. Tap the manually locked pill, click «فتح نصف الساعة», then switch back to booking mode: the time can be booked again, subject to working hours and any other bookings.
- Evidence: 2026-10-13 — Q11 answered yes by the owner. DB: migration `0022_open_valkyrie` adds `employee_time_blocks`, unique barber/date/start, with half-hour start/end, optional reason, creator and timestamp; applied to test and development. Contracts: strict create/response schemas and `scheduleResponseSchema.blocks` (defaults to an empty array). API: admin-only, origin/CSRF-protected `POST /schedules/:id/blocks` and `DELETE /schedules/:id/blocks/:blockId`; future whole half-hours within one day's working hours, rejecting occupied/duplicate/nonworking times, and deletion scoped to the barber. Shared availability reads locks under the existing employee transaction lock for manual/AI creation, edits/reassignment and visit restoration; eligibility excludes overlapping locks. No client, booking or invoice is created. Web: extracted `SlotPills` to `components/booking-slot-pills.tsx`; management mode uses 30-minute windows independently of booking length, inline optional reason, blue manual locks and unlock action, role-gated writes, loading/error recovery and availability cache refresh. Selected booking time clears on lock-management changes; barber/date/duration changes reset the controls. Tests (red → green): contract validation, shared availability boundaries, manual pill reasons/duration conflicts, API permissions/CSRF/scoped reads and deletes/validation/no bookings or invoices/AI/edit/reassignment/restoration/concurrent lock and booking races; real UI controls, HTTP payload and CSRF, unlock, scheduled-break protection, server errors and employee read-only behavior. Baseline full `pnpm check` green: 59 files / 376 tests. Targeted green: 10 files / 102 tests, touched-package lint/typecheck/build. Final full `pnpm check` green: lint, typecheck, 61 files / 388 tests and build. UI detector reported no findings. Product contract and README updated. Browser inventory exposed no available browser session; browser verification remains, not marked Verified.

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
- Evidence: 2026-10-12. Contracts: `avenue`/`gate`/`blueNumber` are optional inputs (`optionalPart`); the address response and the booking snapshot carry them as required-nullable. DB: `0015_legal_xavin.sql` adds the three `varchar(120)` columns to `client_addresses` (renumbered from S5's original `0014` because S4 had already taken `0014`). API: the client repository and the booking create/edit snapshots map the three fields. Web: `AddressFields` inputs, `formatAddress` appends «جادة / بوابة / الرقم الأزرق» so the booking view, invoice and WhatsApp text include them, and `normalizePhone` (via the shared `phoneField`) turns a bare eight-digit Kuwaiti number into `+965…` in the client, employee and login inputs. Tests (red → green): contracts +1 optional-extras case; `apps/api/tests/clients.test.ts` round-trips the three fields and clears the blue number; `apps/web/tests/address.test.ts` +2 and the new `phone.test.ts` cover the display and the phone helper; `day.test.ts` asserts the WhatsApp text contains «جادة 3»، «بوابة 12»، «الرقم الأزرق 5». Green on the merged S4+S5 tree: API 20 files/169 tests, web+contracts 26 files/158 tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`. Not yet verified in the browser.

### S6 — Areas list (G8)

- **Decision:** Q7 answered 2026-10-13: restore the old managed searchable areas list; use Arabic names per owner choice.
- **Start:** S5 verified; Q7 answered.
- **Goal:** pick the area from a searchable list managed by the admin.
- **Work:**
  - `areas` table (Arabic name, active flag) + admin screen (add/edit/stop/reactivate).
  - The address form uses a searchable picker.
  - Existing free-text areas are kept and shown as they are.
- **End: Full check.**
- **How to verify:**
  1. Add «الفنطاس»: it appears in the picker.
  2. Stop it: it disappears from new addresses but stays on old ones.
- Evidence (2026-10-13): restored the old `other/newarea.php` add/edit/stop/reactivate behavior with Arabic names per owner choice. Migration `0023_tearful_next_avengers.sql` adds the initially empty `areas` catalogue (unique name, enabled flag, timestamps); applied to test and development databases. Admin-only `GET/POST /areas` and `PATCH /areas/:id` provide search/status filters, duplicate-name validation and CSRF/origin protection. `/areas` uses the existing Arabic interface with add/rename, search/status filters and stop/reactivate controls. Shared `AddressFields` searches active areas; new-client/new-address forms submit the chosen ID and name, rechecked under the client/address transaction with a share lock. Missing/stopped/renamed selections return `AREA_UNAVAILABLE` (409); failed client creation rolls back. Saved address text and booking snapshots never follow catalogue changes, and edits can retain old free-text/stopped names. Legacy API callers may still send free-text `area` without `areaId`; there is no service-area enforcement. Tests (red → green): `apps/api/tests/areas.test.ts` (permissions, CSRF/origin, duplicates, search, rename/stop/reactivate, stale choices and atomic failure), `apps/web/tests/area-picker.test.tsx` (Arabic search/selection, legacy retention, recoverable errors), `apps/web/tests/areas-screen.test.tsx` (management flow and full client-form payload/CSRF). Baseline: 5 files / 23 tests plus affected-package lint/typecheck/build; targeted: 7 files / 28 tests plus affected-package lint/typecheck/build. Full `pnpm check` green: 64 files / 396 tests, lint, typecheck and build. Also corrected obsolete branch-page descriptions of booking pricing/barber links. No browser was available in this session; owner browser verification remains.

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
- Evidence: 2026-10-12. New table `booking_messages` (one row per send: booking, `kind = sent_to_barber`, acting admin, time) via migration `0018_greedy_mister_sinister.sql` (renumbered from 0017 when S14 merged), applied to test and development MySQL. Contracts: `bookingMessageResponseSchema` / `BookingMessage`. API: `POST /bookings/:id/sent-to-barber` (admin + CSRF) inserts the event and returns it (404 for an unknown booking); `GET /bookings/:id/history` now returns `{ events, messages }`. Web: `WhatsAppButton` records the send then opens `wa.me` (used in the day list and in a new admin button on the booking detail page); after saving a booking a dialog offers «إرسال الحجز واتساب للحلاق» (records, opens WhatsApp, opens the booking) or «لا ترسل، رجوع لحجوزات اليوم»; the «سجل الزيارة» timeline merges visit events and sends with `buildTimeline`, showing «أُرسل للحلاق». Tests: `apps/api/tests/visits.test.ts` (send recorded with actor + time, every send kept, employee/CSRF/unknown-booking refused), `apps/web/tests/booking-timeline.test.ts` (merge order + label); the visits date fixture was zero-padded after adding tests. `pnpm check` green: lint, typecheck, 52 files/345 tests, build — run against an isolated `just4kids_test_s7` because a sibling worktree was resetting the shared `just4kids_test`; the two shared-DB name guards and one connection assertion were relaxed only for that run and reverted. Not yet browser-verified.

### S8 — Default visit length (G16)

- **Decision:** Q4 answered by the owner on 2026-10-13: 30 minutes.
- **Start:** S2 verified; Q4 answered.
- **Goal:** the visit length is preselected, so booking is: barber → tap a pill.
- **Work:** default length in `bookings/new`; the admin can still change it.
- **End:** `apps/web` green.
- **How to verify:** open «حجز لحلاق»: the length is already set, and tapping a free pill selects it straight away.
- Evidence: 2026-10-13 — owner confirmed 30 minutes. No implementation change was needed: `bookings/new/page.tsx` already initializes duration to 30, offers an editable duration selector, clears the selected time when duration changes, and selects a free pill's start/end window on tap. Legacy reference: `other/admin-booking.php` generates 30-minute pills; `other/temp_bookings.php` offers times every 30 minutes but stores identical start/end times, so the legacy grid alone does not define an actual visit length. Existing targeted tests passed: `day.test.ts` and `booking.test.ts`, 2 files / 19 tests (30-minute windows, working hours, overlap blocking, duration bounds). Targeted ESLint for the booking page and day/booking helpers, web typecheck, and web production build passed. Contract updated. Browser verification remains; not marked Verified.

### S9 — Phone-first client step (G6)

- **Decision:** Q6 resolved from `other/temp_bookings.php` per owner direction: optional inline name, defaulting to the phone number. Owner requested the next build slice with the same verification/commit/push workflow while S6 browser verification remained pending; S6 remains Done, not Verified.
- **Goal:** the client step starts with the phone number, like the old form.
- **Start:** S5 verified (8-digit typing); S6 verified (the inline address form uses the areas picker; Q7 answered yes).
- **Work:**
  - Phone box with live lookup.
  - **Found:** pick the client and their last-used address.
  - **Not found:** inline optional name (phone-as-name when empty) + address fields. Saving creates the client, address, booking, invoice and initial history in one transaction.
  - Server rules stay: one client per phone, required address parts.
- **Tests:** API: create-with-new-client succeeds, or fails as a whole (nothing half-saved). Web: found, not-found and stopped-client cases.
- **End: Full check.**
- **How to verify:**
  1. Type a known number: the name and address fill in.
  2. Type a new number, fill in the address and save: the client, the address and the booking all exist.
  3. Type a stopped client's number: a clear Arabic message, and no booking.
- Evidence (2026-10-13): Q6 resolved from `other/temp_bookings.php` lines 252–255 per owner direction; blank inline name uses the international phone number. Contracts add `bookingWithClientCreateSchema` (shared booking window/count/price validation, strict client fields, required catalogue area ID) and `clientLookupResponseSchema.lastUsedAddressId`. Admin-only `POST /bookings/with-client` shares the normal booking transaction's barber lock, availability/manual locks, snapshots, invoice and history logic; it inserts the new client/address inside that transaction, so any failure rolls everything back. Phone uniqueness is enforced by the existing database index; a concurrent/existing registration returns 409 `PHONE_ALREADY_USED` without rewriting the existing client. No migration. Lookup selects the address of the most recently created booking, falling back to the newest saved address; reads still include stopped status. Web step 3 is phone-first (8 local Kuwaiti digits accepted): existing client/address selected, unknown phone gets inline optional name and S6 address fields, stopped client or lookup error blocks saving, and a changed phone clears selection with late responses isolated by query identity. Existing client links prefill the phone; another saved address can still be selected or added. New-client saves issue one atomic booking request; standalone client forms retain their required name. Tests (red → green): `apps/api/tests/phone-booking.test.ts` (admin/CSRF/origin, phone-as-name, last-used address, duplicate phone, rollback and simultaneous saves), `apps/web/tests/phone-booking-client.test.tsx` (found/new/stopped/error and late response), `apps/web/tests/phone-booking-page.test.tsx` (full existing/new save flows, endpoint/payload/CSRF, one POST). Baseline: 6 files / 52 tests plus affected-package lint/typecheck/build. Targeted: 11 files / 70 tests plus affected-package lint/typecheck/build. Full `pnpm check` green: 67 files / 407 tests, lint, typecheck and build. UI detector returned no findings; no browser was available, so owner browser verification remains. Existing after-save WhatsApp acknowledgement issue is recorded under G13 as a separate follow-up.

### S10 — Barbers without branches + price source (G1)

- **Decisions:** Q1 answered 2026-10-12 — the administrator types the booking price as cash + link; there is no branch price. Built with S11's money-entry decision in view; the product contract records both.
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
  2. An old booking still shows its original price (its branch was removed by migration 0021 on 2026-10-13).
  3. The reports' totals did not change for past dates.
- Evidence: 2026-10-12. Contracts: `employees.branchId` optional and `branch` nullable; `bookings.branchId` nullable; the employee snapshot's branch fields default to null; `bookingCreateSchema` gains required `amountCash`/`amountLink`; the invoice replaces adult/child unit-price line items with `amountCash`/`amountLink`/`total`; report branch ids are nullable. DB: migration `0019_equal_maggott` makes `employees.branch_id` and `bookings.branch_id` nullable and swaps the invoice columns (SQL + snapshot + journal hand-written because drizzle-kit's rename prompt is not scriptable here). API: booking creation prices from the typed cash/link; a reservation edit never changes the amount and rejects any reconciliation; the employee repository left-joins branches; the reports left-join branches and add a «بدون فرع» group. Web: the employee form's branch is optional («بدون فرع» option), the booking form takes cash/link and shows their sum, the booking detail/invoice/reports show cash/link, and the edit dialog drops the price preview and reconciliation. Tests: `apps/api/tests/bookings.test.ts`, `booking-edits.test.ts`, `payments.test.ts`, `booking-special-children.test.ts`, reports tests, `packages/contracts/tests/payments.test.ts`, `apps/web/tests/booking.test.ts`, `money.test.ts`. Not yet browser-verified. S11 (daily barber collections) is still to do. Follow-up 2026-10-13 (`287a57f`): migration `0021_normal_spot` dropped `employees.branch_id` and `bookings.branch_id` entirely and stripped the branch from stored booking snapshots; the booking-based branch report, the haircut branch breakdown and the booking-report branch filter were removed (branches remain for salon entries only).

### S11 — Daily barber collections (G3)

- **Decisions:** Q2 answered 2026-10-12 — keep per-booking payments and add a daily per-barber entry that the reports read; a barber may see their own entries read-only.
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
- Evidence (2026-10-12): DB: migration `0020_gigantic_doctor_faustus` adds `barber_collections` (unique barber+date, method amounts, server total) and `barber_collection_events` history, applied to test and development. Contracts: `barberCollection*` create/update/response/event/query/report schemas. API: `/collections` — administrator create/update with history, one entry per barber per day, and a session-scoped read where a barber sees only their own. Web: the `تحصيلات الحلاقين` screen (admin entry + barber read-only) and navigation entries. Reports: the barber report (`/reports/barbers`) and the comprehensive report now read the daily collections for money (the comprehensive barber rows read `barber_collections`, not per-booking receipts); the invoice/cash report's cash summary also reads them. Tests: `apps/api/tests/collections.test.ts` (unique, admin-only/CSRF, caller-controlled total rejected, employee own-only, totals, history) and the report tests (`performance-reports`, `salon`, `client-invoice-reports`) now assert the reports read the entries. Full `pnpm check` green: 54 files / 346 tests and build.

### S12 — Booking tracking report (G12)

- **Browser verification:** deferred for now by the owner on 2026-10-13. Implementation remains Done; verification is still required before S17.
- **Goal:** one printable timeline of everything that happened to bookings, by barber or client, over a period.
- **Start:** S7 verified (so WhatsApp sends appear too).
- **Work:**
  - Admin endpoint merging visit, revision, payment and WhatsApp events (filters: barber, client, from/to).
  - Report tab «تتبع الحجوزات» with print.
- **Tests:** API: filters, ordering, admin-only. Web: renders the events.
- **End: Full check.**
- **How to verify:** pick a barber and a week. Each booking lists created → sent → arrived → completed → paid, with who did each step and when, and prints cleanly.
- Evidence: 2026-10-13. Contracts: strict `bookingTrackingQuerySchema` (barber/client/from/to, valid dates and ordered inclusive range) and grouped timeline response. API: admin-only `GET /reports/tracking` merges visit events, reservation revisions/corrections, payment events (including undo and historical adjustments), recoverable receipts and WhatsApp sends, with actor/name/role/time/reason; creation uses the shared visit-history serializer, recovering older creation rows from existing booking data without writing new records. The period selects Kuwait visit dates; bookings order by visit date/start/id descending, then all their events by time ascending (version/type/id break ties). Web: Arabic «تتبع الحجوزات» tab at `/reports/tracking`, period/barber/searchable-client filters (including stopped clients), shared per-booking history labels/details, phone cards and printable wide tables using the existing reports layout/print button/styles. No migration or new tables. Tests (red → green): contracts +2 query-validation tests, `apps/api/tests/booking-tracking.test.ts` +4 (admin/employee/unauthenticated, read-only GET without CSRF, filters/inclusive boundaries/empty period, ordering, every source, actor roles/reasons, creation reuse and receipt deduplication), `apps/web/tests/booking-tracking.test.ts` +2 grouping/label/detail tests and `booking-tracking-report.test.tsx` +4 rendering/mobile/print/filter/tab tests. Baseline green: 33 files / 200 tests plus touched-package lint/typecheck/build. Targeted green: 40 files / 276 tests plus touched-package lint/typecheck/build. Full `pnpm check` green: lint, typecheck, 59 files / 371 tests and build. Not yet browser-verified. Follow-up 2026-10-13 (owner decision): with no period chosen, the report covers the current Kuwait week, Saturday–Friday (shared `currentKuwaitWeek` in contracts, applied by the API and by the web filters/scope; the address keeps only what was chosen); tests (red → green): contracts week boundaries, API default week and an explicit single bound kept as-is, web period fallback and the prefilled form. Full `pnpm check` green: lint, typecheck, 59 files / 374 tests and build. CodeRabbit review of `6ad10c3..f6e1af3` (2 minor findings), fixed 2026-10-13: the period is capped at 31 days and a lone bound becomes a 7-day week (shared `trackingPeriod`/`TRACKING_MAX_DAYS`, API 400 and an Arabic form error); history rows are grouped per booking once; README and the product contract no longer describe branches on barbers/bookings and document the tracking report. Full `pnpm check` green: lint, typecheck, 59 files / 376 tests and build.

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
- Evidence: 2026-10-12. Q8 answered from the legacy app (`other/login-check.php` checked `users.expdate` and refused an expired login), so the end date is needed. Contracts: `employeeAdminUpdateSchema` accepts `accessUntil` (`YYYY-MM-DD` or `null`) and `employeeResponseSchema` returns it nullable. DB: `0017_absurd_jackal.sql` adds the nullable `access_until` date to `accounts`. API: `verifyCredentials` returns `expired` when a correct password belongs to an account past its end day, `POST /auth/login` refuses it with 403 `ACCOUNT_EXPIRED` and «حسابك منتهى الصلاحية، برجاء مراجعة الإدارة», and `findSession` drops the sessions of an expired account; the employee repository maps the field. Web: a «تاريخ انتهاء الحساب» date field on the barber page. Tests (red → green): contracts +1 (accepts a day, clears with null, rejects a malformed day); `apps/api/tests/employees.test.ts` "refuses an expired barber with a clear message and ends their existing sessions" (set yesterday → the existing session is 401, login is 403, clear the date → 200); new `apps/web/tests/employee-form.test.ts`. Green: contracts+web 27 files/162 tests, API 20 files/172 tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`. Not yet verified in the browser.

### S15 — Corrections on finished visits (G17)

- **Decisions:** Q10 answered 2026-10-12 — a finished or already-started visit stays editable, but only as a correction that must state a reason; the old app's `edit_appointment.php` edited any appointment with only working-hours and slot checks.
- **Start:** S10 and S11 verified; Q10 answered.
- **Goal:** the admin can fix counts or times on finished visits, with a required reason and full history.
- **Work:** an admin "correction" edit for completed or past visits. It records a reason and the before/after values; money follows the payment-reconciliation rules (or S11 if daily entry is chosen).
- **End: Full check.**
- **How to verify:** fix the children count on yesterday's completed visit: the history shows the reason and the old/new values, and the reports update.
- Evidence (2026-10-12): the reservation edit now also acts as a correction. API: `PATCH /bookings/:id` treats a started or finished visit (`visitStatus !== "booked" || start <= now`) as a correction — it requires a `reason` (400 `CORRECTION_REASON_REQUIRED` otherwise), may be moved into the past (the future-start rule is skipped), and still runs the barber working-hours and slot-conflict checks; every change is kept in `booking_revisions` with the before/after values and the reason. A not-yet-started reservation keeps its old rules unchanged. Web: `isCorrection` (started or finished) drives the booking page, which shows «تصحيح الحجز» and the edit dialog in correction mode — past dates allowed and a required «سبب التصحيح» field; the «التعديلات» tab already shows the reason and the old/new values. Tests (red → green): `apps/api/tests/booking-edits.test.ts` (a started visit is refused without a reason and saved with one; a finished visit is corrected; the revision keeps the reason and both versions; a clashing window is still refused) and `apps/web/tests/visit-rules.test.ts` + `apps/web/tests/booking.test.ts` (`isCorrection` and the correction window rule). Full `pnpm check` green: 54 files / 348 tests and build.

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
| S3 | S2 | S16 | — (Q11 answered yes) |
| S4 | S0 | — | — |
| S5 | S0 | S6, S9 | — |
| S6 | S5 | S9 | — (Q7 answered) |
| S7 | S0 | S12 | — |
| S8 | S2 | — | — (Q4 answered) |
| S9 | S5, S6 | — | — (Q6 resolved) |
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

1. **Database migrations.** Drizzle numbers migrations in order (the latest is `0023_…`, so the next is `0024_…`) and keeps one shared journal (`packages/db/drizzle/meta`). Two branches that each generate a migration both create the same number, and the merge breaks. **Rule: only one worktree with a migration at a time.** If a second one is needed, delete its migration after the first merges, rebase, and run `pnpm db:generate` again.
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

As of 2026-10-13: S0 is **Verified** (owner-confirmed); S1, S2, S4, S5, S7, S10, S11, S13, S14 and S15 are **Verified**; S3, S6, S8 and S9 are **Done** (browser verification remains); S12 is **Done** (browser verification deferred for now). Lanes A, B, C and D have no remaining implementation work. S16 is the next build slice after Q5 and its required verification; S12 verification does not block S16.

Everything else waits on a client answer:

- S3's Q11 is answered yes and S8's Q4 is answered; both are Done, with browser verification remaining.
- S6's Q7 is answered and S9's Q6 is resolved; both are Done, with browser verification remaining.
- **S16 runs last** (before S17), after Q5. It adds roles that need a permission check on every endpoint, including ones the other slices add.

### Merge routine for every worktree

1. Branch from the latest `main`. Name it `slice/S<n>-<short-name>`.
2. Before merging, rebase on `main`, then rerun that slice's checks (and `pnpm check` for slices marked Full check).
3. Merge one slice at a time. After each merge, the next worktree rebases before continuing.
4. Commits and merges only when you ask (AGENTS.md).
