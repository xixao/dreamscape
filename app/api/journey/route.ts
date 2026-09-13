import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { body, db, fail, safe } from "@/lib/server";
import { journeySchema } from "@/lib/journey";
import { demoJourney } from "@/lib/demo/journey";

async function owner() {
  const user = await getChatGPTUser();
  if (!user) fail("Sign in to edit your journey", 401);
  return user.userId;
}
export async function GET() {
  return safe(async () => {
    const row = await db()
      .prepare("SELECT value,version FROM journeys WHERE owner=?")
      .bind(await owner())
      .first();
    return row
      ? { journey: JSON.parse(row.value as string), version: row.version }
      : { journey: demoJourney, version: 0 };
  });
}
export async function POST(request: Request) {
  return safe(async () => {
    const userId = await owner();
    const data = await body(request);
    const journey = journeySchema.parse(data.journey);
    const version = z.number().int().min(0).parse(data.version);
    const value = JSON.stringify(journey);
    const result =
      version === 0
        ? await db()
            .prepare(
              "INSERT OR IGNORE INTO journeys (owner,value,version) VALUES (?,?,1)",
            )
            .bind(userId, value)
            .run()
        : await db()
            .prepare(
              "UPDATE journeys SET value=?,version=version+1 WHERE owner=? AND version=?",
            )
            .bind(value, userId, version)
            .run();
    if (!result.meta.changes)
      fail(
        "This journey was saved elsewhere. Reload the saved journey before editing again.",
        409,
      );
    return { journey, version: version + 1 };
  });
}
