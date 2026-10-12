type AddressLike = {
  area: string; block: string; street: string; houseNumber: string | null; buildingName: string | null;
  avenue?: string | null; gate?: string | null; blueNumber?: string | null;
  floor: string | null; apartment: string | null; instructions?: string | null; mapsUrl: string | null; latitude: string | null; longitude: string | null;
};

/** One-line Kuwaiti address: area, block, street, then house or building details. */
export function formatAddress(address: AddressLike): string {
  return [
    address.area,
    `قطعة ${address.block}`,
    `شارع ${address.street}`,
    address.houseNumber ? `منزل ${address.houseNumber}` : null,
    address.buildingName ? `مبنى ${address.buildingName}` : null,
    address.floor ? `الدور ${address.floor}` : null,
    address.apartment ? `شقة ${address.apartment}` : null,
    address.avenue ? `جادة ${address.avenue}` : null,
    address.gate ? `بوابة ${address.gate}` : null,
    address.blueNumber ? `الرقم الأزرق ${address.blueNumber}` : null,
  ].filter(Boolean).join("، ");
}

/** A link that opens the visit location: the saved Google Maps link, otherwise the WhatsApp pin coordinates. */
export function mapLink(address: AddressLike): string | null {
  if (address.mapsUrl) return address.mapsUrl;
  if (address.latitude && address.longitude) return `https://www.google.com/maps?q=${address.latitude},${address.longitude}`;
  return null;
}
