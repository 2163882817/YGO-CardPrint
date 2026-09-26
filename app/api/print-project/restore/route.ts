import { NextRequest, NextResponse } from "next/server";

import {
  PROJECT_COOKIE,
  getProjectByToken,
  projectCookieOptions,
  publicProject,
  validProjectToken,
} from "@/lib/print-project";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let token: unknown;
  try {
    if (Number(request.headers.get("content-length")) > 256) throw new Error("body too large");
    token = (await request.json() as { token?: unknown }).token;
  } catch {
    return NextResponse.json({ error: "找回令牌格式无效。" }, { status: 400 });
  }
  if (!validProjectToken(token)) {
    return NextResponse.json({ error: "找回令牌格式无效。" }, { status: 400 });
  }
  try {
    const project = await getProjectByToken(token);
    if (!project) return NextResponse.json({ error: "找回链接无效或已过期。" }, { status: 404 });
    const response = NextResponse.json(publicProject(project));
    response.cookies.set(PROJECT_COOKIE, token, projectCookieOptions());
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Project restore failed:", error);
    return NextResponse.json({ error: "数据库暂时不可用，请稍后重试。" }, { status: 503 });
  }
}
