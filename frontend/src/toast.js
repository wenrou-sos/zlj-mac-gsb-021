import { reactive } from 'vue';

let idSeq = 0;
export const toastState = reactive({ items: [] });

export function toast(message, type = 'success') {
  const id = ++idSeq;
  toastState.items.push({ id, message, type });
  setTimeout(() => {
    const idx = toastState.items.findIndex((t) => t.id === id);
    if (idx !== -1) toastState.items.splice(idx, 1);
  }, 3800);
}
