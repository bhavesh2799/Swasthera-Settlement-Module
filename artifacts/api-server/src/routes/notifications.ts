import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";

const router = Router();

router.get("/notifications", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "30")), 100);
    const rows = await db
      .select()
      .from(notificationsTable)
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit);
    const unreadCount = rows.filter((r) => !r.isRead).length;
    res.json({
      unreadCount,
      notifications: rows.map((r) => ({
        id: r.id,
        actorName: r.actorName,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        recordName: r.recordName,
        link: r.link,
        level: r.level,
        isRead: r.isRead,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "notifications list error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/notifications/mark-read", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
      : null;
    if (ids && ids.length > 0) {
      await db.update(notificationsTable).set({ isRead: true }).where(inArray(notificationsTable.id, ids));
    } else {
      await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.isRead, false));
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "notifications mark-read error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
