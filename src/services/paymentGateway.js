// The ONLY file that knows about Razorpay. Everything else calls these functions, so the
// gateway can be stubbed in tests or swapped for another provider without touching routes.
const crypto = require('crypto');

let razorpay;
function getClient() {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw Object.assign(new Error('Online payments are not set up on the server yet'), { status: 503 });
  }
  if (!razorpay) {
    const Razorpay = require('razorpay'); // loaded lazily so the app still starts without it
    razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  }
  return razorpay;
}

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
const safeEqual = (a, b) => {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

async function createOrder({ amount, receipt, notes }) {
  try {
    const order = await getClient().orders.create({ amount, currency: 'INR', receipt, notes });
    return { id: order.id, amount: order.amount, currency: order.currency };
  } catch (err) {
    if (err.status === 503) throw err;
    console.error('Razorpay order creation failed:', err.error || err.message || err);
    throw Object.assign(new Error('Could not start the payment. Please try again.'), { status: 502 });
  }
}

const refundPayment = (gatewayPaymentId) => getClient().payments.refund(gatewayPaymentId, {});

// Proves the browser callback really came from Razorpay (the secret never leaves the server).
function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (!process.env.RAZORPAY_KEY_SECRET || !orderId || !paymentId || !signature) return false;
  return safeEqual(hmac(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);
}

// rawBody must be the exact bytes Razorpay sent, not re-serialised JSON.
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  return safeEqual(hmac(secret, rawBody), signature);
}

const publicKeyId = () => process.env.RAZORPAY_KEY_ID;
const isConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

module.exports = { createOrder, refundPayment, verifyCheckoutSignature, verifyWebhookSignature, publicKeyId, isConfigured };
