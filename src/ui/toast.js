const toastEl = document.createElement('div');
toastEl.className = 'toast';
document.body.appendChild(toastEl);

let _hideTimer = null;

/**
 * Show a brief toast message.
 * @param {string} message
 * @param {number} [duration=2000]
 */
export function toast(message, duration = 2000) {
  toastEl.textContent = message;
  toastEl.classList.add('toast-visible');
  if (_hideTimer) clearTimeout(_hideTimer);
  _hideTimer = setTimeout(() => {
    toastEl.classList.remove('toast-visible');
  }, duration);
}
