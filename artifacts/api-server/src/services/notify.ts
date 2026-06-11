import { db, notificationsTable } from "@workspace/db";
import type { Request } from "express";
import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "../lib/logger.js";

const ALERT_EMAIL = "bhavesh.kotwani@affordplan.com";

let transporter: Transporter | null = null;
let transportChecked = false;

/**
 * Lazily builds an SMTP transport from environment variables. Returns null when
 * SMTP is not configured, so email simply no-ops (in-app notifications still
 * fire). Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (and optionally
 * SMTP_FROM, SMTP_SECURE=true) to enable real delivery.
 */
function getTransporter(): Transporter | null {
  if (transportChecked) return transporter;
  transportChecked = true;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    logger.warn("SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS) — email alerts disabled, in-app notifications still active");
    return null;
  }
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });
  return transporter;
}

function appBaseUrl(): string {
  const domains = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (domains) return `https://${domains}`;
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}`;
  return "";
}

export interface NotifyEntry {
  action: string;
  entityType: string;
  entityId?: string | number;
  recordName?: string;
  /** App-relative link, e.g. "/onboarding/12" */
  link?: string;
  level?: "info" | "success" | "warning";
}

/**
 * Records an in-app notification and best-effort sends an email alert. Never
 * throws — notification failures must not break the primary mutation.
 */
export async function notify(req: Request, entry: NotifyEntry): Promise<void> {
  const actorName = req.user?.name ?? "System";
  try {
    await db.insert(notificationsTable).values({
      actorName,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId != null ? String(entry.entityId) : null,
      recordName: entry.recordName ?? null,
      link: entry.link ?? null,
      level: entry.level ?? "info",
    });
  } catch (err) {
    req.log?.warn({ err }, "failed to write notification");
  }

  void sendEmail(req, entry, actorName);
}

async function sendEmail(req: Request, entry: NotifyEntry, actorName: string): Promise<void> {
  const tx = getTransporter();
  if (!tx) return;
  const recordLabel = entry.recordName ?? (entry.entityId != null ? `${entry.entityType} #${entry.entityId}` : entry.entityType);
  const subject = `[Swasthera] ${entry.action} by ${actorName} — ${recordLabel}`;
  const fullLink = entry.link ? `${appBaseUrl()}${entry.link}` : appBaseUrl();
  const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const body = [
    `User: ${actorName}`,
    `Action: ${entry.action}`,
    `Record: ${recordLabel} (${entry.entityType})`,
    `Timestamp: ${when} IST`,
    fullLink ? `Link: ${fullLink}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    await tx.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: ALERT_EMAIL,
      subject,
      text: body,
    });
  } catch (err) {
    req.log?.warn({ err }, "failed to send email alert");
  }
}
