type AddressLike = {
  area: string; block: string; street: string; houseNumber: string | null; buildingName: string | null;
  avenue?: string | null; gate?: string | null; blueNumber?: string | null;
  floor: string | null; apartment: string | null; mapsUrl: string | null;
};

/** One-line Kuwaiti address: area, block, street, then house or building details. */
export function formatAddress(address: AddressLike): string {
  return [
    address.area,
    `Block ${address.block}`,
    `Street ${address.street}`,
    address.houseNumber ? `House ${address.houseNumber}` : null,
    address.buildingName ? `Building ${address.buildingName}` : null,
    address.floor ? `Floor ${address.floor}` : null,
    address.apartment ? `Apartment ${address.apartment}` : null,
    address.avenue ? `Avenue ${address.avenue}` : null,
    address.gate ? `Gate ${address.gate}` : null,
    address.blueNumber ? `Blue number ${address.blueNumber}` : null,
  ].filter(Boolean).join(", ");
}

/** A link that opens the visit location: the saved Google Maps link. */
export function mapLink(address: AddressLike): string | null {
  if (address.mapsUrl) return address.mapsUrl;
  return null;
}
