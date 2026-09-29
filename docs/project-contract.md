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
- Employee self-editing is limited to display name. Only the administrator changes employee phone, branch assignment, active status, and password; employees do not change their own password.
- Assigned employees can cancel, mark arrived, mark completed, mark no-show, and record cash payment.
- Employees cannot reschedule or reassign bookings.
- Only the administrator can correct or undo payment records.
- Backend authorization must enforce ownership even when a record is requested directly.
- Confirmed authentication policy: seven-day server-side MySQL sessions via HttpOnly cookies, with `Secure` in production and CSRF protection on browser changes. The sole administrator's phone/password come from the private server environment and are applied on API restart; changing either revokes existing administrator sessions. Phone numbers use international format. Only the administrator changes employee phones and resets employee passwords; employees edit their display name only.

## Branches and employees

- A branch is the business location an employee works for.
- Each branch owns its employees, adult/child prices, haircut durations, and settings.
- For the first branch-management slice, branch details are name and location/address, with adult/child prices and descriptive haircut durations. No additional branch settings are required in this slice.
- Administrator controls employee working days, working hours, and available times.
- Clients choose a barber, not a branch. Display each barber's branch to help clients estimate travel.
- Administrator can create manual bookings and hand a booking to another available barber.
- Availability is enforced for AI actions, manual bookings, rescheduling, and reassignment.
- Working hours repeat weekly and may contain separate shifts on a day. An administrator can replace one day's hours or close it using a dated exception. Shifts and booking windows stay within one Kuwait calendar day.
- Schedule dates and local `HH:mm` times use `Asia/Kuwait`; weekday numbers are Sunday `0` through Saturday `6`. Windows that only touch at an endpoint do not overlap.
- Booked, arrived, and completed visits block the full original reserved window. Cancelled and no-show visits release it. A schedule edit that would exclude an existing blocking booking must be refused until that booking is moved or cancelled.

## Clients and addresses

- Store the main client's name, phone number, and usable service address.
- Address fields: street, house number, block, floor, apartment, building, and additional instructions where applicable. Floor/apartment need not apply to every property.
- Accept a WhatsApp location or Google Maps link alongside visit details.
- Reservations record adult/child counts. Separate child names, ages, and saved child profiles are not required.
- Preserve the reservation's address and historical branch/pricing details when current client/employee information changes.

## Reservation rules

- One reservation = one client, one barber, one address, one shared window, one invoice, and one cash payment when paid.
- The same barber serves every adult/child in the reservation. No multiple-barber assignment.
- Adult and child counts are non-negative integers; at least one haircut is required.
- Client chooses the date and variable start/end window through AI. Administrator can choose/change it manually.
- Minimum window: **20 minutes**. Maximum window: **4 hours**. Both bounds are inclusive.
- The whole window includes outbound travel, all haircuts, and return travel and blocks the assigned barber.
- Window bounds apply regardless of haircut counts or configured haircut durations. Three 20-minute haircuts may still be booked in an available 20-minute window under this rule.
- Do not calculate maps-based travel time or add a travel buffer outside the selected window.
- Bookings must fit the employee's working availability and cannot overlap another blocking booking.
- Recheck availability at commit time and protect against simultaneous bookings of the same employee.
- Failed rescheduling preserves the original booking/window.
- Keep cancelled/no-show records for history. Arrival means the barber reached the client's address.
- Visit states: booked, arrived, completed, cancelled, no-show. Payment and invoice states are separate.

## WhatsApp journey

1. Client requests haircuts; AI collects adult/child counts.
2. Collect/reuse the primary contact's name, phone identity, address, date, and requested window.
3. Show eligible barbers and their branches. Client chooses a named barber or delegates selection to AI.
4. Present the selected visit details and applicable price in the conversation.
5. Validate and save the reservation and invoice together. No administrator approval is required.
6. Reply in Arabic with the result and booking reference.

