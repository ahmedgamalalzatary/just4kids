/** Reserve a tab during the user's click, then navigate it only after the send is recorded. The URL may be computed after the record runs (for example once a new reservation exists). */
export async function sendLoggedWhatsApp(target: string | (() => string), record: () => Promise<unknown>) {
  const tab = window.open("about:blank", "_blank");
  if (!tab) throw new Error("Could not open WhatsApp. Allow pop-ups and try again.");
  // Keep access to the blank tab for navigation without exposing the originating page to WhatsApp.
  tab.opener = null;
  try {
    await record();
    if (tab.closed) throw new Error("The WhatsApp window was closed. Try sending again.");
    tab.location.replace(typeof target === "function" ? target() : target);
  } catch (error) {
    tab.close();
    throw error;
  }
}
