# Just4Kids project contract

Current UI and client model (2026-10-16): the dashboard, validation/errors, dates, reports and barber WhatsApp handoff use English with a left-to-right layout. Saved user-entered text is preserved in its original language. Clients have a phone number and addresses; client names, address instructions and latitude/longitude are removed from forms, API contracts, database columns and saved reservation/revision JSON by migrations `0024_remove_client_details` and `0025_remove_client_receipt_details`. Confirmed 2026-10-16 (feature batch P8): a reservation carries **no price, invoice or payment**; the new-reservation screen shows only the reservation summary and the two save buttons, and saving creates the reservation and initial history atomically. Money remains only where it is not tied to a reservation: barber daily collections, salon entries, and the collection-based totals in the barber and comprehensive reports. The reservation action offers two buttons: **Save reservation** (save and return to today's reservations) and **Save & send via WhatsApp** (save, record the WhatsApp handoff, open WhatsApp for the barber, then return to today's reservations). This supersedes older UI/name/location/invoice descriptions below. Confirmed 2026-10-21: the Arabic client-facing WhatsApp AI only collects booking requests and hands them to staff; it does not book (see **WhatsApp journey**).


Agreed scope, captured 2026-09-29. This is the single product contract. Read the repository's [AGENTS.md](../AGENTS.md) before working on the project.

## Purpose and platform

- Home-visit haircut CRM/operations system, mainly for Kuwait. Barbers travel to clients.
- Adults and children are supported. Haircut is the only service.
- English-only, left-to-right web application, responsive on computers, tablets, and phones.
- English and Arabic WhatsApp AI, built as part of the project, using one number for the entire business. It collects booking requests and sends them to staff; a staff approval creates the reservation.
- TypeScript, Next.js, Express, pnpm, Turborepo, Tailwind CSS, Zod, MySQL, Drizzle, and Vitest.
- Hosting target: the owner's Hostinger KVM1 VPS, deployed with Docker. Initial currency: KWD.

## Accounts and permissions

- Exactly one administrator. The other role is employee/barber; no manager or receptionist role.
- One shared login page using phone number and password.
- Administrator creates employee credentials. No public registration or client dashboard login.
- Administrator manages all branches, employees, schedules, clients, bookings, collections, salon entries, and reports.
- Employees manage their own permitted profile details and see only their own records.
- Employee self-editing is limited to display name. Only the administrator changes employee phone, active status, account expiry, and password; employees do not change their own password.
- Confirmed barber account expiry (2026-10-12): the administrator may set an optional end date on an employee account. The account stays valid through that day; afterwards a login is refused with a clear English message and existing sessions stop working. Clearing the date restores access. This restores the old app's account expiry.
- Assigned employees can cancel, mark arrived, mark completed, and mark no-show. Employees cannot reschedule or reassign bookings.
- Only the administrator records, corrects, or undoes barber collections and salon entries.
- Backend authorization must enforce ownership even when a record is requested directly.
- Confirmed authentication policy: seven-day server-side MySQL sessions via HttpOnly cookies, with `Secure` in production and CSRF protection on browser changes. The sole administrator's phone/password come from the private server environment and are applied on API restart; changing either revokes existing administrator sessions. Phone numbers use international format. Only the administrator changes employee phones and resets employee passwords; employees edit their display name only.

## Branches and employees

