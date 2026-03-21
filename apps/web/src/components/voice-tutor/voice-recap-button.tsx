"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";
import { VoiceRecapOverlay } from "./voice-recap-overlay";
import type { RecapQuestion } from "./voice-recap-overlay";

interface VoiceRecapButtonProps {
  questions: RecapQuestion[];
  title?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function VoiceRecapButton({
  questions,
  title,
  variant = "outline",
  size = "default",
  className,
}: VoiceRecapButtonProps): React.ReactElement {
  const [showOverlay, setShowOverlay] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setShowOverlay(true)}
        disabled={questions.length === 0}
      >
        <Mic className="mr-1 h-4 w-4" />
        Voice Recap
      </Button>

      {showOverlay && questions.length > 0 && (
        <VoiceRecapOverlay
          questions={questions}
          title={title}
          onClose={() => setShowOverlay(false)}
        />
      )}
    </>
  );
}
