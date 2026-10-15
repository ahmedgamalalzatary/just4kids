import { describe, expect, it } from "vitest";
import { buildTimeline, messageKindLabels } from "@/lib/booking-timeline";
import type { BookingMessage, VisitEvent } from "@/lib/api/types";

const visitEvent = (id: string, occurredAt: string) => ({ id, occurredAt }) as unknown as VisitEvent;
const message = (id: string, occurredAt: string) => ({ id, occurredAt, kind: "sent_to_barber" }) as unknown as BookingMessage;

describe("booking timeline", () => {
  it("merges visit events and sent messages in time order", () => {
    const entries = buildTimeline(
      [visitEvent("v1", "2026-01-01T10:00:00.000Z"), visitEvent("v2", "2026-01-01T12:00:00.000Z")],
      [message("m1", "2026-01-01T11:00:00.000Z")],
    );
    expect(entries.map(entry => entry.type)).toEqual(["visit", "message", "visit"]);
    expect(entries[1]).toMatchObject({ type: "message", message: { id: "m1" } });
  });

  it("labels each message kind", () => {
    expect(messageKindLabels.sent_to_barber).toBe("Sent to barber");
  });
});
