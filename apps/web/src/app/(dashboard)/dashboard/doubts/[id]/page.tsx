"use client";

import { use } from "react";
import { DoubtThread } from "@/components/doubt-thread";

export default function StudentDoubtThreadPage(props: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(props.params);
  return <DoubtThread doubtId={id} backHref="/dashboard/doubts" backLabel="My doubts" />;
}