- A branch is a business location used to group money and reports. Confirmed 2026-10-12 (S10) and 2026-10-13 (migration 0021): barbers and bookings have no branch; branches remain only for daily salon entries.
- Confirmed 2026-10-16 (feature batch P5): a branch has only a name and an address. The per-branch adult/child prices and descriptive haircut durations are removed from the database, contracts, API and screens; salon entries, collections and reports group money by branch name only.
- Branch details are a name and an address. No additional branch settings are required.
- Administrator controls employee working days, working hours, and available times.
- Clients choose a barber, not a branch.
- Administrator can create manual bookings and hand a booking to another available barber.
- Availability is enforced for manual bookings, rescheduling, reassignment, and staff approval of a WhatsApp request. The WhatsApp AI itself does not check availability or book.
- Working hours repeat weekly and may contain separate shifts on a day. An administrator can replace one day's hours or close it using a dated exception. Shifts and booking windows stay within one Kuwait calendar day.
- Confirmed 2026-10-16: each weekday has an administrator-controlled active/inactive switch per barber, separate from its shifts. An inactive day keeps its stored shifts but accepts no bookings or locks; a dated exception still opens that specific date with its shifts. An active day with no shifts is still closed. Turning a day off is refused (same conflict as a changed shift) while the barber has a future booking on that weekday. Only the administrator changes the switch; barbers see it read-only.
- Confirmed 2026-10-13 (S3), flexible length 2026-10-16: the administrator can lock/unlock a future window directly from the booking pills, in half-hour steps (a start pill and an end pill), with an optional reason. A lock must fit working hours and cannot overlap a blocking booking or another lock. It holds no client or price, but blocks the whole overlapping window for booking creation, edits/reassignment, and visit restoration. Unlocking removes only the manual lock; weekly hours and dated exceptions still apply. Barbers cannot create or remove locks.
- Schedule dates and local `HH:mm` times use `Asia/Kuwait`; weekday numbers are Sunday `0` through Saturday `6`. Windows that only touch at an endpoint do not overlap.
- Booked, arrived, and completed visits block the full original reserved window. Cancelled and no-show visits release it. Confirmed on 2026-10-02: a schedule edit that would exclude an existing blocking booking whose reserved end has not been reached in Kuwait must be refused until that booking is moved, cancelled, or ends. At or after the reserved end, past bookings no longer prevent schedule edits; their visit and history records remain unchanged.

## Clients and addresses

- Store the client's phone number and usable service address. Client names are removed throughout the application and database.
- Confirmed 2026-10-13 (S9, owner-directed parity with `other/temp_bookings.php`): the administrator's booking client step starts with a phone lookup. An existing client and last-used saved address are selected automatically (newest saved address if never booked), with stopped clients refused. An unknown phone shows inline required address fields. Save the new client, address, reservation and initial history together or roll back everything. A concurrent registration of the phone is refused and the dashboard refreshes the lookup; it does not overwrite the existing client's phone/address. Standalone client creation also uses only the phone number.
- One client record owns each international-format phone number; that exact phone is the primary-contact identity. WhatsApp conversations are keyed by the sender's phone but are not linked to client records.
- Confirmed 2026-10-11: each client has an active/stopped state. The administrator can stop or reactivate a client with a required reason, recorded in the client's status history. A stopped client cannot receive new bookings (the booking attempt is refused with a clear English message); existing bookings and historical records are unaffected. Client lists and lookups show the state.
- Address fields: street, house number, block, floor, apartment, building, avenue, gate and blue number where applicable. Floor/apartment need not apply to every property.
- A saved service address requires area/neighborhood, block, street, and at least one of house number or building name. Clients may have multiple saved addresses. Floor, apartment, avenue, gate, blue number and Google Maps link are optional. Address instructions and latitude/longitude are removed.
- Confirmed 2026-10-13 (S6): the administrator manages a searchable list of area names (add, rename, stop/reactivate). New dashboard addresses choose an active area; the API rechecks its ID and name inside the address transaction. Existing free-text addresses can retain their area when edited, and catalogue changes never rewrite saved addresses or reservation snapshots. Legacy API callers may still send free-text `area` without `areaId`; this is an address picker, not geographic service-area enforcement. The catalogue starts empty and is populated by the administrator.
- Accept a Google Maps link alongside visit details.
- Reservations record adult/child counts. Separate child names, ages, and saved child profiles are not required.
- Confirmed 2026-10-11: a reservation also records a special-needs child count, an integer `0 ≤ special ≤ childCount`. These are a subset of the children. The count appears on the booking form, edit dialog, booking detail, and reports (shown beside the child counts).
- Preserve the reservation's address and historical barber/pricing details when current client/employee information changes.

