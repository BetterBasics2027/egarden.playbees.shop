// Site configuration. Edit and push; no build step.
window.EG_CONFIG = {
  // Google Apps Script web-app URL from intake/README.md. Every order request is POSTed
  // here; if the phone is offline the request is saved locally and re-sent automatically.
  ORDER_ENDPOINT: "https://script.google.com/macros/s/AKfycbwn4UM7Od2gKICHANIVuV0n_y54vwpAr8ynnaTG7G8WsHGoZzofkJ7DMiIbCb0TLR-jQw/exec",

  // Customer-facing contact (printed on the catalog; confirmed 2026-09-11).
  CONTACT: {
    name: "Zolly Friedman",
    title: "eGarden Division Head of Sales & Marketing",
    phone: "845-774-5084",
    email: "abc@zollyfriedman.com",
  },

  SITE: "egarden.playbees.shop",
};
