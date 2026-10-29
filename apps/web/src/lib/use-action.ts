"use client";

import { useCallback, useTransition } from "react";
import { useToast } from "@/components/providers";
import type { ActionResult } from "./action-result";

/**
 * Calls a Server Action in a transition, toasts its error or success message,
 * and hands the result to `onDone`. Returns the pending flag for buttons.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const run = useCallback(
    <T>(action: () => Promise<ActionResult<T>>, options: { success?: string; onDone?: (data: T) => void; onError?: () => void } = {}) => {
      startTransition(async () => {
        const result = await action();
        if (!result.ok) {
          toast("error", result.error);
          options.onError?.();
          return;
        }
        if (options.success) toast("ok", options.success);
        options.onDone?.(result.data);
      });
    },
    [toast],
  );

  return { pending, run };
}
