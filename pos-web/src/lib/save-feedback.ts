export const DATA_SAVED_EVENT = "pos:data-saved";

export function notifyDataSaved(message = "Data berhasil disimpan.") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DATA_SAVED_EVENT, { detail: { message } }));
}
