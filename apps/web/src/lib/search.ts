/** True when the name contains the search text, ignoring capital letters and surrounding spaces. */
export function matchesSearch(name: string, search: string): boolean {
  return name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
}
