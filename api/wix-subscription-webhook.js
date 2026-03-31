// api/wix-subscription-webhook.js — Handles Wix Pricing Plans order events
// Uses Firebase REST API (no Admin SDK needed — just FIREBASE_DB_SECRET env var)
//
// Setup:
// 1. Get your database secret from Firebase Console → Project Settings → Service accounts → Database secrets
// 2. Set Vercel env vars: FIREBASE_DB_SECRET=<your secret>, WIX_WEBHOOK_SECRET=<shared secret>
// 3. Set up Wix Automation to POST to https://dnd-sable-seven.vercel.app/api/wix-subscription-webhook

import crypto from 'crypto';

const DB_URL = 'https://dnd-dice-room-default-rtdb.firebaseio.com';
const DB_SECRET = process.env.FIREBASE_DB_SECRET || '';
const WEBHOOK_SECRET = process.env.WIX_WEBHOOK_SECRET || '';

const PLAN_TIER_MAP = {
  'fa255208-eb22-4cca-aa0e-bfc143e6b1c3': 'dm',       // DM Monthly
  'f5ff7be1-1467-476c-b97f-064790d819f1': 'dm',       // DM Yearly
  '4a2d50ef-684f-4ebc-bf6d-d5620299f6c2': 'founder',  // Founder Pack
};

const PLAN_TYPE_MAP = {
  'fa255208-eb22-4cca-aa0e-bfc143e6b1c3': 'monthly',
  'f5ff7be1-1467-476c-b97f-064790d819f1': 'yearly',
  '4a2d50ef-684f-4ebc-bf6d-d5620299f6c2': 'lifetime',
};

const FOUNDER_CAP = 200;
const GRACE_PERIOD_DAYS = 7;

// ── Firebase REST helpers ──────────────────────────────────────────────
async function fbGet(path) {
  const r = await fetch(`${DB_URL}/${path}.json?auth=${DB_SECRET}`);
  return r.json();
}

async function fbSet(path, data) {
  await fetch(`${DB_URL}/${path}.json?auth=${DB_SECRET}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function fbUpdate(path, data) {
  await fetch(`${DB_URL}/${path}.json?auth=${DB_SECRET}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function fbPush(path, data) {
  await fetch(`${DB_URL}/${path}.json?auth=${DB_SECRET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/**
 * Atomic increment using Firebase conditional request (ETag).
 * Retries up to 5 times on conflict. Returns the new value or null on failure.
 */
async function fbAtomicIncrement(path, cap) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const getRes = await fetch(`${DB_URL}/${path}.json?auth=${DB_SECRET}`, {
      headers: { 'X-Firebase-ETag': 'true' },
    });
    const etag = getRes.headers.get('ETag');
    const current = (await getRes.json()) || 0;
    if (cap !== undefined && current >= cap) return null; // cap exceeded
    const putRes = await fetch(`${DB_URL}/${path}.json?auth=${DB_SECRET}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'if-match': etag,
      },
      body: JSON.stringify(current + 1),
    });
    if (putRes.ok) return current + 1;
    // 412 = precondition failed (concurrent write) — retry
    if (putRes.status !== 412) return null;
  }
  return null; // exhausted retries
}

