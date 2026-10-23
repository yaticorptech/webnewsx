import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { groupMember, user } from "../db/schema.js";
import type { GroupRole } from "../shared/contracts.js";
import type { GroupActorRef, Viewer } from "../types.js";
import { toReporterLevel, toRole } from "./roles.js";

/*
 * "Posting as" a group account (owner 2026-10-23). The switch is a cookie naming the group; every request re-checks
 * that the signed-in person is still an active member, then serves them AS the group (its stories, profile, Newsroom),
 * with `viewer.actor` saying who is really there. Leaving the group (or being removed) ends it on the next request.
 * What each role may do while switched is in middleware/acting-guard.ts.
 */

export const ACT_AS_COOKIE = "wn_act_as";

/** The group `memberId` may post as right now (an active member of a live group account), as a viewer — else null. */
export async function actAsGroup(member: Viewer, groupId: string): Promise<Viewer | null> {
  if (!groupId || groupId === member.id || member.actor) return null;
  const [row] = await db
    .select({ group: user, role: groupMember.role })
    .from(groupMember)
    .innerJoin(user, eq(user.id, groupMember.groupId))
    .where(
      and(
        eq(groupMember.groupId, groupId),
        eq(groupMember.userId, member.id),
        eq(groupMember.status, "active"),
        eq(user.accountType, "group"),
        isNull(user.suspendedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const g = row.group;
  const actor: GroupActorRef = { id: member.id, name: member.name, username: member.username, image: member.image, role: row.role as GroupRole };
  return {
    id: g.id,
    email: g.email,
    name: g.name,
    image: g.image,
    username: g.username,
    bio: g.bio,
    onboardedAt: g.onboardedAt,
    onboarded: Boolean(g.onboardedAt),
    role: toRole(g.role),
    reporterLevel: toReporterLevel(g.reporterLevel),
    actor,
  };
}
