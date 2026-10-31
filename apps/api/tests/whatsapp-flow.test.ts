import { describe, expect, it, vi } from "vitest";
import type { WhatsAppFlow } from "@just4kids/db/schema";
import { advance, NOT_PROVIDED, render } from "../src/modules/whatsapp/flow.js";
import type { FlowContext } from "../src/modules/whatsapp/flow.js";

const barber = { id: "b1", name: "Lenny" };
const context: FlowContext = { barbers: [barber, { id: "b2", name: "Heneer" }], areas: [{ id: "a1", name: "Hawally" }], now: new Date("2026-10-30T09:00:00.000Z") };
const noAi = vi.fn(async () => { throw new Error("the AI must not be called"); });
const walk = async (state: WhatsAppFlow | null, ...inputs: string[]) => {
  let current = state, last;
  for (const input of inputs) { last = await advance(current, input, context, noAi); current = last.state; }
  return last!;
};
const arabic: WhatsAppFlow = { step: "menu", language: "ar" };

describe("WhatsApp flow", () => {
  it("always opens with the language menu, whatever the first message says", async () => {
    const turn = await advance(null, "ابي احجز", context, noAi);
    expect(turn.state.step).toBe("language");
    expect(turn.reply).toContain("1. English\n2. العربية");
  });

  it("sends the main menu without my-bookings after a language is chosen", async () => {
    const turn = await walk({ step: "language", language: null }, "2");
    expect(turn.reply).toContain("✅ اللغة: العربية");
    expect(turn.reply).toContain("1. حجز موعد\n2. إلغاء أو تعديل طلب\n3. الرجوع للخطوة السابقة");
    expect(turn.reply).not.toContain("حجوزاتي");
  });

  it("ends every list with a way back, in the client's language", async () => {
    const booking = { language: "ar" as const, who: "boy" as const, children: 1, date: "2026-10-30", startTime: "16:00", endTime: "18:00", area: context.areas[0]!, address: { block: "1", street: "1", houseNumber: "1", buildingName: null, avenue: null, floor: null, apartment: null, mapsUrl: null } };
    for (const step of ["language", "menu", "who", "barber", "date", "confirm"] as const) {
      expect(render({ ...booking, step }, context).split("\n").at(-1)).not.toBe("");
      expect(render({ ...booking, step }, context)).toMatch(/\d\. الرجوع للخطوة السابقة(\n\n.*)?$/);
    }
    expect(render({ step: "who", language: "en" }, context).split("\n").at(-1)).toMatch(/^\d\. Back to the previous step$/);
  });

  it("offers no way back before a language was ever chosen", () => {
    expect(render({ step: "language", language: null }, context)).not.toContain("الرجوع");
  });

  it.each([
    ["menu", {}, "3", "language"],
    ["who", {}, "9", "menu"],
    ["barber", { who: "boy", children: 1 }, "5", "children"],
    ["barber", { who: "adults", adults: 1 }, "5", "adults"],
    ["barber", { who: "family", adults: 1, children: 1 }, "5", "children"],
    ["date", {}, "9", "barber"],
  ] as const)("goes back from %s", async (step, extra, choice, previous) => {
    const turn = await advance({ step, language: "en", ...extra }, choice, context, noAi);
    expect(turn.state.step).toBe(previous);
    expect(turn.state).toMatchObject(extra);
  });

  it("goes back from the confirmation to the address, keeping what was entered", async () => {
    const address = { block: "1", street: "1", houseNumber: "1", buildingName: null, avenue: null, floor: null, apartment: null, mapsUrl: null };
    const turn = await advance({ step: "confirm", language: "en", children: 1, date: "2026-10-30", startTime: "16:00", endTime: "18:00", area: context.areas[0]!, address }, "4", context, noAi);
    expect(turn.state).toMatchObject({ step: "address", children: 1, address });
    expect(turn.staff).toBeUndefined();
  });

  it("still changes language from the option before the way back", async () => {
    const atLanguage = await advance({ step: "who", language: "en" }, "8", context, noAi);
    expect(atLanguage.state).toMatchObject({ step: "language", resume: "who" });
    const back = await advance(atLanguage.state, "3", context, noAi);
    expect(back.state).toEqual({ step: "who", language: "en" });
  });

  it("returns from the language list to the menu when opened from the menu", async () => {
    const atLanguage = await advance({ step: "menu", language: "en" }, "3", context, noAi);
    expect((await advance(atLanguage.state, "3", context, noAi)).state).toEqual({ step: "menu", language: "en" });
  });

  it("accepts Arabic digits in the menus", async () => {
    expect((await walk(arabic, "١", "٢", "٣")).state).toMatchObject({ who: "girl", children: 3, step: "barber" });
  });

  it("collects a full request with a typed address and hands it to staff once confirmed", async () => {
    const ask = vi.fn(async () => ({ reply: "", value: { block: "3", street: "5", houseNumber: "12" } }));
    let state = (await walk({ step: "menu", language: "en" }, "1", "1", "2", "1", "1", "16:00-18:00", "hawally")).state;
    expect(state.step).toBe("address");
    const atConfirm = await advance(state, "block 3 street 5 house 12", context, ask);
    expect(atConfirm.state.step).toBe("confirm");
    expect(atConfirm.reply).toContain("This is a request — our team will confirm the exact time.");
    state = atConfirm.state;
    const sent = await advance(state, "1", context, noAi);
    expect(sent.staff).toMatchObject({ type: "new_request", details: { language: "en", who: "boy", adults: 0, children: 2, specialChildren: 0, barberId: "b1", barberName: "Lenny", date: "2026-10-30", startTime: "16:00", endTime: "18:00", areaId: "a1", area: "Hawally", address: { block: "3", street: "5", houseNumber: "12" } } });
    expect(sent.reply).not.toContain("Select your language");
  });

  it("opens the whole flow again with the language list after a finished request", async () => {
    const address = { block: "1", street: "1", houseNumber: "1", buildingName: null, avenue: null, floor: null, apartment: null, mapsUrl: null };
    const sent = await advance({ step: "confirm", language: "ar", children: 1, date: "2026-10-30", startTime: "16:00", endTime: "18:00", area: context.areas[0]!, address }, "1", context, noAi);
    const next = await advance(sent.state, "Good evening", context, noAi);
    expect(next.state).toEqual({ step: "language", language: null });
    expect(next.reply).toContain("1. English\n2. العربية");
    expect(next.reply).not.toContain("الرجوع");
    expect((await advance(next.state, "1", context, noAi)).state).toEqual({ step: "menu", language: "en" });
  });

  it("opens the language list again after a change request", async () => {
    const sent = await advance({ step: "change", language: "en" }, "Cancel Sunday please", context, noAi);
    expect((await advance(sent.state, "Hello", context, noAi)).state).toEqual({ step: "language", language: null });
  });

  it("accepts a location link alone and leaves the other address parts for staff", async () => {
    const link = "https://www.google.com/maps?q=29.3,48.0";
    const turn = await walk({ step: "address", language: "en", who: "adults", adults: 1, barber: null, date: "2026-10-30", startTime: "16:00", endTime: "18:00", area: context.areas[0]! }, link);
    expect(turn.state.step).toBe("confirm");
    expect(turn.state.address).toEqual({ block: NOT_PROVIDED, street: NOT_PROVIDED, houseNumber: NOT_PROVIDED, buildingName: null, avenue: null, floor: null, apartment: null, mapsUrl: link });
    expect(turn.reply).toContain("Any barber");
    expect(turn.reply).toContain(link);
  });

  it("refuses a link that is not Google Maps", async () => {
    const turn = await walk({ step: "address", language: "en", area: context.areas[0]! }, "https://evil.example/x");
    expect(turn.state.step).toBe("address");
  });

  it("offers the dashboard's barbers and an any-barber option", async () => {
    const text = render({ step: "barber", language: "en" }, context);
    expect(text).toContain("1. Lenny\n2. Heneer\n3. Any barber\n4. Change language");
  });

  it("marks every child as special needs and asks adults then kids for a family", async () => {
    expect((await walk({ step: "who", language: "en" }, "4", "2")).state).toMatchObject({ who: "special", children: 2, step: "barber" });
    expect((await walk({ step: "who", language: "en" }, "7", "1", "3")).state).toMatchObject({ adults: 1, children: 3, step: "barber" });
  });

  it("repeats the step for a wrong number without calling the AI", async () => {
    const turn = await walk({ step: "menu", language: "en" }, "9");
    expect(turn.state.step).toBe("menu");
    expect(turn.reply).toContain("Please send one of the numbers above.");
  });

  it("refuses a time in the past or outside 20 minutes to 4 hours", async () => {
    const at: WhatsAppFlow = { step: "time", language: "en", date: "2026-10-30" };
    expect((await walk(at, "08:00-09:00")).state.step).toBe("time");
    expect((await walk(at, "16:00-16:10")).state.step).toBe("time");
    expect((await walk(at, "16:00-21:00")).state.step).toBe("time");
    expect((await walk(at, "16:00-18:00")).state.step).toBe("area");
  });

  it("returns to the same step after changing language", async () => {
    const asked = await walk({ step: "barber", language: "en" }, "4");
    expect(asked.state).toMatchObject({ step: "language", resume: "barber" });
    const back = await walk(asked.state, "2");
    expect(back.state).toMatchObject({ step: "barber", language: "ar" });
    expect(back.state.resume).toBeUndefined();
  });

  it("starts over at the language list from the confirm step, and returns to the menu from the word menu", async () => {
    expect((await walk({ step: "confirm", language: "en", date: "2026-10-30", area: context.areas[0]!, address: { block: "1", street: "1", houseNumber: "1", buildingName: null, avenue: null, floor: null, apartment: null, mapsUrl: null }, startTime: "16:00", endTime: "18:00" }, "2")).state).toEqual({ step: "language", language: null });
    expect((await walk({ step: "date", language: "ar", who: "boy" }, "القائمة")).state).toEqual({ step: "menu", language: "ar" });
  });

  it("forwards a change request as written, without the AI", async () => {
    const asked = await walk({ step: "menu", language: "en" }, "2");
    const sent = await walk(asked.state, "Cancel Sunday please");
    expect(sent.staff).toEqual({ type: "change", text: "Cancel Sunday please" });
  });

  it("uses the AI for free text: it answers, forwards, and repeats the menu", async () => {
    const ask = vi.fn(async () => ({ reply: "We will tell staff.", value: null, forward: "Asks about the price" }));
    const turn = await advance({ step: "who", language: "en" }, "how much?", context, ask);
    expect(turn.state.step).toBe("who");
    expect(turn.reply).toMatch(/^We will tell staff\.\n\n👶 Who is this for\?/);
    expect(turn.staff).toEqual({ type: "forward", summary: "Asks about the price" });
  });

  it("checks what the AI read: an invented area or skipped step is not accepted", async () => {
    const invented = vi.fn(async () => ({ reply: "", value: { area: "Riyadh" } }));
    expect((await advance({ step: "area", language: "en" }, "الرياض", context, invented)).state.step).toBe("area");
    const skipped = vi.fn(async () => ({ reply: "", value: { choice: 1 } }));
    expect((await advance({ step: "confirm", language: "en", date: "2026-10-30", area: context.areas[0]!, address: { block: "1", street: "1", houseNumber: "1", buildingName: null, avenue: null, floor: null, apartment: null, mapsUrl: null }, startTime: "16:00", endTime: "18:00" }, "ok send it", context, skipped)).staff?.type).toBe("new_request");
    const count = vi.fn(async () => ({ reply: "", value: { count: 99 } }));
    expect((await advance({ step: "children", language: "en" }, "lots", context, count)).state.step).toBe("children");
  });
});
