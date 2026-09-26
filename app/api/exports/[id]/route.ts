import { getExportJob, publicExportJob } from "@/lib/export-store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = await getExportJob(id);
  if (!job) return Response.json({ error: "导出任务不存在或已过期。" }, { status: 404 });
  return Response.json(publicExportJob(job));
}

