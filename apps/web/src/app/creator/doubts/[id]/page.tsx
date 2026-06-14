"use client";

import { use } from "react";
import { DoubtThread } from "@/components/doubt-thread";

export default function CreatorDoubtThreadPage(props: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(props.params);
  return <DoubtThread doubtId={id} backHref="/creator/doubts" backLabel="Doubt Inbox" />;
}