- AI also reads the client's bookings, reschedules, cancels, and handles related booking conversation.
- Identify the correct reservation before changing it. Sender identity determines client access.
- AI tools use the same backend validation as the dashboard; no direct database/admin access.
- Duplicate webhooks and retries must not create duplicate operations.
- AI may offer alternatives when a barber/window is unavailable and must not report success before the backend succeeds.
- No separate automated confirmations, reminders, notifications, or campaigns. Conversational replies remain required.

## Prices, invoices, and cash

- Adult/child prices and descriptive durations are editable per branch by administrator.
- Initial KWD prices are exact to three decimal places (1 dinar = 1,000 fils), following the [Central Bank of Kuwait's currency description](https://www.cbk.gov.kw/en/banknotes-and-coins/banknotes/introduction).
- New booking total: `adult count × adult price + child count × child price`, using the assigned barber's branch.
- Generate one combined invoice when booked, including manual bookings.
- Snapshot agreed prices. Later branch price changes do not automatically change existing invoices.
- Changing barber/branch or counts updates the existing invoice to match; retain revision history.
- Changing only the time/address preserves agreed prices.
- Marking paid or completed does not create another invoice or independently change its amount.
- Cancelled invoices remain visible as cancelled; retain any payment history.
- Client pays cash at the home visit; assigned employee records one full payment.
- No partial/split payments, deposits, payment links, or online payments.
- Administrator corrections retain actor, time, reason, and previous values. No duplicate active payment.
- A paid-invoice amount change must be explicitly reconciled; cancellation does not automatically refund cash.
- Print invoices and reports using the browser's normal print/Save as PDF function. No custom PDF generator or CSV/Excel exports.

## Reports

Reports cover the data collected by every module, with search, applicable date/branch/employee/client/status/source filters, summaries, and permitted detail records.

| Area | Coverage |
| --- | --- |
| Overview/reservations | Booking counts, windows, statuses, manual/AI source, cancellations, no-shows, changes |
| Employees | Assigned/completed work, adult/child haircut counts, reserved hours, availability, linked invoices/payments |
| Branches | Booking and haircut output, employee breakdown, invoices and related cash receipts |
| Haircuts | Booked versus completed adult/child quantities by date, branch, and employee |
| Clients | Contact details, booking history, repeat visits, haircut counts, invoiced totals, payments |
| Invoices/payments | Line items, amounts, unpaid/paid/cancelled state, actual cash received, revisions and corrections |

- Administrator reports across the business. Employees report only on their own permitted records.
- Completed haircut counts come from completed reservations, not payment status.
- Invoice value, cancelled invoice amounts, and cash collected are separate measures.
- Historical employee/branch attribution must survive branch transfers. Do not count invoice revisions twice.
- Label each report's date basis. Reserved hours include travel; they are not measured cutting time.
- Reports cover these modules, not an unlimited custom-report builder or data the application does not collect.

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
- Infrastructure scaffolding does not implement booking, authentication, WhatsApp, or reporting features yet.

## Proposed defaults and pending decisions

The following are implementation proposals or unresolved policies, not additional confirmed scope:

- Client self-service changes apply to future booked reservations, with no extra lead-time cutoff. Terminal-state corrections are administrator-only. Exact state-transition policy is pending.
- Use existing booked unit prices for same-branch count edits; branch-changing reassignment uses new branch prices. Exact repricing/reconciliation rules after payment and cash refunds need confirmation before implementation.
- WhatsApp provider/onboarding, AI model/provider, conversation retention, automatic barber-selection tie-breaks, production deployment/backup tooling, and any required tax/invoice fields remain to be selected.

## Scope boundaries and completion

No native mobile app, multiple barbers per reservation, child-profile module, extra service types, second administrator, payroll, inventory, commissions, expenses, accounting ledger, route optimization, GPS tracking, service-area enforcement, proactive messages, online payments, or extra exports are included.

Acceptance requires role/ownership enforcement, conflict-safe booking, 20-minute-to-4-hour windows regardless of counts, historical invoices/prices, single-payment integrity, Arabic responsive/print views, reports across all listed modules, and truthful/idempotent AI actions. Production readiness additionally requires the selected integrations, deployment configuration, and verified backup restoration.
