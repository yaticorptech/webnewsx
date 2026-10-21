import type { Executor } from "../db/client.js";
import { adminAuditLog } from "../db/schema.js";
import type { AuditAction, AuditEntry } from "../shared/contracts.js";

export type AuditInput = {
  /** null = automatic (system) action. */
  actorId: string | null;
  action: AuditAction;
  targetType: AuditEntry["targetType"];
  targetId: string;
  targetLabel?: string | null;
  meta?: AuditEntry["meta"];
};

/** Writes one Editor Desk audit entry (call it inside the transaction that made the change). */
export async function writeAudit(executor: Executor, entry: AuditInput): Promise<void> {
  await executor.insert(adminAuditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel ?? null,
    meta: entry.meta ?? null,
  });
}
