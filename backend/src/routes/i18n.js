/**
 * i18n routes — expose the active language configuration to the frontend.
 * Public (no auth): the runtime language selector must work before login.
 */
const express = require('express');
const { activeLanguages, defaultLanguage } = require('../i18n/languages');

const router = express.Router();

// GET /api/i18n/config — active languages (ordered) + default code.
router.get('/config', (req, res) => {
  res.json({
    languages: activeLanguages(),
    default: defaultLanguage(),
  });
});

module.exports = router;
