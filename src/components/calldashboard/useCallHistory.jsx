import { useQuery } from "@tanstack/react-query";
import moment from "moment-timezone";
import { base44 } from "@/api/base44Client";

export default function useCallHistory(start, end) {
  const earliest = moment.tz("America/New_York").subtract(89, "days").startOf("day").toISOString();
  const latest = moment.tz("America/New_York").endOf("day").toISOString();
  const from = start && start.toISOString() > earliest ? start.toISOString() : earliest;
  const to = end && end.toISOString() < latest ? end.toISOString() : latest;
  return useQuery({
    queryKey: ["callRecords", from, to],
    queryFn: async ({ signal }) => {
      if (from > to) return [];
      const query = {
        call_date: { $gte: from, $lte: to },
        call_duration_seconds: { $gte: 30 },
      };
      const records = [];
      let cursor;
      do {
        signal.throwIfAborted();
        const page = await base44.entities.CallRecord.filter(query, {
          sort: "-call_date", limit: 100, ...(cursor ? { cursor } : {}),
        });
        records.push(...page.items);
        cursor = page.has_more ? page.next_cursor : null;
      } while (cursor);
      return records;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}