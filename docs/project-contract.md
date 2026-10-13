# Just4Kids project contract

Agreed scope, captured 2026-09-29. This is the single product contract. Read the repository's [AGENTS.md](../AGENTS.md) before working on the project.

## Purpose and platform

- Home-visit haircut CRM/operations system, mainly for Kuwait. Barbers travel to clients.
- Adults and children are supported. Haircut is the only service.
- Arabic-only, right-to-left web application, responsive on computers, tablets, and phones.
- Arabic WhatsApp AI, built as part of the project, using one number for the entire business.
- TypeScript, Next.js, Express, pnpm, Turborepo, Tailwind CSS, Zod, MySQL, Drizzle, and Vitest.
- Hosting target: the owner's Hostinger KVM1 VPS, deployed with Docker. Initial currency: KWD.

## Accounts and permissions

- Exactly one administrator. The other role is employee/barber; no manager or receptionist role.
- One shared login page using phone number and password.
- Administrator creates employee credentials. No public registration or client dashboard login.
- Administrator manages all branches, employees, schedules, clients, bookings, invoices, payments, and reports.
- Employees manage their own permitted profile details and see only their own records.
- Employee self-editing is limited to display name. Only the administrator changes employee phone, active status, account expiry, and password; employees do not change their own password.
- Confirmed barber account expiry (2026-10-12): the administrator may set an optional end date on an employee account. The account stays valid through that day; afterwards a login is refused with a clear Arabic message and existing sessions stop working. Clearing the date restores access. This restores the old app's account expiry.
- Assigned employees can cancel, mark arrived, mark completed, and mark no-show. Only the administrator records payments; employees see the invoice, its status, and the payment history read-only.
- Employees cannot reschedule or reassign bookings.
- Only the administrator records, corrects, or undoes payment records.
- Backend authorization must enforce ownership even when a record is requested directly.
- Confirmed authentication policy: seven-day server-side MySQL sessions via HttpOnly cookies, with `Secure` in production and CSRF protection on browser changes. The sole administrator's phone/password come from the private server environment and are applied on API restart; changing either revokes existing administrator sessions. Phone numbers use international format. Only the administrator changes employee phones and resets employee passwords; employees edit their display name only.

## Branches and employees

- A branch is a business location used to group money and reports. Confirmed 2026-10-12 (S10) and 2026-10-13 (migration 0021): barbers and bookings have no branch; branches remain only for daily salon entries.
- Each branch keeps its adult/child prices and descriptive haircut durations for reporting, but bookings are no longer priced from them.
- For the first branch-management slice, branch details are name and location/address, with adult/child prices and descriptive haircut durations. No additional branch settings are required in this slice.
- Administrator controls employee working days, working hours, and available times.
- Clients choose a barber, not a branch.
- Administrator can create manual bookings and hand a booking to another available barber.
- Availability is enforced for AI actions, manual bookings, rescheduling, and reassignment.
- Working hours repeat weekly and may contain separate shifts on a day. An administrator can replace one day's hours or close it using a dated exception. Shifts and booking windows stay within one Kuwait calendar day.
- Confirmed 2026-10-13 (S3): the administrator can lock/unlock individual future half-hours directly from the booking pills, with an optional reason. A lock must fit working hours and cannot overlap a blocking booking or another lock. It holds no client or invoice, but blocks the whole overlapping window for booking creation (manual and AI), edits/reassignment, and visit restoration. Unlocking removes only the manual lock; weekly hours and dated exceptions still apply. Barbers cannot create or remove locks.
- Schedule dates and local `HH:mm` times use `Asia/Kuwait`; weekday numbers are Sunday `0` through Saturday `6`. Windows that only touch at an endpoint do not overlap.
- Booked, arrived, and completed visits block the full original reserved window. Cancelled and no-show visits release it. Confirmed on 2026-10-02: a schedule edit that would exclude an existing blocking booking whose reserved end has not been reached in Kuwait must be refused until that booking is moved, cancelled, or ends. At or after the reserved end, past bookings no longer prevent schedule edits; their visit, invoice, and history records remain unchanged.

