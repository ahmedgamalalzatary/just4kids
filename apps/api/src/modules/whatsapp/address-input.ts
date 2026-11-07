import { ADDRESS_NOT_PROVIDED } from "@just4kids/contracts";
import type { WhatsAppAddress } from "@just4kids/db/schema";

export const homeLabels = {
  block: "block", قطعة: "block", القطعة: "block", street: "street", شارع: "street", الشارع: "street",
  house: "houseNumber", "house number": "houseNumber", منزل: "houseNumber", المنزل: "houseNumber", بيت: "houseNumber",
  building: "buildingName", "building name": "buildingName", بناية: "buildingName", البناية: "buildingName", عمارة: "buildingName",
  avenue: "avenue", جادة: "avenue", الجادة: "avenue", floor: "floor", دور: "floor", الدور: "floor", طابق: "floor", الطابق: "floor",
  apartment: "apartment", flat: "apartment", شقة: "apartment", الشقة: "apartment",
  gate: "gate", g: "gate", بوابة: "gate", البوابة: "gate", مدخل: "gate", المدخل: "gate",
  "blue number": "blueNumber", "blue no": "blueNumber", "رقم آلي": "blueNumber", "الرقم الآلي": "blueNumber", "رقم الي": "blueNumber", "الرقم الالي": "blueNumber", "الرقم الأزرق": "blueNumber",
} as const;
export const hospitalLabels = { wing: "wing", جناح: "wing", الجناح: "wing", floor: "floor", دور: "floor", الدور: "floor", طابق: "floor", الطابق: "floor", room: "room", غرفة: "room", الغرفة: "room" } as const;

/** Read explicit labels in any order. Unlabeled or ambiguous text stays with the free-text interpreter. */
export function parseLabeledParts<Key extends string>(raw: string, labels: Record<string, Key>): Partial<Record<Key, string>> | null {
  const text = raw.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).trim();
  const names = Object.keys(labels).sort((a, b) => b.length - a.length).map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const matches = [...text.matchAll(new RegExp(`(?:^|[\\s,،;؛])(${names.join("|")})(?=\\s|:)[\\s:]*`, "gi"))];
  if (!matches.length || text.slice(0, matches[0]!.index).trim()) return null;
  const parts: Partial<Record<Key, string>> = {};
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]!;
    const value = text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length).replace(/^[\s,،;؛]+|[\s,،;؛]+$/g, "");
    const key = labels[match[1]!.toLowerCase()]!;
    if (!value || /[,،;؛\n]/.test(value) || (parts[key] !== undefined && parts[key] !== value)) return null;
    parts[key] = value;
  }
  return parts;
}

/** All supplied details are visible in the client confirmation and staff hand-off. */
export function addressText(address: WhatsAppAddress, language: "en" | "ar") {
  const labels = language === "ar"
    ? ["قطعة", "شارع", "منزل", "بناية", "جادة", "دور", "شقة", "بوابة", "الرقم الآلي"]
    : ["Block", "Street", "House", "Building", "Avenue", "Floor", "Apartment", "Gate", "Blue number"];
  const values = [address.block, address.street, address.houseNumber, address.buildingName, address.avenue, address.floor, address.apartment, address.gate, address.blueNumber];
  return values.flatMap((value, index) => value && value !== ADDRESS_NOT_PROVIDED ? [`${labels[index]} ${value}`] : []).join(language === "ar" ? "، " : ", ");
}
