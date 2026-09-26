import { NextRequest, NextResponse } from "next/server";

import { parsePrintItems } from "@/lib/print-items";
import { cleanupExpiredDataBestEffort } from "@/lib/cleanup";
import {
  PROJECT_COOKIE,
  ProjectConflictError,
  createProject,
  getProjectByToken,
  projectCookieOptions,
  publicProject,
  saveProject,
} from "@/lib/print-project";

export const runtime = "nodejs";
const MAX_BODY_LENGTH = 64 * 1024;

async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_LENGTH) throw new Error("body too large");
  const text = await request.text();
  if (text.length > MAX_BODY_LENGTH) throw new Error("body too large");
  return JSON.parse(text);
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(PROJECT_COOKIE)?.value;
    const project = await getProjectByToken(token);
    if (!project) return NextResponse.json({ error: "尚无可恢复的打印清单。" }, { status: 404 });
    const response = NextResponse.json(publicProject(project), { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(PROJECT_COOKIE, token!, projectCookieOptions());
    return response;
  } catch (error) {
    console.error("Project lookup failed:", error);
    return NextResponse.json({ error: "数据库暂时不可用，清单仍保存在此浏览器。" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await readBody(request);
  } catch {
    return NextResponse.json({ error: "打印清单请求格式无效。" }, { status: 400 });
  }
  const items = parsePrintItems((body as { items?: unknown })?.items, true);
  if (!items) return NextResponse.json({ error: "打印清单包含无效卡片或数量。" }, { status: 400 });
  try {
    await cleanupExpiredDataBestEffort();
    const existing = await getProjectByToken(request.cookies.get(PROJECT_COOKIE)?.value);
    if (existing) return NextResponse.json(publicProject(existing));
    const { token, project } = await createProject(items);
    const response = NextResponse.json({ ...publicProject(project), recoveryToken: token }, { status: 201 });
    response.cookies.set(PROJECT_COOKIE, token, projectCookieOptions());
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Project creation failed:", error);
    return NextResponse.json({ error: "数据库暂时不可用，清单仍保存在此浏览器。" }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await readBody(request);
  } catch {
    return NextResponse.json({ error: "打印清单请求格式无效。" }, { status: 400 });
  }
  const input = body as { items?: unknown; revision?: unknown } | null;
  const items = parsePrintItems(input?.items, true);
  if (!items || !Number.isSafeInteger(input?.revision) || (input?.revision as number) < 0) {
    return NextResponse.json({ error: "打印清单或修订号无效。" }, { status: 400 });
  }
  try {
    const token = request.cookies.get(PROJECT_COOKIE)?.value;
    const project = await getProjectByToken(token);
    if (!project) return NextResponse.json({ error: "项目令牌无效或已过期。" }, { status: 401 });
    const saved = await saveProject(project, input!.revision as number, items);
    const response = NextResponse.json(saved);
    response.cookies.set(PROJECT_COOKIE, token!, projectCookieOptions());
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof ProjectConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Project update failed:", error);
    return NextResponse.json({ error: "云端保存失败，清单仍保存在此浏览器。" }, { status: 503 });
  }
}
