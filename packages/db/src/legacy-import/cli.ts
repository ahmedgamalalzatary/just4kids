import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../schema/index.js";
import { importLegacy } from "./importer.js";

// One-off import of the old PHP site's data. Runs as a dry run (everything rolled back) unless --apply is passed.
// Usage: DATABASE_URL=... LEGACY_DATABASE_URL=... node dist/legacy-import/cli.js [--apply]
const options = {
  salonBranchName: "Fahahel salon",
  // Old barber "leenny" (id 4) is the live employee Lenny, whose phone changed.
  barberPhoneOverrides: { 4: "+96560923073" },
  // Owner-approved (2026-10-29) old spellings of areas that already exist on the live site.
  areaAliases: {
    Fahaheel: "Fahahel", Fanitees: "Fainatees", Khaitan: "Kheitan", Mesaila: "Messila", Reqqa: "Riqqa", Shwikh: "Shuwaikh",
    Sulaibikhat: "Solibkhat", Sulaibiya: "Salibya", "Old Jahra": "Old Gahra",
    "Al-Adan Hospital... Motherhood and Childhood": "Al-Adan Hospital... Motherhood and Childhoo",
  },
};

class DryRun extends Error {}

const targetUrl = process.env.DATABASE_URL, legacyUrl = process.env.LEGACY_DATABASE_URL;
if (!targetUrl || !legacyUrl) throw new Error("Set DATABASE_URL (new system) and LEGACY_DATABASE_URL (old site copy)");
const apply = process.argv.includes("--apply");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(new Date());
// The API runs in UTC, so timestamps are written as UTC.
const target = mysql.createPool({ uri: targetUrl, timezone: "Z" });
const legacy = mysql.createPool({ uri: legacyUrl, dateStrings: true });
try {
  await drizzle(target, { schema, mode: "default" }).transaction(async transaction => {
    const report = await importLegacy(transaction, legacy, { ...options, today });
    console.log(JSON.stringify({ today, ...report }, null, 2));
    if (!apply) throw new DryRun();
  });
  console.log("Import saved.");
} catch (error) {
  if (!(error instanceof DryRun)) throw error;
  console.log("Dry run: nothing was saved. Re-run with --apply to save.");
} finally {
  await Promise.all([target.end(), legacy.end()]);
}
