import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const updated = await db.execute(sql`
    UPDATE bags b
    SET warehouse_id = w.id
    FROM warehouses w
    WHERE w.onboarding_id = b.brand_id
      AND w.is_primary = true
      AND b.warehouse_id IS NULL
  `);

  const remaining = await db.execute(sql`
    SELECT count(*)::int AS n FROM bags WHERE warehouse_id IS NULL
  `);

  const updatedCount = (updated as { rowCount?: number }).rowCount ?? "n/a";
  const remainingCount = (remaining.rows?.[0] as { n?: number } | undefined)?.n ?? "n/a";

  console.log(
    `[backfill] bags.warehouse_id set for ${updatedCount} row(s); ${remainingCount} bag(s) still unmapped (will use brand primary-account fallback at settlement time)`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] failed", err);
  process.exit(1);
});
