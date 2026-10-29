# Legacy PHP site import

One-off import of the old PHP/phpMyAdmin site's data (`u614391038_just4kidsdb.sql`, MariaDB) into the new schema. Code: `packages/db/src/legacy-import/` (tests in `packages/db/tests/legacy-*.test.ts`).

## Owner decisions (2026-10-29)

| Old data | New system |
|---|---|
| Barbers | Matched to live employees by phone; old `leenny` (id 4) is live Lenny (`+96560923073`). Unknown barbers (Fabi, angel) are created **disabled** with the password `<old name in lower case>1234` (`fabi1234`, `angel1234`); the administrator enables them when ready. Matched barbers keep their current passwords. Their old weekly hours are copied; live employees keep their current hours. |
| Manager accounts (superadmin, admin, care center, general manager, Hair salon) | Not imported; their history actions are credited to the live administrator. |
| Areas | Matched to live areas by name (any letter case, extra spaces ignored). Owner-approved old spellings use the live name (`areaAliases` in `cli.ts`, e.g. Fahaheel → Fahahel). Missing areas (Abdullah Mubarak, Ali sabah Alsalem, Tayma/Al-Jahra) are added only when an imported address uses them. |
| Customers | One client per phone (8 digits → `+965…`); a live client with the same phone is reused. Missing/broken phones are skipped. A customer with no complete address and no bookings is skipped. |
| Addresses | Need area, block, street and building (house number); empty optional parts become empty. Duplicates per client are merged. |
| Bookings | 30-minute window (the new booking screen's default; the old site stored none). 0 children → 1 child. Bookings whose address lacks block/street/building are skipped. Same-time double bookings are kept. |
| Statuses | `completed`/`cancelled` kept. Past `confirmed` and blank (the old site's failed "in progress" write) → completed, recorded as done by the system; today/future → booked. |
| History | Created by the administrator; completions and cancellations by whoever the old log names (barber or administrator); "sent to barber" WhatsApp logs → booking messages. Old edit logs have no before/after values and are not imported. |
| Barber collections | Online → Link, Delivery → Cash, KNET 0; totals unchanged. |
| Salon days | Branch "Fahahel salon"; cash, link and KNET kept. |
| Not imported | GPS points, notifications, ads, cars, payments (empty), contact messages. |

Built on `main`, where bookings still have the `source` column: imported bookings are `manual`. `feat/whatsapp-intake` drops that column, so remove `source: "manual"` from `importer.ts` when merging it.

Old timestamps are UTC (MariaDB `current_timestamp()`); old visit dates/times are Kuwait local time. Every imported row gets an id derived from its old id, so re-running adds nothing. Days that already have a collection/salon entry in the new system are left alone.

## Running on production

The import runs inside one transaction. Without `--apply` it is a dry run that prints the report and saves nothing. From the project folder on the VPS:

1. Back up: `docker compose --env-file .env.production exec -T db sh -c 'exec mysqldump --single-transaction -u root -p"$MYSQL_ROOT_PASSWORD" just4kids' > backup-before-legacy.sql`
2. Upload the old dump to the project folder on the VPS, then load it into a separate database (MariaDB's collation is renamed for MySQL 8):
   `sed 's/utf8mb4_uca1400_ai_ci/utf8mb4_unicode_ci/g' u614391038_just4kidsdb.sql | docker compose --env-file .env.production exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "CREATE DATABASE just4kids_legacy CHARACTER SET utf8mb4; GRANT SELECT ON just4kids_legacy.* TO just4kids;" && mysql -uroot -p"$MYSQL_ROOT_PASSWORD" just4kids_legacy'`
3. Rebuild the migrate image: `docker compose --env-file .env.production build migrate`
4. Dry run: `docker compose --env-file .env.production run --rm migrate sh -c 'LEGACY_DATABASE_URL="${DATABASE_URL%/*}/just4kids_legacy" node packages/db/dist/legacy-import/cli.js'`
5. Apply: the same command with `--apply` after `cli.js`.
6. Clean up: `docker compose --env-file .env.production exec db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE just4kids_legacy"'`, then delete the old dump from the VPS and the project folder. Keep the backup until the imported data is confirmed.
