import { ADDRESS_NOT_PROVIDED } from "@just4kids/contracts";

type AddressLike = {
  area: string; block: string; street: string; houseNumber: string | null; buildingName: string | null;
  avenue?: string | null; gate?: string | null; blueNumber?: string | null;
  floor: string | null; apartment: string | null; mapsUrl: string | null;
};

/** One-line Kuwaiti address: area, block, street, then house or building details. */
export function formatAddress(address: AddressLike): string {
  const shown = (value: string | null | undefined) => value && value !== ADDRESS_NOT_PROVIDED ? value : null;
  return [
    address.area,
    shown(address.block) ? `Block ${address.block}` : null,
    shown(address.street) ? `Street ${address.street}` : null,
    shown(address.houseNumber) ? `House ${address.houseNumber}` : null,
    shown(address.buildingName) ? `Building ${address.buildingName}` : null,
    shown(address.floor) ? `Floor ${address.floor}` : null,
    shown(address.apartment) ? `Apartment ${address.apartment}` : null,
    shown(address.avenue) ? `Avenue ${address.avenue}` : null,
    shown(address.gate) ? `Gate ${address.gate}` : null,
    shown(address.blueNumber) ? `Blue number ${address.blueNumber}` : null,
  ].filter(Boolean).join(", ");
}

/** A link that opens the visit location: the saved Google Maps link. */
export function mapLink(address: AddressLike): string | null {
  if (address.mapsUrl) return address.mapsUrl;
  return null;
}
