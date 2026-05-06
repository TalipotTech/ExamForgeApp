import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Top exam-prep creators on ExamForge",
  description:
    "Browse verified educators creating BPharm, GPAT, NEET, UPSC, and GATE exam-prep content on ExamForge — taught by real toppers, faculty, and institutions.",
  openGraph: {
    title: "Top exam-prep creators on ExamForge",
    description:
      "Browse verified educators creating BPharm, GPAT, NEET, UPSC, and GATE exam-prep content on ExamForge.",
    type: "website",
  },
};

export default function CreatorsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <>{children}</>;
}
