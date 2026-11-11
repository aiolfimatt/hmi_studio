/**
 * Which widget props hold translatable text, per widget type. This MUST mirror
 * the frontend authority at frontend/src/i18n/resolve.js (TRANSLATABLE_PROPS);
 * keep the two in sync when adding a widget or a text prop. The backend needs
 * its own copy so the CSV text export/import (routes/textio.js) knows which
 * props to pull out of / write back into page definitions.
 */
const TRANSLATABLE_PROPS = {
  label:         ['text'],
  entry:         ['label'],
  graph:         ['label'],
  io:            ['label'],
  button:        ['label'],
  toggle_button: ['label', 'labelOn', 'labelOff'],
  event_box:     ['label'],
  batch_panel:   ['title', 'newLabel', 'closeLabel'],
};

module.exports = { TRANSLATABLE_PROPS };
