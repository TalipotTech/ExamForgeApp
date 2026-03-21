export type VoiceSessionState =
  | "idle"
  | "speaking"
  | "listening"
  | "processing"
  | "correct"
  | "wrong"
  | "feedback"
  | "paused"
  | "complete";

export type VoiceSessionEvent =
  | { type: "START" }
  | { type: "SPEECH_END" }
  | { type: "USER_SPOKE"; transcript: string }
  | { type: "ANSWER_CORRECT" }
  | { type: "ANSWER_WRONG" }
  | { type: "FEEDBACK_DONE" }
  | { type: "NEXT_QUESTION" }
  | { type: "SESSION_COMPLETE" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "SKIP" }
  | { type: "REPEAT" }
  | { type: "STOP" }
  | { type: "ERROR"; error: string };

type StateChangeCallback = (newState: VoiceSessionState, event: VoiceSessionEvent) => void;

const TRANSITIONS: Record<
  VoiceSessionState,
  Partial<Record<VoiceSessionEvent["type"], VoiceSessionState>>
> = {
  idle: {
    START: "speaking",
  },
  speaking: {
    SPEECH_END: "listening",
    PAUSE: "paused",
    STOP: "complete",
    SKIP: "speaking",
  },
  listening: {
    USER_SPOKE: "processing",
    PAUSE: "paused",
    STOP: "complete",
    SKIP: "speaking",
    REPEAT: "speaking",
    ERROR: "listening",
  },
  processing: {
    ANSWER_CORRECT: "correct",
    ANSWER_WRONG: "wrong",
    SKIP: "speaking",
    STOP: "complete",
  },
  correct: {
    FEEDBACK_DONE: "feedback",
  },
  wrong: {
    FEEDBACK_DONE: "feedback",
  },
  feedback: {
    NEXT_QUESTION: "speaking",
    SESSION_COMPLETE: "complete",
    PAUSE: "paused",
    STOP: "complete",
  },
  paused: {
    RESUME: "speaking",
    STOP: "complete",
  },
  complete: {},
};

export class VoiceSessionStateMachine {
  private _state: VoiceSessionState = "idle";
  private listeners: StateChangeCallback[] = [];

  get state(): VoiceSessionState {
    return this._state;
  }

  transition(event: VoiceSessionEvent): VoiceSessionState {
    const nextState = TRANSITIONS[this._state]?.[event.type];
    if (nextState) {
      this._state = nextState;
      this.listeners.forEach((cb) => cb(nextState, event));
    }
    return this._state;
  }

  canTransition(eventType: VoiceSessionEvent["type"]): boolean {
    return TRANSITIONS[this._state]?.[eventType] !== undefined;
  }

  onStateChange(callback: StateChangeCallback): () => void {
    this.listeners.push(callback);
    return (): void => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  reset(): void {
    this._state = "idle";
  }
}
