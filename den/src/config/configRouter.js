// config/configRouter.js — server config API routes
import express from 'express';
import { auth } from '../users/middleware/auth.js';
import { getConfig, updateConfig, getSecrets, updateSecret } from './configController.js';

const router = express.Router();

router.use(auth);

router.get('/', getConfig);
router.put('/', updateConfig);
router.get('/secrets', getSecrets);
router.put('/secrets', updateSecret);

export default router;