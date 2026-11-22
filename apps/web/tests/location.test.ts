import { describe, expect, it } from "vitest";
import { lastSeen, mapsLink, visitLine } from "@/lib/location";

const now = new Date("2026-11-22T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("barber location labels", () => {
  it("calls a position live for 90 seconds, then says how long ago it was seen", () => {
    expect(lastSeen(ago(10_000), now)).toEqual({ live: true, label: "Live now" });
    expect(lastSeen(ago(89_000), now)).toEqual({ live: true, label: "Live now" });
    expect(lastSeen(ago(91_000), now)).toEqual({ live: false, label: "Last seen 1 min ago" });
    expect(lastSeen(ago(45 * 60_000), now)).toEqual({ live: false, label: "Last seen 45 min ago" });
    expect(lastSeen(ago(3 * 3_600_000), now)).toEqual({ live: false, label: "Last seen 3 h ago" });
    expect(lastSeen(ago(3 * 86_400_000), now).label).toBe("Last seen Nov 19, 2026, 3:00 PM");
  });

  it("links a position to Google Maps", () => {
    expect(mapsLink(29.3401, 48.0011)).toBe("https://www.google.com/maps?q=29.3401,48.0011");
  });

  it("describes the visit in progress or the next one", () => {
    expect(visitLine({ id: "x", startTime: "14:30", endTime: "15:30", area: "Salmiya", visitStatus: "arrived" })).toBe("At a visit until 3:30 PM · Salmiya");
    expect(visitLine({ id: "x", startTime: "18:00", endTime: "19:00", area: "Jabriya", visitStatus: "booked" })).toBe("Next visit 6:00 PM · Jabriya");
    expect(visitLine(null)).toBe("No more visits today");
  });
});
