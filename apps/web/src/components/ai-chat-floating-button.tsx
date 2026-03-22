"use client";

import { Button } from "@/components/ui/button";
import { AiChatPopup } from "@/components/ai-chat-popup";
import { useAiChatPopupStore } from "@/stores/ai-chat-popup-store";
import { MessageSquare, X } from "lucide-react";

interface AiChatFloatingButtonProps {
  pageContext?: string;
}

export function AiChatFloatingButton({
  pageContext,
}: AiChatFloatingButtonProps): React.ReactElement {
  const isOpen = useAiChatPopupStore((s) => s.isOpen);
  const togglePopup = useAiChatPopupStore((s) => s.togglePopup);

  return (
    <>
      <AiChatPopup key={pageContext} pageContext={pageContext} />

      <div className="fixed bottom-6 right-6 z-40">
        <Button
          size="lg"
          className="relative h-14 w-14 rounded-full p-0 shadow-lg"
          onClick={togglePopup}
          title={isOpen ? "Close AI Chat" : "Ask AI"}
        >
          {isOpen ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
        </Button>
      </div>
    </>
  );
}
