// Retained for the paused cloud export API. Direct downloads do not import it.
import type { PrintItem } from "@/lib/cards";
import { buildExportDocument } from "@/lib/export-docx";
import { isSuspendedBlobStore, SUSPENDED_BLOB_ERROR } from "@/lib/blob-storage";
import { completeExportJob, updateExportJob } from "@/lib/export-store";

export async function generateExportDocument(jobId: string, items: PrintItem[]) {
  try {
    await updateExportJob(jobId, { status: "processing" });
    const { file, fileName, warnings } = await buildExportDocument(items);
    await completeExportJob(jobId, file, fileName, warnings);
  } catch (error) {
    const message = isSuspendedBlobStore(error) ? SUSPENDED_BLOB_ERROR :
      error instanceof Error ? error.message : "生成 Word 文件失败";
    await updateExportJob(jobId, { status: "failed", error: message }).catch(console.error);
  }
}
