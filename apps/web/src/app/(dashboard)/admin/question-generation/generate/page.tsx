import type { Metadata } from "next";
import { QuestionGenerator } from "@/components/generate/question-generator";

export const metadata: Metadata = {
  title: "Generate Questions — ExamForge",
  description: "Generate exam questions using AI",
};

export default function GeneratePage(): React.ReactElement {
  return <QuestionGenerator />;
}
