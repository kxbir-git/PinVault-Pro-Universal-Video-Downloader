import { Router, Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { authenticate } from '../middleware/auth';
import { queryOne, query } from '../db/connection';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import type { User, Subscription } from '../types';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' as any });

// ── Get current subscription ──────────────────────────
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as User;
    const sub = await queryOne<Subscription>(
      `SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [user.id],
    );
    res.json({ success: true, data: sub || { tier: 'free', status: 'active' } });
  } catch (err) { next(err); }
});

// ── Create checkout session ───────────────────────────
router.post('/checkout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as User;
    const { plan } = req.body; // 'monthly' | 'yearly'

    const priceId = plan === 'yearly'
      ? process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID
      : process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID;

    if (!priceId) throw new AppError('Price not configured', 500);

    // Get or create Stripe customer
    let sub = await queryOne<Subscription>(
      `SELECT * FROM subscriptions WHERE user_id = $1`,
      [user.id],
    );

    let customerId = sub?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL}/dashboard?subscription=success`,
      cancel_url: `${process.env.APP_URL}/pricing?subscription=cancelled`,
      metadata: { userId: user.id },
    });

    res.json({ success: true, data: { checkoutUrl: session.url } });
  } catch (err) { next(err); }
});

// ── Customer portal (manage subscription) ─────────────
router.post('/portal', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as User;
    const sub = await queryOne<Subscription>(
      `SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1`,
      [user.id],
    );
    if (!sub?.stripe_customer_id) throw new AppError('No subscription found', 404);

    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${process.env.APP_URL}/dashboard`,
    });

    res.json({ success: true, data: { portalUrl: portal.url } });
  } catch (err) { next(err); }
});

export default router;
