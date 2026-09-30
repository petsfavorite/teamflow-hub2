import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import CallDetailPanel from "@/components/calldashboard/CallDetailPanel";

export default function CallDetailLoader({ call, onClose, onUpdate, ...props }) {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["callDetail", call.id],
    queryFn: () => base44.entities.CallRecord.get(call.id),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const handleUpdate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["callDetail", call.id] });
    // Reuse other cached pages; refresh only the page containing this call.
    await queryClient.invalidateQueries({
      predicate: query => query.queryKey[0] === "callHistoryPage" && query.state.data?.items?.some(item => item.id === call.id),
    });
    onUpdate?.();
  };
  if (isPending || isError) return (
    <Sheet open onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>Call Details</SheetTitle></SheetHeader>
        <div className="py-6 space-y-3">
          {isPending ? <p role="status">Loading call details…</p> : <>
            <p role="alert">Call details couldn't load. Please try again.</p>
            <Button onClick={() => refetch()}>Retry</Button>
          </>}
        </div>
      </SheetContent>
    </Sheet>
  );
  return <CallDetailPanel call={data} open onClose={onClose} onUpdate={handleUpdate} {...props} />;
}