import "server-only";

import { db } from "@/lib/db";
import { activityLogs } from "@/lib/schema";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export type EntityType =
  | "product"
  | "product_adjustment"
  | "revenue_reconciliation"
  | "cost_reconciliation"
  | "project"
  | "partner";

export type ActionType = "create" | "update" | "delete";

type Changes = Record<string, { from: unknown; to: unknown }>;

/**
 * Diff 2 objects, chỉ trả các field có giá trị khác nhau.
 * NULL/undefined/"" xem như equivalent (tránh log noise).
 */
export function diff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Changes {
  const out: Changes = {};
  const b = before ?? {};
  const a = after ?? {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const k of keys) {
    const bv = b[k];
    const av = a[k];
    // Coerce nullish → empty for comparison; đồng thời so sánh number với tolerance nhỏ
    const bn = bv == null || bv === "" ? null : bv;
    const an = av == null || av === "" ? null : av;
    if (bn === an) continue;
    if (typeof bn === "number" && typeof an === "number") {
      if (Math.abs(bn - an) < 1e-9) continue;
    }
    // JSON stringify để so object/array
    if (JSON.stringify(bn) === JSON.stringify(an)) continue;
    out[k] = { from: bn, to: an };
  }
  return out;
}

async function getActor(): Promise<{ email: string | null; ip: string | null }> {
  let email: string | null = null;
  let ip: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? null;
  } catch {
    // No session — anonymous
  }
  try {
    const h = await headers();
    ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null;
  } catch {
    // Not in request context
  }
  return { email, ip };
}

/**
 * Log 1 activity. An toàn để await trong server action — không throw ra ngoài
 * (tránh lỡ log fail thì block business action).
 */
export async function logActivity(input: {
  entityType: EntityType;
  entityId: number;
  action: ActionType;
  productId?: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  summary?: string;
}): Promise<void> {
  try {
    const changes = diff(input.before, input.after);
    // Update mà không có thay đổi thật → skip (tránh spam log khi user save không sửa gì)
    if (input.action === "update" && Object.keys(changes).length === 0) return;
    const actor = await getActor();
    await db.insert(activityLogs).values({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      productId: input.productId ?? null,
      actorEmail: actor.email,
      actorIp: actor.ip,
      changes,
      summary: input.summary ?? null,
    });
  } catch (e) {
    console.error("[audit] logActivity failed:", e);
  }
}
