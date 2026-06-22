import type { Metadata } from "next";

const SITE_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "https://ice.ensate.in";
const DIRECTORY_URL = `${SITE_BASE_URL}/creators`;

export const metadata: Metadata = {
  title: "Top exam-prep creators on ExamForge",
  description:
    "Browse verified educators creating BPharm, GPAT, NEET, UPSC, and GATE exam-prep content on ExamForge — taught by real toppers, faculty, and institutions.",
  alternates: { canonical: DIRECTORY_URL },
  openGraph: {
    title: "Top exam-prep creators on ExamForge",
    description:
      "Browse verified educators creating BPharm, GPAT, NEET, UPSC, and GATE exam-prep content on ExamForge.",
    type: "website",
    url: DIRECTORY_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Top exam-prep creators on ExamForge",
    description:
      "Browse verified educators creating BPharm, GPAT, NEET, UPSC, and GATE exam-prep content on ExamForge.",
  },
};

export default function CreatorsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <>{children}</>;
}
