import { getExportJob, readExportFile } from "@/lib/export-store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = await getExportJob(id);
  if (!job) return Response.json({ error: "导出任务不存在或已过期。" }, { status: 404 });
  if (job.status !== "completed") {
    return Response.json({ error: job.error ?? "文件尚未生成，请稍后再试。", status: job.status }, { status: 409 });
  }
  const file = await readExportFile(id);
  if (!file) return Response.json({ error: "导出文件已丢失，请重新生成。" }, { status: 410 });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(job.fileName ?? `ygo-cardprint-${id}.docx`)}`,
      "Content-Length": String(file.byteLength),
      "Cache-Control": "no-store",
    },
  });
}