## Reservation rules

- One reservation = one client, one barber, one address, and one shared window.
- The same barber serves every adult/child in the reservation. No multiple-barber assignment.
- Adult and child counts are non-negative integers; at least one haircut is required.
- The client requests a date and time window through WhatsApp; approving keeps that window, and the administrator can set another in the dashboard.
- Confirmed 2026-10-13 (S8): the administrator's new-booking screen preselects a 30-minute visit. The administrator can change the length per booking; selecting a free time pill uses the chosen length and blocks the full reserved window.
- Confirmed on 2026-10-02: new reservations must start strictly in the future in Kuwait, with no additional lead-time cutoff. This does not decide later WhatsApp rescheduling/cancellation policy.
- Minimum window: **20 minutes**. Maximum window: **4 hours**. Both bounds are inclusive.
- The whole window includes outbound travel, all haircuts, and return travel and blocks the assigned barber.
- Window bounds apply regardless of haircut counts or configured haircut durations. Three 20-minute haircuts may still be booked in an available 20-minute window under this rule.
- Do not calculate maps-based travel time or add a travel buffer outside the selected window.
- Bookings must fit the employee's working availability and cannot overlap another blocking booking.
- Recheck availability at commit time and protect against simultaneous bookings of the same employee.
- Failed rescheduling preserves the original booking/window.
- Confirmed reservation edits (2026-10-02; amended 2026-10-12, S10): administrator-only edits may change address, adult/child counts, window, and assigned barber while the visit is booked and its original start is strictly in the future in Kuwait; a changed window must then also start strictly in the future, without an extra cutoff. A started or finished visit may be edited only as a correction (see S15 below). Edits retain the reservation/reference, actor/time/reason when supplied, and complete previous/new values. Client rescheduling policy remains pending.
- Keep cancelled/no-show records for history. Arrival means the barber reached the client's address.
- Visit states: booked, arrived, completed, cancelled, no-show.
- Confirmed visit workflow (2026-10-02): booked → arrived/cancelled/no-show; arrived → completed/cancelled/no-show. Normal arrival/completion actions are allowed at or after the reserved start; no-show is allowed at or after the reserved end. Cancellation is allowed from booked or arrived, without an additional timing cutoff. Completed/cancelled/no-show states are final for employees.
- Administrator corrections may change any visit state with a required reason and retained actor/time history. Restoring a blocking state rechecks enabled status, working hours/exceptions, and overlapping bookings. Correcting a state does not record a collection.
- Visit mutations must reject stale concurrent changes and atomically retain the previous/new visit statuses with actor, time, and any reason. The original reserved window remains intact when completed.

## WhatsApp journey

Confirmed 2026-10-21. This replaces the earlier plan in which the AI booked, rescheduled and cancelled visits without administrator approval.

```text
Client WhatsApp ─► OpenWA ─webhook─► API ─► numbered menus (code) + free text (AI)
                                      │
                       client confirms the summary
                                      ▼
                  staff number: full request ─► "yes 12" / "no 12 reason"
                                      ▼
              system creates the reservation ─► client is told
```

Decided 2026-10-30 (replaces the intake-only decision of 2026-10-21): the AI talks with clients and answers their questions, a complete request goes to staff for approval, and approval creates the reservation.

1. A client messages the business number and chooses English or Arabic. The code sends every menu word for word; the AI only reads what a client types outside the menus.
2. Main menu: book, cancel or change a request, talk to staff. Booking collects: who it is for and the counts, the barber (from the dashboard, or any barber), the date, the client's own start and end time, the area (from the dashboard), and a location, Google Maps link, or block, street and house or building. The client's phone comes from the sender identity.
3. The client confirms a summary, and the full request goes to the staff WhatsApp number (`STAFF_WHATSAPP_NUMBER`).
4. Staff answer from that number: `yes 12`, `yes 12 <barber>` (required when the client chose any barber, or to change the barber), or `no 12 <reason>`. Staff may instead create the reservation manually in the dashboard.
5. Approval creates a normal reservation through the same rules as the dashboard (availability, future start, enabled barber and client), then tells the client. If the rules refuse it, nothing is saved, staff are told why, and the request stays open.

