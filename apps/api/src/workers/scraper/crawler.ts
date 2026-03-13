import { CheerioCrawler, Configuration, purgeDefaultStorages, RequestQueue } from "crawlee";
import { PlaywrightCrawler } from "@crawlee/playwright";
import { randomUUID } from "crypto";

export type CrawledPage = {
  url: string;
  title: string;
  textContent: string;
  htmlContent?: string;
};

export type CrawlOptions = {
  startUrl: string;
  maxPages: number;
  crawlerType: "cheerio" | "playwright";
  fetchDelayMs: number;
  urlPatterns?: string[];
  excludePatterns?: string[];
  contentSelector?: string;
  onPageCrawled?: (url: string) => void;
};

function buildUrlFilter(
  startUrl: string,
  urlPatterns?: string[],
  excludePatterns?: string[],
): (url: string) => boolean {
  let startOrigin: string;
  try {
    startOrigin = new URL(startUrl).origin;
  } catch {
    startOrigin = "";
  }

  return (url: string): boolean => {
    if (excludePatterns?.length) {
      for (const pattern of excludePatterns) {
        if (new RegExp(pattern).test(url)) return false;
      }
    }
    if (urlPatterns?.length) {
      return urlPatterns.some((pattern) => new RegExp(pattern).test(url));
    }
    try {
      return new URL(url).origin === startOrigin;
    } catch {
      return false;
    }
  };
}

export async function crawlPages(options: CrawlOptions): Promise<CrawledPage[]> {
  const {
    startUrl,
    maxPages,
    crawlerType,
    fetchDelayMs,
    urlPatterns,
    excludePatterns,
    contentSelector,
    onPageCrawled,
  } = options;

  const pages: CrawledPage[] = [];
  const shouldFollowUrl = buildUrlFilter(startUrl, urlPatterns, excludePatterns);

  // Disable Crawlee's persistent storage — BullMQ manages job state
  const config = Configuration.getGlobalConfig();
  config.set("persistStorage", false);

  // Purge in-memory storages BEFORE creating the crawler to avoid
  // request queue deduplication across runs within the same process.
  await purgeDefaultStorages();

  // Use a unique request queue per crawl to fully isolate runs
  const requestQueue = await RequestQueue.open(randomUUID());

  if (crawlerType === "playwright") {
    const crawler = new PlaywrightCrawler({
      requestQueue,
      maxRequestsPerCrawl: maxPages,
      requestHandlerTimeoutSecs: 60,
      navigationTimeoutSecs: 30,
      async requestHandler({ request, page, enqueueLinks }): Promise<void> {
        const title = await page.title();
        const bodyHandle = contentSelector ? await page.$(contentSelector) : await page.$("body");
        const textContent = bodyHandle ? await bodyHandle.innerText() : "";
        const htmlContent = bodyHandle ? await bodyHandle.innerHTML() : undefined;

        pages.push({ url: request.url, title, textContent, htmlContent });
        onPageCrawled?.(request.url);

        await enqueueLinks({
          strategy: "same-domain",
          transformRequestFunction: (req) => {
            if (!shouldFollowUrl(req.url)) return false;
            return req;
          },
        });

        if (fetchDelayMs > 0) {
          await new Promise<void>((r) => setTimeout(r, fetchDelayMs));
        }
      },
      failedRequestHandler({ request }, error): void {
        console.warn(`Page failed: ${request.url}`, error.message);
      },
    });

    await crawler.run([startUrl]);
  } else {
    const crawler = new CheerioCrawler({
      requestQueue,
      maxRequestsPerCrawl: maxPages,
      requestHandlerTimeoutSecs: 30,
      async requestHandler({ request, $, enqueueLinks }): Promise<void> {
        const title = $("title").text();
        const contentEl = contentSelector ? $(contentSelector) : $("body");
        const textContent = contentEl.text();
        const htmlContent = contentEl.html() ?? undefined;

        pages.push({ url: request.url, title, textContent, htmlContent });
        onPageCrawled?.(request.url);

        await enqueueLinks({
          strategy: "same-domain",
          transformRequestFunction: (req) => {
            if (!shouldFollowUrl(req.url)) return false;
            return req;
          },
        });

        if (fetchDelayMs > 0) {
          await new Promise<void>((r) => setTimeout(r, fetchDelayMs));
        }
      },
      failedRequestHandler({ request }, error): void {
        console.warn(`Page failed: ${request.url}`, error.message);
      },
    });

    await crawler.run([startUrl]);
  }

  // Clean up the unique request queue
  await requestQueue.drop();

  return pages;
}
