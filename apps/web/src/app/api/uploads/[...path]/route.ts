/**
 * GET /api/uploads/creator-content/{contentId}/{fileId}.{ext}
 *
 * Serves creator-uploaded files from the local storage directory with
 * path-traversal protection. Published content is served without auth
 * (same model as PadVik's /api/uploads pattern). Premium/paywalled
 * gating can layer on later by checking `creatorContent.isPremium` +
 * purchase records; kept simple for the MVP.
 */

import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import { resolveStoragePath } from "@/lib/content-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path: segments } = await ctx.params;
  const subPath = segments.join("/");
  const disk = resolveStoragePath(subPath);
  if (!disk) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const data = await fs.readFile(disk);
    const ext = disk.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
    const inlineSafe =
      mime.startsWith("image/") ||
      mime.startsWith("video/") ||
      mime.startsWith("audio/") ||
      mime === "application/pdf";
    const fileName = disk.split(/[\\/]/).pop() ?? "file";
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(data.length),
        "Content-Disposition": `${inlineSafe ? "inline" : "attachment"}; filename="${fileName}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