## Clients and addresses

- Store the main client's name, phone number, and usable service address.
- Confirmed 2026-10-13 (S9, owner-directed parity with `other/temp_bookings.php`): the administrator's booking client step starts with a phone lookup. An existing client and last-used saved address are selected automatically (newest saved address if never booked), with stopped clients refused. An unknown phone shows inline optional name and required address fields; an empty name becomes the international-format phone number. Save the new client, address, reservation, invoice and initial history together or roll back everything. A concurrent registration of the phone is refused and the dashboard refreshes the lookup; it does not overwrite the existing client's name/address. Standalone client creation still requires a name.
- One client record owns each international-format phone number; that exact phone is the primary-contact identity for later WhatsApp lookup.
- Confirmed 2026-10-11: each client has an active/stopped state. The administrator can stop or reactivate a client with a required reason, recorded in the client's status history. A stopped client cannot receive new bookings (the booking attempt is refused with a clear Arabic message); existing bookings and historical records are unaffected. Client lists and lookups show the state.
- Address fields: street, house number, block, floor, apartment, building, and additional instructions where applicable. Floor/apartment need not apply to every property.
- A saved service address requires area/neighborhood, block, street, and at least one of house number or building name. Clients may have multiple saved addresses. Floor, apartment, instructions, Google Maps link, and WhatsApp pin coordinates are optional.
- Confirmed 2026-10-13 (S6): the administrator manages a searchable list of Arabic area names (add, rename, stop/reactivate). New dashboard addresses choose an active area; the API rechecks its ID and name inside the address transaction. Existing free-text addresses can retain their area when edited, and catalogue changes never rewrite saved addresses or reservation snapshots. Legacy API callers may still send free-text `area` without `areaId`; this is an address picker, not geographic service-area enforcement. The catalogue starts empty and is populated by the administrator.
- Accept a WhatsApp location or Google Maps link alongside visit details.
- Reservations record adult/child counts. Separate child names, ages, and saved child profiles are not required.
- Confirmed 2026-10-11: a reservation also records a special-needs child count, an integer `0 ≤ special ≤ childCount`. These are a subset of the children and are priced as children (no pricing change). The count appears on the booking form, edit dialog, booking detail, invoice, and reports (shown beside the child counts).
- Preserve the reservation's address and historical barber/pricing details when current client/employee information changes.

## Reservation rules

- One reservation = one client, one barber, one address, one shared window, one invoice, and one full payment when paid.
- The same barber serves every adult/child in the reservation. No multiple-barber assignment.
- Adult and child counts are non-negative integers; at least one haircut is required.
- Client chooses the date and variable start/end window through AI. Administrator can choose/change it manually.
- Confirmed 2026-10-13 (S8): the administrator's new-booking screen preselects a 30-minute visit. The administrator can change the length per booking; selecting a free time pill uses the chosen length and blocks the full reserved window.
- Confirmed on 2026-10-02: new reservations must start strictly in the future in Kuwait, with no additional lead-time cutoff. This does not decide later WhatsApp rescheduling/cancellation policy.
- Minimum window: **20 minutes**. Maximum window: **4 hours**. Both bounds are inclusive.
- The whole window includes outbound travel, all haircuts, and return travel and blocks the assigned barber.
- Window bounds apply regardless of haircut counts or configured haircut durations. Three 20-minute haircuts may still be booked in an available 20-minute window under this rule.
- Do not calculate maps-based travel time or add a travel buffer outside the selected window.
- Bookings must fit the employee's working availability and cannot overlap another blocking booking.
- Recheck availability at commit time and protect against simultaneous bookings of the same employee.
- Failed rescheduling preserves the original booking/window.
- Confirmed reservation edits (2026-10-02; amended 2026-10-12, S10): administrator-only edits may change address, adult/child counts, window, and assigned barber while the visit is booked and its original start is strictly in the future in Kuwait; a changed window must then also start strictly in the future, without an extra cutoff. A started or finished visit may be edited only as a correction (see S15 below). Edits retain the reservation/reference and invoice identity, actor/time/reason when supplied, and complete previous/new values. An edit never changes the amount. Client rescheduling policy remains pending.
- Keep cancelled/no-show records for history. Arrival means the barber reached the client's address.
- Visit states: booked, arrived, completed, cancelled, no-show. Payment and invoice states are separate.
- Confirmed visit workflow (2026-10-02): booked → arrived/cancelled/no-show; arrived → completed/cancelled/no-show. Normal arrival/completion actions are allowed at or after the reserved start; no-show is allowed at or after the reserved end. Cancellation is allowed from booked or arrived, without an additional timing cutoff. Completed/cancelled/no-show states are final for employees.
- Administrator corrections may change any visit state with a required reason and retained actor/time history. Restoring a blocking state rechecks enabled status, working hours/exceptions, and overlapping bookings. Reopening a cancelled visit restores its existing invoice; invoice identity, agreed amount, payment status, and recorded cash remain unchanged. Correcting a state does not create an invoice or automatically refund cash.
- Visit mutations must reject stale concurrent changes and atomically retain the previous/new visit and invoice statuses with actor, time, and any reason. The original reserved window remains intact when completed.

