import { Router } from "express";
import { db } from "@workspace/db";
import { activityTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

router.get("/activity", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 100);
    const rows = await db
      .select()
      .from(activityTable)
      .orderBy(desc(activityTable.timestamp))
      .limit(limit);

    res.json(
      rows.map((r) => ({
        id: r.id,
        timestamp: r.timestamp.toISOString(),
        user: r.user,
        action: r.action,
        entityType: r.entityType,
        entityRef: r.entityRef,
        level: r.level,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "activity error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
