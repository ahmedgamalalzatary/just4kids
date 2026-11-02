import { describe, expect, it, vi } from "vitest";
import type { WhatsAppFlow } from "@just4kids/db/schema";
import { advance, NOT_PROVIDED, render, stepInstructions } from "../src/modules/whatsapp/flow.js";
import type { FlowContext } from "../src/modules/whatsapp/flow.js";

const barber = { id: "b1", name: "Lenny" };
// 12:00 in Kuwait on 30 October. Lenny's 10:00 has passed and 18:00 is taken; Heneer has no free time.
const context: FlowContext = {
  barbers: [barber, { id: "b2", name: "Heneer" }], areas: [{ id: "a1", name: "Hawally" }], now: new Date("2026-10-30T09:00:00.000Z"),
  free: { b1: { "2026-10-30": ["10:00", "16:00", "17:00", "19:00", "20:00", "21:00", "22:00"], "2026-11-01": ["09:00"], "2026-11-05": ["11:00"], "2026-11-06": ["11:00"] } },
};
const noAi = vi.fn(async () => { throw new Error("the AI must not be called"); });
const walk = async (state: WhatsAppFlow | null, ...inputs: string[]) => {
  let current = state, last;
  for (const input of inputs) { last = await advance(current, input, context, noAi); current = last.state; }
  return last!;
};
const arabic: WhatsAppFlow = { step: "menu", language: "ar" };
const address = { block: "1", street: "1", houseNumber: "1", buildingName: null, avenue: null, floor: null, apartment: null, mapsUrl: null };
const chosen = { barber, date: "2026-10-30", startTime: "16:00", endTime: "17:00" };
const atConfirm: WhatsAppFlow = { step: "confirm", language: "en", who: "boy", children: 1, ...chosen, extra: null, area: context.areas[0]!, address };

