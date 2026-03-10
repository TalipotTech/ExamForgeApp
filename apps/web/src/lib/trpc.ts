"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@examforge/api/trpc";

export const trpc = createTRPCReact<AppRouter>();
