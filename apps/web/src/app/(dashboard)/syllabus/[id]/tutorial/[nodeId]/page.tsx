"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  FileText,
  Lightbulb,
  Target,
  FlaskConical,
  Brain,
  List,
  BookMarked,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

const SECTION_ICONS: Record<string, React.ReactNode> = {
  introduction: <BookOpen className="h-4 w-4" />,
  explanation: <FileText className="h-4 w-4" />,
  definition: <Lightbulb className="h-4 w-4 text-yellow-500" />,
  formula: <FlaskConical className="h-4 w-4 text-purple-500" />,
  example: <Target className="h-4 w-4 text-green-500" />,
  application: <Brain className="h-4 w-4 text-blue-500" />,
  summary: <List className="h-4 w-4" />,
  references: <BookMarked className="h-4 w-4 text-gray-500" />,
};

export default function TutorialViewerPage(): React.ReactElement {
  const params = useParams();
  const syllabusId = params.id as string;
  const nodeId = Number(params.nodeId);

  const tutorialQuery = trpc.syllabus.getTutorial.useQuery({ nodeId });

  if (tutorialQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-64" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (!tutorialQuery.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            No tutorial generated for this node yet.
            <br />
            <Link href={`/syllabus/${syllabusId}` as "/"}>
              <Button variant="link">Go back to syllabus tree</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tutorial = tutorialQuery.data;
  const content = tutorial.content as {
    sections: Array<{
      type: string;
      title: string;
      body: string;
      provider?: string;
      key_terms?: string[];
    }>;
    learning_objectives: string[];
    key_definitions: Array<{ term: string; definition: string }>;
    formulas?: Array<{
      name: string;
      formula: string;
      explanation: string;
    }>;
    mnemonics?: Array<{ topic: string; mnemonic: string }>;
    clinical_applications?: string[];
    difficulty_level: string;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <Link href={`/syllabus/${syllabusId}` as "/"}>
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back to tree
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{tutorial.title}</h1>
        <div className="text-muted-foreground mt-2 flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {tutorial.estimatedReadMinutes ?? "?"} min read
          </span>
          <span>{tutorial.wordCount?.toLocaleString() ?? "?"} words</span>
          <Badge variant="outline" className="text-xs capitalize">
            {content.difficulty_level}
          </Badge>
          <span>v{tutorial.version}</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {(tutorial.providersUsed as string[]).map((p) => (
            <Badge key={p} variant="secondary" className="text-xs capitalize">
              {p}
            </Badge>
          ))}
        </div>
      </div>

      {/* Learning Objectives */}
      {content.learning_objectives.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-green-500" />
              Learning Objectives
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {content.learning_objectives.map((obj, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                  {obj}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Sections */}
      {content.sections.map((section, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {SECTION_ICONS[section.type] ?? <FileText className="h-4 w-4" />}
              {section.title}
              {section.provider && (
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {section.provider}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
              {section.body}
            </div>
            {section.key_terms && section.key_terms.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {section.key_terms.map((term) => (
                  <Badge key={term} variant="secondary" className="text-xs">
                    {term}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Key Definitions */}
      {content.key_definitions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              Key Definitions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {content.key_definitions.map((def, i) => (
                <div key={i}>
                  <p className="text-sm font-medium">{def.term}</p>
                  <p className="text-muted-foreground mt-0.5 text-sm">{def.definition}</p>
                  {i < content.key_definitions.length - 1 && <Separator className="mt-3" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formulas */}
      {content.formulas && content.formulas.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-4 w-4 text-purple-500" />
              Formulas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {content.formulas.map((f, i) => (
                <div key={i}>
                  <p className="text-sm font-medium">{f.name}</p>
                  <code className="bg-muted mt-1 block rounded px-3 py-2 font-mono text-sm">
                    {f.formula}
                  </code>
                  <p className="text-muted-foreground mt-1 text-sm">{f.explanation}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mnemonics */}
      {content.mnemonics && content.mnemonics.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-blue-500" />
              Mnemonics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {content.mnemonics.map((m, i) => (
                <div key={i}>
                  <p className="text-sm font-medium">{m.topic}</p>
                  <p className="bg-muted mt-1 rounded px-3 py-2 text-sm italic">{m.mnemonic}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clinical Applications */}
      {content.clinical_applications && content.clinical_applications.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-teal-500" />
              Clinical / Practical Applications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {content.clinical_applications.map((app, i) => (
                <li key={i}>{app}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
