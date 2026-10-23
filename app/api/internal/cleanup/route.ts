import { cleanupExpiredData } from "@/lib/cleanup";
import { CLOUD_FEATURES_ENABLED, cloudPausedResponse } from "@/lib/cloud-features";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!CLOUD_FEATURES_ENABLED) return cloudPausedResponse();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await cleanupExpiredData());
  } catch (error) {
    console.error("Scheduled cleanup failed:", error);
    return Response.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
