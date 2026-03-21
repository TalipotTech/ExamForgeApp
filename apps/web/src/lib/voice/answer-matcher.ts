export type AnswerMatchResult =
  | { matched: true; selectedIndex: number; isCorrect: boolean; isCommand?: false }
  | { matched: true; isCommand: true; command: string }
  | { matched: false; rawTranscript: string };

const COMMANDS = [
  "skip",
  "next",
  "explain",
  "stop",
  "end",
  "repeat",
  "more",
  "yes",
  "no",
  "pause",
  "resume",
] as const;

export type VoiceCommand = (typeof COMMANDS)[number];

const NUMBER_MAP: Record<string, number> = {
  "1": 0,
  one: 0,
  first: 0,
  "2": 1,
  two: 1,
  second: 1,
  "3": 2,
  three: 2,
  third: 2,
  "4": 3,
  four: 3,
  fourth: 3,
};

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0]![j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }

  return matrix[b.length]![a.length]!;
}

function fuzzyMatch(input: string, target: string): number {
  if (input === target) return 1;
  if (target.includes(input) || input.includes(target)) return 0.9;

  const maxLen = Math.max(input.length, target.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(input, target);
  return 1 - distance / maxLen;
}

export function matchSpokenAnswer(
  transcript: string,
  options: string[],
  correctIndex: number,
): AnswerMatchResult {
  const normalized = transcript.toLowerCase().trim();

  // 1. Direct letter match: "A", "B", "C", "D", "option A", "letter B"
  const letterMatch = normalized.match(/^(?:option\s+|letter\s+)?([a-d])\.?$/i);
  if (letterMatch) {
    const index = letterMatch[1]!.charCodeAt(0) - 97;
    return {
      matched: true,
      selectedIndex: index,
      isCorrect: index === correctIndex,
    };
  }

  // 2. Number match: "1", "2", "3", "4", "first", "second"
  if (NUMBER_MAP[normalized] !== undefined) {
    const index = NUMBER_MAP[normalized];
    return {
      matched: true,
      selectedIndex: index,
      isCorrect: index === correctIndex,
    };
  }

  // 3. Content match: fuzzy match against option text
  const scores = options.map((opt, i) => ({
    index: i,
    score: fuzzyMatch(normalized, opt.toLowerCase()),
  }));
  const bestMatch = scores.sort((a, b) => b.score - a.score)[0];
  if (bestMatch && bestMatch.score > 0.6) {
    return {
      matched: true,
      selectedIndex: bestMatch.index,
      isCorrect: bestMatch.index === correctIndex,
    };
  }

  // 4. Command match
  const commandMatch = COMMANDS.find((cmd) => normalized.includes(cmd));
  if (commandMatch) {
    return { matched: true, isCommand: true, command: commandMatch };
  }

  // 5. No match
  return { matched: false, rawTranscript: normalized };
}