// ── Email-to-UID lookup (uses index, falls back to scan) ──────────────
function sanitizeEmailKey(email) {
  return email.toLowerCase().replace(/[.#$\[\]/]/g, '_');
}

async function findUidByEmail(email) {
  if (!email) return null;
  const emailKey = sanitizeEmailKey(email);

  // Try fast index lookup first
  const indexed = await fbGet(`admin/emailIndex/${emailKey}`);
  if (indexed) return indexed;

  // Fallback: scan users/ (O(n) — will be phased out as index populates)
  const users = await fbGet('users');
  if (!users) return null;
  const lowerEmail = email.toLowerCase();
  for (const [uid, data] of Object.entries(users)) {
    const userEmail = (data?.email || data?.profile?.email || '').toLowerCase();
    if (userEmail === lowerEmail) {
      // Backfill index for future lookups
      await fbSet(`admin/emailIndex/${emailKey}`, uid);
      return uid;
    }
  }
  return null;
}

// ── Webhook signature verification ────────────────────────────────────
function verifySignature(req) {
  if (!WEBHOOK_SECRET) return true; // Skip if secret not configured (dev mode)
  const signature = req.headers['x-wix-signature'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!signature) return false;

  // Try HMAC verification first
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  if (crypto.timingSafeEqual?.(Buffer.from(signature), Buffer.from(expected))) return true;

  // Fallback: Bearer token match (for Make.com relay which uses simple token)
  if (signature === WEBHOOK_SECRET) return true;

  return false;
}

// ── Idempotency check ─────────────────────────────────────────────────
async function isDuplicate(orderId) {
  if (!orderId || orderId.startsWith('wix-')) return false; // Generated IDs are always new
  const existing = await fbGet(`admin/processedOrders/${sanitizeEmailKey(orderId)}`);
  return !!existing;
}

async function markProcessed(orderId) {
  if (!orderId || orderId.startsWith('wix-')) return;
  await fbSet(`admin/processedOrders/${sanitizeEmailKey(orderId)}`, Date.now());
}

// ── Main handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!DB_SECRET) {
    console.error('FIREBASE_DB_SECRET not set');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  // Verify webhook signature
  if (!verifySignature(req)) {
    console.warn('Webhook signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    const event = req.body;

    // Extract order data — Wix Automations send varying structures
    const order = event?.data?.order || event?.order || event?.data || event || {};
    const eventType = event?.data?.eventType || event?.eventType || event?.type || 'purchase';

    const planId = order?.planId || order?.plan?.id || '';
    const buyerEmail = order?.buyer?.email || order?.buyerInfo?.email
      || order?.contact?.email || order?.email || '';
    const buyerMemberId = order?.buyer?.memberId || order?.buyerInfo?.memberId || '';
    const orderId = order?._id || order?.id || `wix-${Date.now()}`;

    // Idempotency check — skip if already processed
    if (await isDuplicate(orderId)) {
      return res.status(200).json({ status: 'duplicate', orderId });
    }

    // Log every webhook
    await fbPush('admin/webhookLog', {
      source: 'wix',
      eventType,
      orderId,
      planId,
      buyerEmail: buyerEmail || '',
      buyerMemberId,
      receivedAt: Date.now(),
      raw: JSON.stringify(event).slice(0, 2000),
    });

    // Determine tier
    const tier = PLAN_TIER_MAP[planId];
    if (!tier) {
      return res.status(200).json({ status: 'ignored', reason: `unknown plan: ${planId}` });
    }

    // Find Firebase user by email
    const firebaseUid = await findUidByEmail(buyerEmail);

    if (!firebaseUid) {
      // Store for manual activation
      await fbSet(`admin/pendingActivations/${orderId}`, {
        email: buyerEmail || 'unknown',
        memberId: buyerMemberId,
        planId,
        tier,
        plan: PLAN_TYPE_MAP[planId],
        createdAt: Date.now(),
      });
      return res.status(200).json({
        status: 'pending',
        reason: buyerEmail
          ? `No Firebase user found for ${buyerEmail}`
          : 'No email in webhook payload',
      });
    }

    // Handle cancellation
    if (eventType.includes('cancel') || eventType.includes('ended')) {
      const currentSub = await fbGet(`users/${firebaseUid}/subscription`);
      const periodEnd = currentSub?.currentPeriodEnd || Date.now();
      const gracePeriodEnd = periodEnd + (GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
      await fbUpdate(`users/${firebaseUid}/subscription`, {
        status: 'cancelled',
        cancelledAt: Date.now(),
        previousTier: tier,
        gracePeriodEnd,
      });
      await markProcessed(orderId);
      return res.status(200).json({ status: 'ok', action: 'downgraded', uid: firebaseUid });
    }

    // Activate subscription
    const now = Date.now();
    const sub = {
      tier,
      status: 'active',
      plan: PLAN_TYPE_MAP[planId],
      wixOrderId: orderId,
      wixPlanId: planId,
      activatedAt: now,
      buyerEmail,
    };

    if (sub.plan === 'monthly') {
      sub.currentPeriodEnd = now + 30 * 24 * 60 * 60 * 1000;
      sub.gracePeriodEnd = sub.currentPeriodEnd + (GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    } else if (sub.plan === 'yearly') {
      sub.currentPeriodEnd = now + 365 * 24 * 60 * 60 * 1000;
      sub.gracePeriodEnd = sub.currentPeriodEnd + (GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    } else if (sub.plan === 'lifetime') {
      sub.currentPeriodEnd = 0;
      sub.gracePeriodEnd = 0;
      // Founder cap — atomic increment with race condition protection
      const newCount = await fbAtomicIncrement('admin/founderCount', FOUNDER_CAP);
      if (newCount === null) {
        return res.status(200).json({ status: 'rejected', reason: 'founder cap reached' });
      }
    }

    await fbSet(`users/${firebaseUid}/subscription`, sub);
    await markProcessed(orderId);

    return res.status(200).json({ status: 'ok', action: 'activated', tier, uid: firebaseUid });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
