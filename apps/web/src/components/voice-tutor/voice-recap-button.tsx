"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";

interface VoiceRecapButtonProps {
  examId?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function VoiceRecapButton({
  examId,
  variant = "outline",
  size = "default",
  className,
}: VoiceRecapButtonProps): React.ReactElement {
  const href = examId ? `/dashboard/voice-exam?examId=${examId}` : "/dashboard/voice-exam";

  return (
    <Link href={href as "/"}>
      <Button variant={variant} size={size} className={className}>
        <Mic className="mr-1 h-4 w-4" />
        Voice Recap
      </Button>
    </Link>
  );
}
