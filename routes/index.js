const express = require('express');
const router = express.Router();

router.get('/', (req, res, next) => {
  res.json({ title: 'The Glorious Contextubot' });
});

module.exports = router;
