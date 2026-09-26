import { getExportJob, publicExportJob } from "@/lib/export-store";
import { PROJECT_COOKIE, getProjectByToken } from "@/lib/print-project";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const project = await getProjectByToken(request.cookies.get(PROJECT_COOKIE)?.value);
    if (!project) return Response.json({ error: "项目令牌无效或已过期。" }, { status: 401 });
    const job = await getExportJob(id, project.id);
    if (!job) return Response.json({ error: "导出任务不存在或已过期。" }, { status: 404 });
    return Response.json(publicExportJob(job), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Export lookup failed:", error);
    return Response.json({ error: "导出任务暂时不可用。" }, { status: 503 });
  }
}

