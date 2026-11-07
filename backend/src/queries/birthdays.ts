import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { publishEvent } from "../lib/events.js";

/** Wishes go out from this hour (IST) on the day — a morning greeting, not a midnight buzz. */
const WISH_FROM_HOUR_IST = 8;

/**
 * Birthday wishes (owner 2026-11-07: "those who have a DOB, send a birthday wishes push notification"). The date of
 * birth is on the Press Pass (kept for legal matters, private), so Press Pass holders are wished: from 08:00 IST on
 * their birthday, one "birthday_wish" notification each — in the bell and as a phone push (queries/push.ts). 29 Feb
 * birthdays are wished on 28 Feb in other years. Once a day per person (an existing wish today is skipped), safe with
 * several API instances (advisory lock). `note` carries the first name for the greeting.
 */
export async function sendBirthdayWishes(): Promise<void> {
  const rows = await db.transaction(async (tx) => {
    const [lock] = [...(await tx.execute<{ ok: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext('birthday-wishes')) as ok`))];
    if (!lock?.ok) return [];
    return [
      ...(await tx.execute<{ user_id: string }>(sql`
        with today as (
          select (now() at time zone 'Asia/Kolkata')::date as d,
                 extract(hour from now() at time zone 'Asia/Kolkata')::int as h,
                 date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' as starts
        ), due as (
          select distinct on (p.user_id) p.user_id,
                 split_part(coalesce(nullif(trim(u.name), ''), nullif(trim(p.legal_name), ''), u.username, ''), ' ', 1) as first_name
          from press_pass p
          join "user" u on u.id = p.user_id
          cross join today t
          where p.date_of_birth is not null
            and p.revoked_at is null
            and u.suspended_at is null
            and t.h >= ${WISH_FROM_HOUR_IST}
            and (
              (extract(month from p.date_of_birth) = extract(month from t.d) and extract(day from p.date_of_birth) = extract(day from t.d))
              -- 29 Feb birthdays: 28 Feb when this year has no 29 Feb
              or (extract(month from p.date_of_birth) = 2 and extract(day from p.date_of_birth) = 29
                  and extract(month from t.d) = 2 and extract(day from t.d) = 28
                  and extract(day from (date_trunc('year', t.d) + interval '2 months' - interval '1 day')) = 28)
            )
            and not exists (
              select 1 from notification n where n.user_id = p.user_id and n.type = 'birthday_wish' and n.created_at >= t.starts
            )
          order by p.user_id
        )
        insert into notification (user_id, type, note)
        select user_id, 'birthday_wish', nullif(first_name, '') from due
        returning user_id
      `)),
    ];
  });
  for (const { user_id } of rows) await publishEvent(db, { t: "notify", id: user_id });
  if (rows.length > 0) console.log(`[birthdays] wished ${rows.length} reporter${rows.length === 1 ? "" : "s"} a happy birthday`);
}