Other rules:

| Situation | What happens |
| --- | --- |
| A client asks to change or cancel | The AI's menu sends their message to staff as written; staff make the change in the dashboard |
| A question the service text does not answer (prices, status, arrival time, complaints) | The AI says staff will be told and forwards a summary |
| Staff reply from the phone holding the business number | The AI stops for that client until staff send `ai on +<number>` from the staff number |

- A location-only address is saved with the area and the link; the other required address parts show "—" for staff to complete in the dashboard.
- The client reply about a handoff is sent only after the staff message was accepted by OpenWA, so the client is never told staff know when they do not.
- Staff messages are in English; the address and other client text are copied as written.
- The AI cannot create or change anything: the code validates everything it reads, and only a staff `yes` creates a reservation. It must not promise a booking, time or barber.
- Text messages and shared locations are read; other message types (voice notes, images, stickers, files) get no reply.
- When the AI cannot answer (decided 2026-10-30), staff get one alert with the client's number and messages so they can contact the client; the client gets no automatic reply.
- Duplicate or retried webhooks must not produce duplicate replies or duplicate staff messages.
- Conversation messages are kept indefinitely.
- No other automated reminders, notifications, or campaigns. Staff requests, forwards and alerts and the client's approval or rejection message are the only automatic messages besides the conversational replies.

### Integrations

