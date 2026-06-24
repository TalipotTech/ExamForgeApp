// Purpose-based prompt enhancement. The raw user prompt is wrapped with
// quality + context instructions chosen by purpose, platform and style.
// See docs/features/ai-image-gen/AI_IMAGE_GENERATION.md §4.

export type ImagePurpose =
  // ExamForge
  | "tutorial_diagram"
  | "formula_card"
  | "comparison_infographic"
  | "pattern_chart"
  | "topic_thumbnail"
  | "exam_cover"
  | "marketplace_cover"
  | "creator_banner"
  | "social_media"
  // PadVik
  | "chapter_illustration"
  | "math_visualization"
  | "science_diagram"
  | "history_infographic"
  | "chapter_thumbnail"
  | "board_icon"
  | "worksheet_header"
  | "classroom_banner"
  // Shared
  | "doubt_visualization"
  | "placeholder"
  | "custom";

export type ImageStyle = "realistic" | "illustration" | "diagram" | "flat" | "watercolor";

export interface BuildEnhancedPromptParams {
  purpose: ImagePurpose;
  prompt: string;
  platform: "examforge" | "padvik";
  style?: ImageStyle;
}

export function buildEnhancedPrompt(params: BuildEnhancedPromptParams): string {
  const { purpose, prompt, platform, style } = params;

  // Base style prefix
  const styleMap: Record<ImageStyle, string> = {
    realistic: "Photorealistic, high detail, natural lighting.",
    illustration: "Clean educational illustration, vector-style, professional.",
    diagram:
      "Technical diagram, labeled, clean lines, white background, professional textbook style.",
    flat: "Flat design, minimal, clean, modern UI style, vibrant colors.",
    watercolor: "Watercolor illustration, soft colors, artistic, educational.",
  };

  const stylePrefix = styleMap[style ?? "illustration"];

  switch (purpose) {
    case "tutorial_diagram":
    case "science_diagram":
    case "chapter_illustration":
      return `${stylePrefix} Educational diagram for ${platform === "examforge" ? "competitive exam preparation" : "K-12 Indian curriculum"}. ${prompt}. Clean, labeled, textbook-quality. White or light background. No watermarks. Suitable for academic use.`;

    case "formula_card":
    case "math_visualization":
      return `${stylePrefix} Educational card with clear, readable text and mathematical notation. ${prompt}. Large readable font. Clean layout with proper spacing. Background: light gradient. Professional academic design.`;

    case "comparison_infographic":
    case "pattern_chart":
    case "history_infographic":
      return `${stylePrefix} Professional infographic. ${prompt}. Clean data visualization. Readable labels. Color-coded sections. Modern flat design. White background.`;

    case "topic_thumbnail":
    case "chapter_thumbnail":
    case "exam_cover":
    case "classroom_banner":
    case "creator_banner":
    case "board_icon":
      return `${stylePrefix} Eye-catching thumbnail for educational content. ${prompt}. Vibrant colors. Modern design. No text (text will be overlaid by the app). 16:9 aspect ratio composition.`;

    case "marketplace_cover":
      return `${stylePrefix} Professional product cover image for educational content marketplace. ${prompt}. Premium look. Clean composition. Would look good as a product card in an app store.`;

    case "doubt_visualization":
      return `${stylePrefix} Quick educational diagram to answer a student's question. ${prompt}. Simple, clear, focused on the concept. Labeled parts. White background.`;

    case "worksheet_header":
      return `${stylePrefix} Decorative header for a printable educational worksheet. ${prompt}. Clean, lightweight, print-friendly. Leaves room for a title.`;

    case "social_media":
      return `${stylePrefix} Social media post image for Indian education platform. ${prompt}. Eye-catching. Modern. Would perform well on Instagram/WhatsApp. Include space for text overlay.`;

    case "placeholder":
      return `Simple placeholder illustration. ${prompt}. Minimal detail needed.`;

    case "custom":
    default:
      return `${stylePrefix} ${prompt}`;
  }
}
