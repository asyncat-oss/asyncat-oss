import express from 'express';
import { auth } from '../users/middleware/auth.js';
import { getStorageSummary } from './storageService.js';

const router = express.Router();

router.use(auth);

router.get('/summary', (req, res) => {
  try {
    res.json(getStorageSummary());
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to load storage summary',
    });
  }
});

export default router;
