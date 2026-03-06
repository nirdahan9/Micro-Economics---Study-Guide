// ── App Version ───────────────────────────────────────────────────
// Update APP_VERSION with every change so users can confirm they see the latest.
const APP_VERSION = '1.47';

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.app-version-footer').forEach(function (el) {
    el.textContent = 'גרסה ' + APP_VERSION;
  });
});
