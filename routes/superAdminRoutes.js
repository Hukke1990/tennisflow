const express = require('express');
const router = express.Router();
const { crearClubConAdmin } = require('../controllers/superAdminController');
const { requireAuth, requireRole } = require('../middlewares/auth');

router.post('/clubes', requireAuth, requireRole(['super_admin']), crearClubConAdmin);

module.exports = router;
