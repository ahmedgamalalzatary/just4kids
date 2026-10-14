/** Reserve a tab during the user's click, then navigate it only after the send is recorded. */
export async function sendLoggedWhatsApp(url: string, record: () => Promise<unknown>) {
  const tab = window.open("about:blank", "_blank");
  if (!tab) throw new Error("تعذر فتح واتساب. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى.");
  // Keep access to the blank tab for navigation without exposing the originating page to WhatsApp.
  tab.opener = null;
  try {
    await record();
    if (tab.closed) throw new Error("أُغلقت نافذة واتساب. حاول الإرسال مرة أخرى.");
    tab.location.replace(url);
  } catch (error) {
    tab.close();
    throw error;
  }
}
