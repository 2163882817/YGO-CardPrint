import sharp from "sharp";
import { NextRequest } from "next/server";

import { CARD_VARIANTS, type CardVariant } from "@/lib/cards";
import { CardImageError, validateAndCacheCardImage } from "@/lib/card-image-service";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id") ?? "";
  const cid = Number(params.get("cid"));
  const variant = params.get("variant") as CardVariant | null;
  if (!/^\d{1,12}$/.test(id) || !Number.isSafeInteger(cid) || cid <= 0 ||
    !CARD_VARIANTS.some((item) => item.id === variant)) {
    return Response.json({ error: "卡图参数无效。" }, { status: 400 });
  }

  try {
    const image = await validateAndCacheCardImage(id, cid, variant!);
    const preview = await sharp(image.data)
      .rotate()
      .resize({ width: 350, height: 510, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    return new Response(new Uint8Array(preview), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Card image preview failed:", error);
    const status = error instanceof CardImageError && error.kind === "invalid" ? 422 : 502;
    return Response.json({ error: "卡图暂时不可用。" }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