## WhatsApp journey

1. Client requests haircuts; AI collects adult/child counts.
2. Collect/reuse the primary contact's name, phone identity, address, date, and requested window.
3. Show eligible barbers. Client chooses a named barber or delegates selection to AI.
4. Present the selected visit details and applicable price in the conversation.
5. Validate and save the reservation and invoice together. No administrator approval is required.
6. Reply in Arabic with the result and booking reference.

- AI also reads the client's bookings, reschedules, cancels, and handles related booking conversation.
- Identify the correct reservation before changing it. Sender identity determines client access.
- Confirmed client cancellation policy (2026-10-02): only the authenticated sender's own future booked reservation may be cancelled, with no extra lead-time cutoff. At the start time, after arrival, or in a terminal state, client cancellation is denied. Backend cancellation rules are shared with the dashboard; actual WhatsApp lookup/action wiring remains a later slice.
- AI tools use the same backend validation as the dashboard; no direct database/admin access.
- Duplicate webhooks and retries must not create duplicate operations.
- AI may offer alternatives when a barber/window is unavailable and must not report success before the backend succeeds.
- No separate automated confirmations, reminders, notifications, or campaigns. Conversational replies remain required.

## Prices, invoices, and cash

- Adult/child prices and descriptive durations remain editable per branch for reporting, but do not price bookings (S10).
- Initial KWD prices are exact to three decimal places (1 dinar = 1,000 fils), following the [Central Bank of Kuwait's currency description](https://www.cbk.gov.kw/en/banknotes-and-coins/banknotes/introduction).
- Confirmed booking price (2026-10-12, S10): the administrator types each booking's price as cash + link; the initial invoice total is their exact sum in KWD. There is no branch-derived price, and an edit never changes the amount.
- Confirmed barber collections (2026-10-12, S11): the administrator records one daily collection per barber — normal/special children and cash/link/KNET with a server-computed total — retained with history; a barber reads only their own. The barber, comprehensive, and invoice/cash reports read these daily rows. Daily collections follow only the period and barber filters: the barber and invoice/cash reports hide their collected money (with a note) under any other filter, and the comprehensive report is filtered by period only, as in the old app.
- Confirmed finished-visit corrections (2026-10-12, S15): a started or finished visit stays editable by the administrator, but only as a correction that must state a reason; a change is kept in the reservation revisions with the before/after values, may move the visit into the past, and still satisfies the barber's working hours and slot availability.
- Generate one combined invoice when booked, including manual bookings.
- Confirmed initial invoice fields (2026-10-02; amended 2026-10-12, S10): booking reference, issue date, client and address, barber, adult/child quantities, the typed cash and link amounts, and total in KWD. No tax or additional business/tax fields are required for this slice.
- Snapshot agreed prices. Later price changes do not automatically change existing invoices.
- Changing barber or counts keeps the existing invoice and its amount; retain revision history.
- Confirmed edit pricing (2026-10-12, S10): a reservation edit never changes the agreed amount. The typed cash and link amounts are preserved across count, window, address, and barber changes, and no cash reconciliation is required.
- Changing only the time/address preserves agreed prices.
- Marking paid or completed does not create another invoice or independently change its amount.
- Cancelled invoices remain visible as cancelled; retain any payment history.
- Client pays the full amount at the home visit by one method — cash, payment link, or KNET; the administrator records the single full payment together with its method.
- Confirmed payment-method workflow (2026-10-11, extending the 2026-10-02 cash rule; amended 2026-10-12: only the administrator records payments): one full payment is allowed only for arrived or completed visits, and only the administrator records it. The server uses the complete current invoice amount; callers cannot supply partial amounts. The caller must choose exactly one method (`cash`, `link`, `knet`); the server stores it on the receipt and on every related history event (record, adjustment, and undo). Recording does not complete the visit or change invoice prices. One active payment is allowed per invoice, with historical receipt details retained. Receipts recorded before this change are treated as `cash`.
- Administrator may undo a mistaken payment entry with a required reason, retaining its original values including the method, actor/time history, and any adjustment history. This marks the receipt voided and the invoice unpaid; it does not record a refund or change the visit/invoice amount. A replacement full receipt is permitted under the same payment-recording state rules. Employees cannot undo receipts or record reconciliation adjustments.
- No partial/split payments, deposits, or multiple methods on one payment. A payment link is one of the accepted single methods, not a separate online-payment or deposit flow.
- Administrator corrections retain actor, time, reason, and previous values. No duplicate active payment.
- Cancellation does not automatically refund cash and creates no refund entry.
- Paid-edit reconciliation (2026-10-02) is superseded by S10 (2026-10-12): an edit never changes the invoice amount, so the API rejects a reconciliation on any edit (`RECONCILIATION_NOT_ALLOWED`). Earlier adjustment history stays readable.
- Print invoices and reports using the browser's normal print/Save as PDF function. No custom PDF generator or CSV/Excel exports.

## Salon work (in-shop)

- The shop records a daily in-shop (salon) collection separate from barber bookings: children count and the amounts received by cash, payment link, and KNET machine, each exact to three-decimal KWD; the total is the sum of the three methods.
- One entry per branch per day. The administrator creates and edits entries; every change is retained with actor, time, and before/after values. Employees neither see nor change salon entries.
- Confirmed salon reporting (2026-10-11): the salon report lists the period's daily entries with per-method and overall totals; the comprehensive report rows barbers beside a single salon row with per-method totals and each row's share of the combined collected total. Both are administrator-only.

## Reports

Reports cover the data collected by every module, with search, applicable date/employee/client/status/source filters, summaries, and permitted detail records.

| Area | Coverage |
| --- | --- |
| Overview/reservations | Booking counts, windows, statuses, manual/AI source, cancellations, no-shows, changes |
| Employees | Assigned/completed work, adult/child haircut counts, reserved hours, availability, linked invoices/payments |
| Haircuts | Booked versus completed adult/child quantities by date and employee |
| Booking tracking | Administrator-only: each booking's timeline (creation, WhatsApp sends, edits/corrections, visit status changes, payments) with actor, role, time and reason, by barber, client and visit period (default: the current Kuwait week; a lone bound covers 7 days; at most 31 days) |
| Clients | Contact details, booking history, repeat visits, haircut counts, invoiced totals, payments |
| Invoices/payments | Line items, amounts, unpaid/paid/cancelled state, actual cash received, revisions and corrections |
| Salon work | Daily per-branch entries: children, cash/link/KNET, totals and history; comprehensive collections beside barbers |

- Administrator reports across the business. Employees report only on their own permitted records.
- Completed haircut counts come from completed reservations, not payment status.
- Invoice value, cancelled invoice amounts, and collected money are separate measures; collected money is split by payment method (cash, link, KNET) with totals.
- Work is attributed to the barber assigned on the reservation. Do not count invoice revisions twice.
- Label each report's date basis. Reserved hours include travel; they are not measured cutting time.
- Reports cover these modules, not an unlimited custom-report builder or data the application does not collect.
- Confirmed on 2026-10-08 for reservation and haircut reports: the date basis is selectable as the Kuwait visit date (default) or the Kuwait date the reservation was made. Haircut reports show every reserved haircut and separately the completed, still open (booked/arrived), cancelled, and no-show quantities. Reservation changes count administrator edits and administrator status corrections, shown separately.
- Confirmed on 2026-10-08 for barber reports (the booking-based branch report was removed on 2026-10-13: barbers and bookings have no branch; branches remain only for daily salon entries): availability is the barber's scheduled working time (weekly hours and dated exceptions) across the selected visit dates; reserved hours count only booked, arrived, and completed windows; invoice and cash measures follow the report's selected date basis.

## Infrastructure

```text
apps/web          Next.js Arabic dashboard
apps/api          Express business API and future WhatsApp webhook
packages/contracts  Shared Zod contracts and types
packages/db         Drizzle/MySQL connection, schema, migrations
packages/config     Shared TypeScript and lint configuration
docs/project-contract.md
```

- Keep domain rules in backend services shared by dashboard and AI.
- Keep MySQL/server-only dependencies out of browser code. Store money exactly, not with binary floating-point totals.
- Pin compatible dependencies, keep the pnpm lockfile, and provide build, lint, typecheck, and test commands.
- Provide individual and combined lint/typecheck/test commands and a tests folder for every workspace. Use separate web/API Dockerfiles, Compose, a Docker ignore file, and one root environment file for the existing MySQL instance on port 3306.
- Use separate databases: `just4kids` for development and `just4kids_test` for tests. Test commands load root `.env.test` and must not connect to the development database.
- Secrets stay outside Git. Deployment must eventually include HTTPS, managed processes, database migrations, and restore-tested backups.
- Backend authentication, branches/employees, schedules, clients/addresses, reservations/invoices, visit actions/history, reservation edits/revisions, full cash receipts/corrections, and paid-edit reconciliation have implemented slices. Backend reservation, haircut, barber, branch, client, and invoice/cash reports (phases 9–11) are implemented. The Arabic web dashboard for phases 1–11 is implemented, including those reports and barber photos; its end-to-end journey verification, WhatsApp integration, and production acceptance remain pending.

## Proposed defaults and pending decisions

The following are implementation proposals or unresolved policies, not additional confirmed scope:

- Client rescheduling policy remains to be confirmed; the proposed default is future booked reservations with no extra lead-time cutoff. Client cancellation, normal visit transitions/timing, and administrator-only corrections are confirmed above.
- Same-branch/different-branch pricing, cash-recording timing, mistaken-entry undo, and exact extra-cash/refund reconciliation during paid edits are confirmed above.
- WhatsApp provider/onboarding, AI model/provider, conversation retention, automatic barber-selection tie-breaks, and production deployment/backup tooling remain to be selected. Initial invoice fields and no-tax behavior are confirmed above.

## Scope boundaries and completion

No native mobile app, multiple barbers per reservation, child-profile module, extra service types, second administrator, payroll, inventory, commissions, expenses, accounting ledger, route optimization, GPS tracking, service-area enforcement, proactive messages, online payments, or extra exports are included.

Acceptance requires role/ownership enforcement, conflict-safe booking, 20-minute-to-4-hour windows regardless of counts, historical invoices/prices, single-payment integrity, Arabic responsive/print views, reports across all listed modules, and truthful/idempotent AI actions. Production readiness additionally requires the selected integrations, deployment configuration, and verified backup restoration.
