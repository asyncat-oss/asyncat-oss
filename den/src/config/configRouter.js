// config/configRouter.js — server config API routes
import express from 'express';
import { getConfig, updateConfig, getSecrets, updateSecret } from './configController.js';

const router = express.Router();

router.get('/', getConfig);
router.put('/', updateConfig);
router.get('/secrets', getSecrets);
router.put('/secrets', updateSecret);

export default router;
