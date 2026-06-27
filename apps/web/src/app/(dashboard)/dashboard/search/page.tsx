import { SearchResults } from "./_components/search-results";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; nodeId?: string }>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const initialNodeId = sp.nodeId ? Number(sp.nodeId) : null;
  return (
    <SearchResults
      initialQuery={sp.q ?? ""}
      initialNodeId={Number.isFinite(initialNodeId) ? initialNodeId : null}
    />
  );
}
