const assert = require('assert');

async function testFlow() {
  console.log('--- 1. Testing Backend /health ---');
  const healthRes = await fetch('http://localhost:4000/health');
  assert.strictEqual(healthRes.status, 200, 'Health endpoint should be 200');
  const healthData = await healthRes.json();
  console.log('✅ Health status:', healthData.status, 'Storage mode:', healthData.storage?.storageMode);

  console.log('\n--- 2. Testing Payment Plans Endpoint ---');
  const plansRes = await fetch('http://localhost:4000/api/payment/plans');
  assert.strictEqual(plansRes.status, 200);
  const plansData = await plansRes.json();
  assert(plansData.data.length >= 3, 'Should return at least 3 plans');
  console.log('✅ Plans available:', plansData.data.map(p => `${p.name} (${p.price})`).join(', '));

  console.log('\n--- 3. Testing Bot Info Endpoint ---');
  const botInfoRes = await fetch('http://localhost:4000/api/payment/bot-info');
  assert.strictEqual(botInfoRes.status, 200);
  const botInfoData = await botInfoRes.json();
  console.log('✅ Bot username:', botInfoData.data.botUsername, 'Bot URL:', botInfoData.data.botUrl);

  console.log('\n--- 4. Testing Create Order (QRIS) ---');
  const orderRes = await fetch('http://localhost:4000/api/payment/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      planId: 'pro',
      customerName: 'Ahmad Ridwan',
      customerContact: '@ahmad_ridwan',
      paymentMethod: 'qris'
    })
  });
  assert.strictEqual(orderRes.status, 200);
  const orderData = await orderRes.json();
  const order = orderData.data;
  console.log('✅ Order created:', order.orderId, 'Amount:', order.amount, 'Token:', order.token);

  console.log('\n--- 5. Testing Payment Simulation & Token Issuance ---');
  const payRes = await fetch('http://localhost:4000/api/payment/pay-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order.orderId })
  });
  assert.strictEqual(payRes.status, 200);
  const payData = await payRes.json();
  const activation = payData.data.activation;
  console.log('✅ Payment paid! License token:', activation.token);
  console.log('   Deep link Telegram:', activation.telegramDeepLink);
  console.log('   Activation command:', activation.telegramActivationCommand);
  console.log('   Web Dashboard link:', activation.dashboardLoginUrl);

  console.log('\n--- 6. Testing Token Verification ---');
  const verifyRes = await fetch('http://localhost:4000/api/payment/verify-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: activation.token })
  });
  assert.strictEqual(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  console.log('✅ Token successfully verified! User status:', verifyData.data.user.status, 'Plan:', verifyData.data.user.plan);

  console.log('\n--- 7. Testing Frontend Server Response ---');
  const frontendRes = await fetch('http://127.0.0.1:5173/');
  assert.strictEqual(frontendRes.status, 200);
  const html = await frontendRes.text();
  assert(html.includes('CashMate'), 'Frontend HTML should contain CashMate');
  console.log('✅ Frontend HTML served successfully (length:', html.length, 'bytes)');

  console.log('\n🎉 ALL INTEGRATION FLOW TESTS PASSED FLAWLESSLY!');
  process.exit(0);
}

testFlow().catch(err => {
  console.error('❌ Integration flow test failed:', err);
  process.exit(1);
});
