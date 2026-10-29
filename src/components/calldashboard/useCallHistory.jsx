import { useQuery, useQueryClient } from "@tanstack/react-query";
import moment from "moment-timezone";
import { base44 } from "@/api/base44Client";
import { getAppTimezone } from '@/lib/timezone';
import { isCountableCall } from '@/lib/callDuration';

const SUMMARY_FIELDS = ["id", "call_date", "call_duration_seconds", "call_direction", "caller_phone", "caller_name", "team_member", "caller_type", "caller_intent", "transcript_summary", "recording_url", "bookable", "booking_outcome", "was_booked", "booked_date", "booking_offered", "missed_call", "clinic_closed", "status"];

export default function useCallHistory(start, end) {
  const queryClient = useQueryClient();
  const earliest = moment.tz(getAppTimezone()).subtract(89, "days").startOf("day").toISOString();
  const latest = moment.tz(getAppTimezone()).endOf("day").toISOString();
  const from = start && start.toISOString() > earliest ? start.toISOString() : earliest;
  const to = end && end.toISOString() < latest ? end.toISOString() : latest;
  return useQuery({
    queryKey: ["callRecords", from, to],
    queryFn: async ({ signal }) => {
      if (from > to) return [];
      const tz = getAppTimezone();
      // Pull every call that is long enough to count, plus every missed call
      // (any duration) so after-hours queue/voicemail calls are included.
      const query = {
        call_date: { $gte: from, $lte: to },
        $or: [
          { call_duration_seconds: { $gte: 30 } },
          { missed_call: true },
        ],
      };
      const loadPages = async (filter, fields) => {
        const records = [];
        let cursor;
        do {
          signal.throwIfAborted();
          const page = await queryClient.fetchQuery({
            queryKey: ["callHistoryPage", filter, fields, cursor || "first"],
            queryFn: () => base44.entities.CallRecord.filter(filter, {
              sort: "-call_date", limit: 250, fields, ...(cursor ? { cursor } : {}),
            }),
            staleTime: 5 * 60 * 1000,
            retry: false,
          });
          records.push(...page.items);
          cursor = page.has_more ? page.next_cursor : null;
        } while (cursor);
        return records;
      };
      const records = (await loadPages(query, SUMMARY_FIELDS)).filter(c => isCountableCall(c, tz));
      // Preserve the existing outgoing-call badges without downloading transcripts.
      const withoutTranscript = await loadPages({
        call_date: { $gte: from, $lte: to },
        call_direction: "outbound",
        call_duration_seconds: { $gte: 30 },
        $or: [{ transcript: null }, { transcript: "No transcript" }, { transcript: { $regex: "^\\s*$" } }],
      }, ["id"]);
      const missingIds = new Set(withoutTranscript.map(c => c.id));
      return records.map(c => ({ ...c, has_transcript: !missingIds.has(c.id) }));
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}