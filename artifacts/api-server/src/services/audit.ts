import { db, auditLogTable } from "@workspace/db";
import type { Request } from "express";

/**
 * Writes a structured entry to the audit_log table. Best-effort: failures are
 * swallowed (with a log) so auditing never breaks the primary mutation.
 */
export async function writeAudit(
  req: Request,
  entry: {
    entityType: string;
    entityId: string | number;
    action: string;
    changedFields?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db.insert(auditLogTable).values({
      entityType: entry.entityType,
      entityId: String(entry.entityId),
      action: entry.action,
      changedBy: req.user?.name ?? null,
      changedByRole: req.user?.role ?? null,
      changedFields: entry.changedFields ?? null,
    });
  } catch (err) {
    req.log?.warn({ err }, "failed to write audit log");
  }
}
