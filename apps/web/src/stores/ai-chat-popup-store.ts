import { create } from "zustand";

export type ContextItem = {
  id: number;
  title: string;
  content: string;
  examName?: string | null;
  syllabusName?: string | null;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AiChatPopupState = {
  isOpen: boolean;
  contextItems: ContextItem[];
  contextType: "notes" | "topics" | null;
  conversationId: string | null;
  messages: ChatMessage[];
  hasSentInitial: boolean;

  openPopup: () => void;
  closePopup: () => void;
  togglePopup: () => void;
  setContextItems: (items: ContextItem[], type: "notes" | "topics") => void;
  setConversationId: (id: string | null) => void;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setHasSentInitial: (sent: boolean) => void;
  reset: () => void;
};

export const useAiChatPopupStore = create<AiChatPopupState>((set) => ({
  isOpen: false,
  contextItems: [],
  contextType: null,
  conversationId: null,
  messages: [],
  hasSentInitial: false,

  openPopup: (): void => set({ isOpen: true }),
  closePopup: (): void => set({ isOpen: false }),
  togglePopup: (): void => set((s) => ({ isOpen: !s.isOpen })),

  setContextItems: (items, type): void =>
    set({
      contextItems: items,
      contextType: type,
      // Reset conversation when context changes
      conversationId: null,
      messages: [],
      hasSentInitial: false,
    }),

  setConversationId: (id): void => set({ conversationId: id }),
  addMessage: (msg): void => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages: (msgs): void => set({ messages: msgs }),
  setHasSentInitial: (sent): void => set({ hasSentInitial: sent }),

  reset: (): void =>
    set({
      isOpen: false,
      contextItems: [],
      contextType: null,
      conversationId: null,
      messages: [],
      hasSentInitial: false,
    }),
}));

export function buildContextMessage(items: ContextItem[], type: "notes" | "topics"): string {
  if (type === "notes") {
    if (items.length === 1) {
      const note = items[0]!;
      return note.title
        ? `Based on this note:\n\nQuestion: ${note.title}\nAnswer: ${note.content}\n\nExplain this topic in more detail and help me understand it better.`
        : `Based on this note:\n\n${note.content}\n\nExplain this topic in more detail and help me understand it better.`;
    }
    const notesList = items
      .map(
        (n, i) =>
          `Note ${i + 1}: ${n.title ? `Question: ${n.title}` : "Note"}\nContent: ${n.content}`,
      )
      .join("\n\n");
    return `I've selected ${items.length} notes I'd like to discuss:\n\n${notesList}\n\nHelp me understand these topics better. Explain the key concepts and important points.`;
  }

  // topics
  if (items.length === 1) {
    const topic = items[0]!;
    return `I'm studying the topic "${topic.title}" from ${topic.syllabusName ?? "my syllabus"}${topic.examName ? ` (${topic.examName})` : ""}.\n\nHelp me understand this topic better. Explain the key concepts, important points to remember, and any common exam questions related to it.`;
  }
  const topicsList = items
    .map(
      (t, i) =>
        `Topic ${i + 1}: "${t.title}" from ${t.syllabusName ?? "syllabus"}${t.examName ? ` (${t.examName})` : ""}`,
    )
    .join("\n");
  return `I'm studying ${items.length} topics and need help understanding them:\n\n${topicsList}\n\nHelp me understand these topics better. Explain the key concepts, important points to remember, and any common exam questions.`;
}
