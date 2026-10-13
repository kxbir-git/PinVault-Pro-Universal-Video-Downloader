import { Router } from 'express';
export const router = Router();
router.post('/stripe', (req, res) => { res.send('ok'); });
export default router;
