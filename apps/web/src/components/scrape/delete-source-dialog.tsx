"use client";

import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";

type Props = {
  source: { id: string; name: string };
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function DeleteSourceDialog({ source, onOpenChange, onSuccess }: Props): React.ReactElement {
  const deleteMutation = trpc.scrape.delete.useMutation({
    onSuccess,
  });

  function handleDelete(): void {
    deleteMutation.mutate({ id: source.id });
  }

  return (
    <AlertDialog open={true} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{source.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove this scrape source and its schedule. Questions that were
            already scraped will remain in the question bank.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
