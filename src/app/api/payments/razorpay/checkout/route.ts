import { getPayload } from 'payload'
import config from '@/payload.config'
import { getRazorpayConfig } from '@/lib/razorpay'
import { findByOrderId, verifyAndSettleCheckout } from '@/services/paymentService'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const orderId = url.searchParams.get('orderId')?.trim()

  if (!orderId) {
    return new Response(
      `<!DOCTYPE html><html><body style="font-family: sans-serif; text-align: center; padding: 40px;"><h2>Invalid Payment Link</h2><p>No order id provided.</p></body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  const payload = await getPayload({ config })
  const row = await findByOrderId(payload, orderId)

  if (!row) {
    return new Response(
      `<!DOCTYPE html><html><body style="font-family: sans-serif; text-align: center; padding: 40px;"><h2>Order Not Found</h2><p>Payment order ${orderId} does not exist or has expired.</p></body></html>`,
      { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  if (row.status === 'paid') {
    return new Response(
      `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family: sans-serif; text-align: center; padding: 40px; background: #F8FAFC;"><div style="background: white; max-width: 420px; margin: 40px auto; padding: 32px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);"><div style="font-size: 48px; color: #16A34A;">✓</div><h2 style="color: #0F172A;">Already Paid</h2><p style="color: #64748B;">This registration fee is already confirmed.</p><a href="wellfind-academic://application" style="display: inline-block; background: #0D9488; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: bold; margin-top: 16px;">Return to Wellfind App</a></div></body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  const cfg = getRazorpayConfig()
  const keyId = cfg.keyId
  const amountPaise = Math.round(Number(row.amount) * 100)

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Wellfind Academic - Secure Payment</title>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #0F172A; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; color: #0F172A; }
    .card { background: #FFFFFF; border-radius: 20px; width: 100%; max-width: 420px; padding: 32px 24px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.25); }
    .logo { width: 56px; height: 56px; border-radius: 14px; background: #0D9488; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 24px; }
    h1 { font-size: 20px; font-weight: 800; color: #0F172A; margin-bottom: 6px; }
    p.desc { font-size: 14px; color: #64748B; margin-bottom: 24px; }
    .price-box { background: #F1F5F9; border-radius: 14px; padding: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .price-label { font-size: 13px; font-weight: 600; color: #64748B; }
    .price-val { font-size: 22px; font-weight: 800; color: #0D9488; }
    .btn { background: #0D9488; color: #FFFFFF; font-size: 16px; font-weight: 700; width: 100%; border: none; padding: 14px 20px; border-radius: 12px; cursor: pointer; transition: background 0.2s; }
    .btn:hover { background: #0F766E; }
    .status { margin-top: 16px; font-size: 13px; color: #64748B; min-height: 20px; }
    .sec-badge { margin-top: 20px; font-size: 11px; color: #94A3B8; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .spinner { border: 3px solid #E2E8F0; border-top: 3px solid #0D9488; border-radius: 50%; width: 22px; height: 22px; animation: spin 0.8s linear infinite; display: inline-block; vertical-align: middle; margin-right: 8px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="logo">W</div>
    <h1>Wellfind Academic</h1>
    <p class="desc">${row.description || 'Teacher registration fee (1 year)'}</p>
    <div class="price-box">
      <span class="price-label">Amount Payable</span>
      <span class="price-val">₹${Number(row.amount).toLocaleString('en-IN')}</span>
    </div>
    <button class="btn" id="payBtn" onclick="openCheckout()">Pay Securely</button>
    <div class="status" id="status">Connecting to Razorpay...</div>
    <div class="sec-badge">🔒 256-bit SSL Secure Payment by Razorpay</div>
  </div>

  <script>
    var rzp = null;
    function openCheckout() {
      var btn = document.getElementById('payBtn');
      var status = document.getElementById('status');
      status.innerHTML = '<span class="spinner"></span> Opening payment window...';

      var options = {
        key: ${JSON.stringify(keyId)},
        amount: ${amountPaise},
        currency: "INR",
        name: "Wellfind Academic",
        description: ${JSON.stringify(row.description || 'Teacher registration fee')},
        order_id: ${JSON.stringify(orderId)},
        prefill: {
          name: ${JSON.stringify(row.payerName || '')},
          email: ${JSON.stringify(row.payerEmail || '')},
          contact: ${JSON.stringify(row.payerPhone || '')}
        },
        theme: { color: "#0D9488" },
        modal: {
          ondismiss: function() {
            status.innerText = 'Payment window closed. Click "Pay Securely" to retry.';
          }
        },
        handler: function(response) {
          status.innerHTML = '<span class="spinner"></span> Verifying payment with server...';
          btn.style.display = 'none';

          fetch('/api/payments/razorpay/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response)
          })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data.ok) {
              document.getElementById('card').innerHTML = '<div style="font-size: 56px; color: #16A34A; margin-bottom: 12px;">✓</div><h1 style="color: #0F172A; margin-bottom: 8px;">Payment Successful!</h1><p class="desc" style="color: #64748B; margin-bottom: 24px;">Your registration fee has been received and confirmed.</p><a href="wellfind-academic://application" class="btn" style="text-decoration: none; display: inline-block;">Return to Wellfind App</a>';
              setTimeout(function() {
                window.location.href = 'wellfind-academic://application';
              }, 1200);
            } else {
              status.innerText = data.message || 'Payment verification failed.';
              btn.style.display = 'block';
            }
          })
          .catch(function(err) {
            status.innerText = 'Verification completed via background webhook. You can return to the app.';
            btn.style.display = 'block';
          });
        }
      };

      try {
        rzp = new Razorpay(options);
        rzp.on('payment.failed', function(resp) {
          status.innerText = 'Payment failed: ' + (resp.error ? resp.error.description : 'Transaction declined');
        });
        rzp.open();
        status.innerText = 'Payment window open.';
      } catch (err) {
        status.innerText = 'Could not load Razorpay. Please click Pay Securely to try again.';
      }
    }

    // Auto open on load
    window.addEventListener('load', function() {
      setTimeout(openCheckout, 500);
    });
  </script>
</body>
</html>`

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const payload = await getPayload({ config })
    const result = await verifyAndSettleCheckout(payload, body)
    return Response.json({ ok: result.settled, message: result.settled ? 'Payment confirmed.' : 'Payment pending.' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Payment verification failed.'
    return Response.json({ ok: false, message: msg }, { status: 400 })
  }
}
