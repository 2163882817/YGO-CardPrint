// Cloud projects and stored exports are paused. Preserve their data and code,
// but do not connect to the database or Blob from the retired API endpoints.
export const CLOUD_FEATURES_ENABLED = false;

export function cloudPausedResponse() {
  return Response.json({
    error: "云端功能已暂停，请在当前页面使用本机清单并直接下载 Word。",
    code: "CLOUD_DISABLED",
  }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
