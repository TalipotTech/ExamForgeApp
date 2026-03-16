import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://examforge.in";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/exams`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  // Fetch public exams with topics from the API
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
    const response = await fetch(`${apiUrl}/trpc/publicContent.listPublicExams`, {
      next: { revalidate: 3600 }, // Revalidate every hour
    });

    if (response.ok) {
      const json = await response.json();
      const exams = json?.result?.data ?? [];

      for (const exam of exams) {
        staticRoutes.push({
          url: `${BASE_URL}/topics/${exam.slug}`,
          lastModified: new Date(),
          changeFrequency: "weekly",
          priority: 0.8,
        });
      }
    }
  } catch {
    // Silently fail — sitemap still returns static routes
  }

  return staticRoutes;
}
