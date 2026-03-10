import type { Metadata } from "next";
import { QuestionList } from "@/components/questions/question-list";

export const metadata: Metadata = {
  title: "Question Bank | ExamForge",
  description: "Browse and manage your exam question bank",
};

export default function QuestionsPage(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Question Bank</h1>
        <p className="text-muted-foreground">
          Browse, filter, and manage your exam questions.
        </p>
      </div>
      <QuestionList />
    </div>
  );
}