- WhatsApp gateway: [OpenWA](https://github.com/rmyndharis/OpenWA) v0.25.0 (self-hosted, pinned). It receives messages through a signed webhook for `message.received` and `message.sent` (the latter reports only messages typed on the linked phone, which start a staff takeover) (`X-OpenWA-Signature: sha256=<hex>`, HMAC-SHA256 over the raw body; deduplicate on `X-OpenWA-Idempotency-Key`, which stays the same across retries; delivery is at-least-once) and sends text with `POST /api/sessions/{sessionId}/messages/send-text` (`{ chatId, text }`, `X-API-Key`, optional `Idempotency-Key` held for 24 hours). A `201` means accepted, not delivered. Only individual-chat `text` and `location` messages that are not `fromMe` are answered; replies go to the message's `chatId`. Run OpenWA with `RESOLVE_LID_TO_PHONE=true` so senders hidden behind WhatsApp privacy IDs (`@lid`) carry a `senderPhone`. It runs as the opt-in compose service `openwa` (`ghcr.io/rmyndharis/openwa:0.25.0`); `OPENWA_SESSION_ID` is the session's UUID.
- OpenWA is unofficial and connects like WhatsApp Web, so WhatsApp may restrict or ban the connected number. The owner accepted this risk for the business number on 2026-10-21.
- AI (decided 2026-10-24): any provider with an OpenAI-compatible Chat Completions API (`POST {AI_BASE_URL}/chat/completions`, bearer `AI_API_KEY`, `AI_MODEL`, optional `AI_THINKING`). Chosen 2026-10-24: Xiaomi MiMo-V2.6-Flash. The provider and model can change by settings only.
- AI prompt (decided 2026-10-24): the owner writes the AI's behaviour in `apps/api/prompts/whatsapp-ai.md`, versioned in Git and shipped in the API image. The code appends only a fixed technical part: today's date, the client's current step and the answer shape.
- Settings, in the root `.env` (development) and `.env.production` (Docker), with matching examples: `OPENWA_BASE_URL`, `OPENWA_API_KEY`, `OPENWA_SESSION_ID`, `OPENWA_WEBHOOK_SECRET`, `STAFF_WHATSAPP_NUMBER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`; `AI_THINKING` is optional.

## Prices, collections, and cash

- Branches no longer carry adult/child prices or descriptive durations (removed 2026-10-16, feature batch P5).
- Initial KWD amounts are exact to three decimal places (1 dinar = 1,000 fils), following the [Central Bank of Kuwait's currency description](https://www.cbk.gov.kw/en/banknotes-and-coins/banknotes/introduction).
- Confirmed 2026-10-16 (feature batch P8): a reservation has **no price, invoice or payment**. There is no branch-derived or typed booking price, no per-reservation receipt to record or undo, and no reconciliation. The new-reservation screen shows only the reservation summary and the two save buttons.
- Confirmed barber collections (2026-10-12, S11): the administrator records one daily collection per barber — normal/special children and cash/link/KNET with a server-computed total — retained with history; a barber reads only their own. The barber and comprehensive reports read these daily rows. Daily collections follow only the period and barber filters: the barber report hides its collected money (with a note) under any other filter, and the comprehensive report is filtered by period only, as in the old app.
- Confirmed finished-visit corrections (2026-10-12, S15): a started or finished visit stays editable by the administrator, but only as a correction that must state a reason; a change is kept in the reservation revisions with the before/after values, may move the visit into the past, and still satisfies the barber's working hours and slot availability.
- Cancelled and no-show reservations are kept for history; they carry no money.
- Administrator corrections retain actor, time, reason, and previous values.
- Print reports using the browser's normal print/Save as PDF function. No custom PDF generator or CSV/Excel exports.

## Salon work (in-shop)

- The shop records a daily in-shop (salon) collection separate from barber bookings: children count and the amounts received by cash, payment link, and KNET machine, each exact to three-decimal KWD; the total is the sum of the three methods.
- One entry per branch per day. The administrator creates and edits entries; every change is retained with actor, time, and before/after values. Employees neither see nor change salon entries.
- Confirmed salon reporting (2026-10-11): the salon report lists the period's daily entries with per-method and overall totals; the comprehensive report rows barbers beside a single salon row with per-method totals and each row's share of the combined collected total. Both are administrator-only.

## Reports

Reports cover the data collected by every module, with search, applicable date/employee/client/status filters, summaries, and permitted detail records.

| Area | Coverage |
| --- | --- |
| Overview/reservations | Booking counts, windows, statuses, cancellations, no-shows, changes |
| Employees | Assigned/completed work, adult/child haircut counts, reserved hours, availability, collected money |
| Haircuts | Booked versus completed adult/child quantities by date and employee |
| Booking tracking | Administrator-only: each booking's timeline (creation, WhatsApp sends, edits/corrections, visit status changes) with actor, role, time and reason, by barber, client and visit period (default: the current Kuwait week; a lone bound covers 7 days; at most 31 days) |
| Clients | Contact details, booking history, repeat visits, haircut counts |
| Salon work | Daily per-branch entries: children, cash/link/KNET, totals and history; comprehensive collections beside barbers |

- Administrator reports across the business. Employees report only on their own permitted records.
- Completed haircut counts come from completed reservations, not payment status.
- Collected money is split by payment method (cash, link, KNET) with totals; it comes from barber collections and salon entries, not from reservations.
- Work is attributed to the barber assigned on the reservation.
- Label each report's date basis. Reserved hours include travel; they are not measured cutting time.
- Reports cover these modules, not an unlimited custom-report builder or data the application does not collect.
- Confirmed on 2026-10-08 for reservation and haircut reports: the date basis is selectable as the Kuwait visit date (default) or the Kuwait date the reservation was made. Haircut reports show every reserved haircut and separately the completed, still open (booked/arrived), cancelled, and no-show quantities. Reservation changes count administrator edits and administrator status corrections, shown separately.
- Confirmed on 2026-10-08 for barber reports (the booking-based branch report was removed on 2026-10-13: barbers and bookings have no branch; branches remain only for daily salon entries): availability is the barber's scheduled working time (weekly hours and dated exceptions) across the selected visit dates; reserved hours count only booked, arrived, and completed windows; collected money follows the report's selected date basis.

## Infrastructure

```text
apps/web          Next.js English dashboard
apps/api          Express business API and future WhatsApp webhook
packages/contracts  Shared Zod contracts and types
packages/db         Drizzle/MySQL connection, schema, migrations
packages/config     Shared TypeScript and lint configuration
docs/project-contract.md
```

- Keep domain rules in backend services. The WhatsApp AI gets no tools; only a staff approval calls the booking repository.
- Keep MySQL/server-only dependencies out of browser code. Store money exactly, not with binary floating-point totals.
- Pin compatible dependencies, keep the pnpm lockfile, and provide build, lint, typecheck, and test commands.
- Provide individual and combined lint/typecheck/test commands and a tests folder for every workspace. Use separate web/API Dockerfiles, Compose, a Docker ignore file, and one root environment file for the existing MySQL instance on port 3306.
- Use separate databases: `just4kids` for development and `just4kids_test` for tests. Test commands load root `.env.test` and must not connect to the development database.
- Secrets stay outside Git. Deployment must eventually include HTTPS, managed processes, database migrations, and restore-tested backups.
- Backend authentication, branches/employees, schedules, clients/addresses, reservations, visit actions/history, reservation edits/revisions, barber collections, and salon entries have implemented slices. Backend reservation, haircut, barber, branch, client, and collection reports (phases 9–11) are implemented. The English web dashboard for phases 1–11 is implemented, including those reports and barber photos; The WhatsApp intake (phase 12) is implemented and tested with fake AI/OpenWA services. Its real conversation check (once OpenWA is linked and the AI provider chosen), the dashboard's end-to-end journey verification, and production acceptance remain pending.

## Proposed defaults and pending decisions

The following are implementation proposals or unresolved policies, not additional confirmed scope:

- Client change and cancellation requests through WhatsApp go to staff (2026-10-30); staff make all changes in the dashboard. Normal visit transitions/timing and administrator-only corrections are confirmed above.
- Same-branch/different-branch pricing, cash-recording timing, mistaken-entry undo, and exact extra-cash/refund reconciliation during paid edits were removed with reservation money (feature batch P8) and no longer apply.
- Decided 2026-10-21: the WhatsApp gateway is OpenWA, conversations are kept indefinitely, and the AI hands requests to staff, so automatic barber selection and client rescheduling through WhatsApp no longer apply. Decided 2026-10-24: the AI uses the OpenAI-compatible Chat Completions format. Chosen 2026-10-24: Xiaomi MiMo-V2.6-Flash on Xiaomi's pay-as-you-go API (account, thinking-off setting and live tests done 2026-10-30). Decided 2026-10-30: staff are alerted when the AI cannot answer. Still to be chosen: the owner's final prompt, OpenWA onboarding (which number, the engine), and production deployment/backup tooling. The open decisions are tracked in [backend-phases.md](backend-phases.md#phase-12--arabic-whatsapp-booking-request-intake). No-tax behavior is confirmed above.
- Decided 2026-10-21, extended 2026-10-24: remove the unused AI-source creation path, the internal client-cancellation service, and the reservation `source` field entirely (contracts, database column, report filter and summary count, dashboard labels), since every reservation is now made by staff. This is part of phase 12.

## Scope boundaries and completion

No native mobile app, multiple barbers per reservation, child-profile module, extra service types, second administrator, payroll, inventory, commissions, expenses, accounting ledger, route optimization, GPS tracking, service-area enforcement, proactive messages, online payments, or extra exports are included.

Acceptance requires role/ownership enforcement, conflict-safe booking, 20-minute-to-4-hour windows regardless of counts, accurate collection totals, Arabic responsive/print views, reports across all listed modules, and truthful/idempotent WhatsApp AI replies and staff handoffs. Production readiness additionally requires the selected integrations, deployment configuration, and verified backup restoration.