describe("WhatsApp flow", () => {
  it("always opens with the language menu, whatever the first message says", async () => {
    const turn = await advance(null, "ابي احجز", context, noAi);
    expect(turn.state.step).toBe("language");
    expect(turn.reply).toContain("1. English\n2. العربية");
  });

  it("puts the home service price list second, the salon location third and change language last in the main menu", async () => {
    const turn = await walk({ step: "language", language: null }, "2");
    expect(turn.reply).toContain("✅ اللغة: العربية");
    expect(turn.reply).toContain("1. حجز موعد\n2. قائمة أسعار الخدمة المنزلية\n3. موقع الصالون\n4. قائمة أسعار الصالون\n5. التحدث مع موظف\n6. إلغاء أو تعديل طلب\n7. الرجوع للخطوة السابقة\n8. Change language / تغيير اللغة");
    expect(render({ step: "menu", language: "en" }, context)).toContain("2. Home service price list\n");
  });

  it("offers change language only in the main menu", () => {
    const booking = atConfirm;
    for (const step of ["who", "barber", "date", "time", "extra", "confirm"] as const) {
      expect(render({ ...booking, step }, context)).not.toContain("Change language");
    }
  });

  it("ends every other list with a way back, in the client's language", () => {
    const booking = { ...atConfirm, language: "ar" as const };
    for (const step of ["language", "who", "barber", "date", "time", "extra", "confirm"] as const) {
      expect(render({ ...booking, step }, context)).toMatch(/\d+\. الرجوع للخطوة السابقة(\n\n.*)?$/);
    }
    expect(render({ step: "who", language: "en" }, context).split("\n").at(-1)).toMatch(/^\d\. Back to the previous step$/);
  });

  it("offers no way back before a language was ever chosen", () => {
    expect(render({ step: "language", language: null }, context)).not.toContain("الرجوع");
  });

  it.each([
    ["menu", {}, "7", "language"],
    ["who", {}, "6", "menu"],
    ["barber", { who: "boy", children: 1 }, "3", "children"],
    ["barber", { who: "adults", adults: 1 }, "3", "adults"],
    ["barber", { who: "family", adults: 1, children: 1 }, "3", "children"],
    ["date", { barber }, "4", "barber"],
    ["time", { barber, date: "2026-11-01" }, "2", "date"],
    ["extra", { ...chosen }, "7", "time"],
  ] as const)("goes back from %s", async (step, extra, choice, previous) => {
    const turn = await advance({ step, language: "en", ...extra }, choice, context, noAi);
    expect(turn.state.step).toBe(previous);
    expect(turn.state).toMatchObject(extra);
  });

  it("goes back from the confirmation to the address, keeping what was entered", async () => {
    const turn = await advance(atConfirm, "3", context, noAi);
    expect(turn.state).toMatchObject({ step: "address", children: 1, address });
    expect(turn.staff).toBeUndefined();
  });

  it("opens the language list from the last menu option and comes back to the menu", async () => {
    const atLanguage = await advance({ step: "menu", language: "en" }, "8", context, noAi);
    expect(atLanguage.state.step).toBe("language");
    expect((await advance(atLanguage.state, "3", context, noAi)).state).toEqual({ step: "menu", language: "en" });
  });

  it("accepts Arabic digits in the menus", async () => {
    expect((await walk(arabic, "١", "٢", "٣")).state).toMatchObject({ who: "girl", children: 3, step: "barber" });
  });

  it("forces a choice of a named barber", () => {
    const text = render({ step: "barber", language: "en" }, context);
    expect(text).toContain("1. Lenny\n2. Heneer\n3. Back to the previous step");
    expect(text).not.toContain("Any barber");
    expect(render({ step: "barber", language: "ar" }, context)).not.toContain("أي حلاق\n");
  });

  it("asks which barber the client chooses", () => {
    expect(render({ step: "barber", language: "en" }, context)).toContain("Which barber do you choose?");
    expect(render({ step: "barber", language: "ar" }, context)).toContain("أي حلاق تختار؟");
  });

  it("offers only the next 7 days on which the chosen barber is free", async () => {
    const turn = await walk({ step: "barber", language: "en", who: "boy", children: 1 }, "1");
    expect(turn.state).toMatchObject({ step: "date", barber, offered: ["2026-10-30", "2026-11-01", "2026-11-05"] });
    expect(turn.reply).toContain("1. Fri 30 Oct\n2. Sun 1 Nov\n3. Thu 5 Nov\n4. Back to the previous step");
  });

  it("stays on the barber list when that barber has no free time", async () => {
    const turn = await walk({ step: "barber", language: "en", who: "boy", children: 1 }, "2");
    expect(turn.state.step).toBe("barber");
    expect(turn.reply).toContain("no free times in the next 7 days");
    expect(turn.reply).toContain("1. Lenny");
  });

  it("offers only that barber's free future start times", async () => {
    const turn = await walk({ step: "date", language: "en", barber }, "1");
    expect(turn.state).toMatchObject({ step: "time", date: "2026-10-30", offered: ["16:00", "17:00", "19:00", "20:00", "21:00", "22:00"] });
    expect(turn.reply).toContain("1. 4 pm\n2. 5 pm\n3. 7 pm\n4. 8 pm\n5. 9 pm\n6. 10 pm\n7. Back to the previous step");
    expect(turn.reply).not.toContain("10 am");
  });

  it("books one hour from the chosen start time without asking how long", async () => {
    const turn = await walk({ step: "time", language: "en", barber, date: "2026-10-30" }, "6");
    expect(turn.state).toMatchObject({ step: "extra", startTime: "22:00", endTime: "23:00" });
    expect(turn.reply).toContain("Any extra service?");
    expect(turn.reply).not.toContain("How long");
  });

  it("sends a client left on the old how-long question back to the start times", async () => {
    const turn = await advance({ step: "duration", language: "en", barber, date: "2026-10-30", startTime: "16:00", offered: ["17:00"] } as unknown as WhatsAppFlow, "1", context, noAi);
    expect(turn.state).toMatchObject({ step: "time", date: "2026-10-30", offered: ["16:00", "17:00", "19:00", "20:00", "21:00", "22:00"] });
  });

  it("keeps the numbers the client saw, and refuses a time taken since then", async () => {
    const taken = await advance({ step: "time", language: "en", barber, date: "2026-10-30", offered: ["15:00", "16:00"] }, "1", context, noAi);
    expect(taken.state.step).toBe("time");
    expect(taken.reply).toContain("no longer free");
    expect(taken.state.offered).toEqual(["16:00", "17:00", "19:00", "20:00", "21:00", "22:00"]);
    const kept = await advance({ step: "time", language: "en", barber, date: "2026-10-30", offered: ["15:00", "16:00"] }, "2", context, noAi);
    expect(kept.state).toMatchObject({ step: "extra", startTime: "16:00", endTime: "17:00" });
  });

  it("sends a client still on the old any-barber path back to the barber list", async () => {
    for (const step of ["date", "time"] as const) {
      const turn = await advance({ step, language: "en", barber: null, date: "2026-10-30", startTime: "16:00" }, "1", context, noAi);
      expect(turn.state.step).toBe("barber");
    }
  });

  it("refuses a date the AI read outside the offered days", async () => {
    const later = vi.fn(async () => ({ reply: "", value: { date: "2026-11-06" } }));
    expect((await advance({ step: "date", language: "en", barber }, "next Friday", context, later)).state.step).toBe("date");
    const last = vi.fn(async () => ({ reply: "", value: { date: "2026-11-05" } }));
    expect((await advance({ step: "date", language: "en", barber }, "Thursday", context, last)).state).toMatchObject({ step: "time", date: "2026-11-05" });
  });

  it("no longer accepts a typed time window", async () => {
    const ask = vi.fn(async () => ({ reply: "Please choose a number.", value: { startTime: "19:00", endTime: "20:00" } }));
    const turn = await advance({ step: "time", language: "en", barber, date: "2026-10-30" }, "19:00-20:00", context, ask);
    expect(ask).toHaveBeenCalled();
    expect(turn.state.step).toBe("time");
  });

  it("offers exactly the extra services", () => {
    expect(render({ step: "extra", language: "en" }, context)).toBe("💅 Any extra service?\n\n1. Manicure + Pedicure\n2. Manicure only\n3. Pedicure only\n4. Hair wash only\n5. Hair wash with treatment\n6. No service\n7. Back to the previous step");
    expect(render({ step: "extra", language: "ar" }, context)).toContain("1. مانيكير + باديكير\n2. مانيكير فقط\n3. باديكير فقط\n4. غسيل شعر فقط\n5. غسيل شعر مع علاج\n6. بدون خدمة");
  });

  it("collects a full request and hands it to staff once confirmed", async () => {
    const ask = vi.fn(async () => ({ reply: "", value: { block: "3", street: "5", houseNumber: "12" } }));
    const typed = (await walk({ step: "menu", language: "en" }, "1", "1", "2", "1", "1", "1", "4", "hawally")).state;
    expect(typed.step).toBe("address");
    const confirm = await advance(typed, "block 3 street 5 house 12", context, ask);
    expect(confirm.state.step).toBe("confirm");
    expect(confirm.reply).toContain("Hair wash only");
    expect(confirm.reply).toContain("This is a request — our team will confirm the exact time.");
    const sent = await advance(confirm.state, "1", context, noAi);
    expect(sent.staff).toMatchObject({ type: "new_request", details: { language: "en", who: "boy", adults: 0, children: 2, specialChildren: 0, barberId: "b1", barberName: "Lenny", date: "2026-10-30", startTime: "16:00", endTime: "17:00", extra: "hair_wash", areaId: "a1", area: "Hawally", address: { block: "3", street: "5", houseNumber: "12" } } });
    expect(sent.reply).not.toContain("Select your language");
  });

  it("records no extra service for the no-service choice", async () => {
    const turn = await walk({ step: "extra", language: "en", ...chosen }, "6");
    expect(turn.state).toMatchObject({ step: "area", extra: null });
    const confirm = await walk({ ...atConfirm, step: "address" }, "https://www.google.com/maps?q=29.3,48.0");
    expect(confirm.reply).not.toContain("Extra service");
  });

  it("opens the whole flow again with the language list after a finished request", async () => {
    const sent = await advance({ ...atConfirm, language: "ar" }, "1", context, noAi);
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
    const turn = await walk({ step: "address", language: "en", who: "adults", adults: 1, ...chosen, area: context.areas[0]! }, link);
    expect(turn.state.step).toBe("confirm");
    expect(turn.state.address).toEqual({ block: NOT_PROVIDED, street: NOT_PROVIDED, houseNumber: NOT_PROVIDED, buildingName: null, avenue: null, floor: null, apartment: null, mapsUrl: link });
    expect(turn.reply).toContain(link);
  });

  it("refuses a link that is not Google Maps", async () => {
    const turn = await walk({ step: "address", language: "en", area: context.areas[0]! }, "https://evil.example/x");
    expect(turn.state.step).toBe("address");
  });

  it("marks every child as special needs, and lets a client already asked about adults finish", async () => {
    expect((await walk({ step: "who", language: "en" }, "4", "2")).state).toMatchObject({ who: "special", children: 2, step: "barber" });
    expect((await walk({ step: "adults", language: "en", who: "family" }, "1", "3")).state).toMatchObject({ adults: 1, children: 3, step: "barber" });
  });

  it("no longer offers adults in the who list", () => {
    expect(render({ step: "who", language: "en" }, context)).toBe("👶 Who is this for?\n\n1. Boy\n2. Girl\n3. Baby\n4. Special needs\n5. Both (Girl & Boy)\n6. Back to the previous step");
    expect(render({ step: "who", language: "ar" }, context)).not.toContain("كبار");
  });

  it("asks for the written address first and a Google Maps link only if the client cannot", () => {
    const text = render({ step: "address", language: "en" }, context);
    expect(text).toBe("📍 Please write your address (block, street, house or building). If you can't, send a Google Maps link.");
  });

  it("stops the AI and tells staff when the client asks for an employee", async () => {
    const turn = await walk({ step: "menu", language: "en" }, "5");
    expect(turn).toMatchObject({ pause: true, staff: { type: "talk" }, state: { step: "menu", language: null } });
    expect(turn.reply).toContain("An employee will contact you soon.");
  });

  it.each([["2", "price_list", "Home service price list"], ["4", "salon_price_list", "Salon price list"]])("sends the price list photo for option %s and shows the menu again", async (choice, media, caption) => {
    const turn = await walk({ step: "menu", language: "en" }, choice);
    expect(turn.image).toEqual({ media, caption });
    expect(turn.state).toEqual({ step: "menu", language: "en" });
    expect(turn.reply).toContain("1. Book an appointment");
  });

  it("sends the salon location and shows the menu again", async () => {
    const turn = await walk({ step: "menu", language: "en" }, "3");
    expect(turn.reply).toContain("https://maps.google.com/maps?q=29.086143493652344%2C48.121238708496094&z=17&hl=en");
    expect(turn.reply).toContain("1. Book an appointment");
    expect(turn.image).toBeUndefined();
  });

  it("tells the AI to point price questions to the new menu options", () => {
    const rules = stepInstructions({ step: "who", language: "en" }, context);
    expect(rules).toContain("When the client asks about prices, do not forward.");
    expect(rules).toContain("options 2 and 4 of the main menu");
    expect(rules).not.toContain("asks about prices, confirmation");
  });

  it("repeats the step for a wrong number without calling the AI", async () => {
    const turn = await walk({ step: "menu", language: "en" }, "9");
    expect(turn.state.step).toBe("menu");
    expect(turn.reply).toContain("Please send one of the numbers above.");
  });

  it("starts over at the language list from the confirm step, and returns to the menu from the word menu", async () => {
    expect((await walk(atConfirm, "2")).state).toEqual({ step: "language", language: null });
    expect((await walk({ step: "date", language: "ar", who: "boy" }, "القائمة")).state).toEqual({ step: "menu", language: "ar" });
  });

  it("forwards a change request as written, without the AI", async () => {
    const asked = await walk({ step: "menu", language: "en" }, "6");
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
    expect((await advance(atConfirm, "ok send it", context, skipped)).staff?.type).toBe("new_request");
    const count = vi.fn(async () => ({ reply: "", value: { count: 99 } }));
    expect((await advance({ step: "children", language: "en" }, "lots", context, count)).state.step).toBe("children");
  });
});
