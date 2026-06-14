"use client";

/**
 * Inline PDF viewer — adapted from PadVik's pattern. Shows a thumbnail
 * card with a "View PDF" button that opens a modal with an embedded
 * iframe. Browsers handle PDF rendering natively (Chrome / Edge /
 * Firefox all ship a PDF viewer plugin); no pdf.js dependency here.
 *
 * Our `/api/uploads/[...path]` route sets `Content-Disposition: inline`
 * for application/pdf so the iframe renders instead of downloading.
 */

import { useEffect, useState } from "react";
import { Download, Eye, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PdfViewer({
  url,
  fileName,
}: {
  url: string;
  fileName: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return (): void => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <div className="bg-muted/10 flex flex-col items-center gap-4 p-8">
        <FileText className="size-16 text-red-400" />
        <p className="text-sm font-medium">{fileName}</p>
        <div className="flex gap-2">
          <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            <Eye className="size-3.5" />
            View PDF
          </Button>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="size-3.5" />
              Open in new tab
            </Button>
          </a>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-background flex h-[85vh] w-[90vw] max-w-5xl flex-col rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
              <span className="truncate text-sm font-medium">{fileName}</span>
              <div className="flex gap-2">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs">
                    <Download className="size-3" />
                    New tab
                  </Button>
                </a>
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <iframe src={url} className="w-full flex-1 border-0" title={fileName} />
          </div>
        </div>
      )}
    </>
  );
}
