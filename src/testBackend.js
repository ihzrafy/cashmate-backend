const assert = require('assert');
const { parseTelegramMessage, parseAmount, detectCategory } = require('./utils/telegramParser');
const storageEngine = require('./services/storageEngine');

async function runTests() {
  console.log('--- TEST 1: Telegram Parser ---');
  // Shorthands
  assert.strictEqual(parseAmount('50k'), 50000, '50k should parse to 50000');
  assert.strictEqual(parseAmount('50rb'), 50000, '50rb should parse to 50000');
  assert.strictEqual(parseAmount('1.5jt'), 1500000, '1.5jt should parse to 1500000');
  assert.strictEqual(parseAmount('2,5jt'), 2500000, '2,5jt should parse to 2500000');
  assert.strictEqual(parseAmount('100.000'), 100000, '100.000 should parse to 100000');

  // Categories
  assert.strictEqual(detectCategory('Makan nasi padang', 'Expense'), 'Makan & Minum');
  assert.strictEqual(detectCategory('Beli kopi susu', 'Expense'), 'Makan & Minum');
  assert.strictEqual(detectCategory('Bensin motor', 'Expense'), 'Transportasi');
  assert.strictEqual(detectCategory('Bayar wifi indihome', 'Expense'), 'Tagihan & Utilitas');
  assert.strictEqual(detectCategory('Gaji kantor', 'Income'), 'Gaji');
  assert.strictEqual(detectCategory('Freelance landing page', 'Income'), 'Freelance');

  // Full messages
  const parsed1 = parseTelegramMessage('/in 12500000 Gaji Bulanan');
  assert.deepStrictEqual(parsed1, {
    type: 'Income',
    amount: 12500000,
    category: 'Gaji',
    description: 'Gaji Bulanan'
  });

  const parsed2 = parseTelegramMessage('/out 25k Kopi kenangan');
  assert.deepStrictEqual(parsed2, {
    type: 'Expense',
    amount: 25000,
    category: 'Makan & Minum',
    description: 'Kopi kenangan'
  });

  console.log('✅ Telegram Parser tests PASSED!');

  console.log('--- TEST 2: Storage Engine CRUD ---');
  const initialData = await storageEngine.getTransactions({ limit: 10 });
  assert(Array.isArray(initialData.data), 'initialData should be an array');
  assert(initialData.pagination.total > 0, 'should have seeded transactions');
  console.log(`Initial seeded count: ${initialData.pagination.total}`);

  // Create
  const created = await storageEngine.createTransaction({
    type: 'Expense',
    amount: 75000,
    category: 'Makan & Minum',
    description: 'Test Dinner Nasi Goreng',
    date: new Date().toISOString()
  });
  assert(created.id, 'Created transaction must have an ID');
  assert.strictEqual(created.amount, 75000);

  // Read
  const afterCreate = await storageEngine.getTransactions({ search: 'Test Dinner', limit: 5 });
  assert.strictEqual(afterCreate.data.length, 1);
  assert.strictEqual(afterCreate.data[0].id, created.id);

  // Update
  const updated = await storageEngine.updateTransaction(created.id, {
    amount: 80000,
    description: 'Test Dinner Nasi Goreng Spesial'
  });
  assert.strictEqual(updated.amount, 80000);
  assert.strictEqual(updated.description, 'Test Dinner Nasi Goreng Spesial');

  // Delete
  const delRes = await storageEngine.deleteTransaction(created.id);
  assert.strictEqual(delRes.success, true);

  const afterDelete = await storageEngine.getTransactions({ search: 'Test Dinner', limit: 5 });
  assert.strictEqual(afterDelete.data.length, 0);

  console.log('✅ Storage Engine CRUD tests PASSED!');

  console.log('--- TEST 4: Payment Service & License Token Activation ---');
  const paymentService = require('./services/paymentService');
  const userService = require('./services/userService');

  const plans = paymentService.getPlans();
  assert.strictEqual(plans.length, 3, 'Should have 3 plans');

  const order = paymentService.createOrder({
    planId: 'pro',
    customerName: 'Budi Santoso',
    customerContact: '@budi_santoso',
    paymentMethod: 'qris'
  });
  assert(order.orderId.startsWith('ORD-'));
  assert(order.token.startsWith('CASHMATE-PRO-'));
  assert.strictEqual(order.status, 'pending');

  const payRes = paymentService.simulatePayment(order.orderId);
  assert.strictEqual(payRes.order.status, 'paid');
  assert.strictEqual(payRes.activation.token, order.token);

  const verified = paymentService.verifyToken(order.token);
  assert(verified.valid, 'Token should be verified');
  assert.strictEqual(verified.user.status, 'pro');

  const activated = userService.activateTokenForTelegramUser({
    telegramId: '999888777',
    username: 'budi_santoso',
    firstName: 'Budi',
    lastName: 'Santoso'
  }, order.token);
  assert.strictEqual(String(activated.telegramId), '999888777');
  assert.strictEqual(activated.status, 'pro');
  console.log('✅ Payment & License Activation tests PASSED!');

  console.log('\n🎉 ALL BACKEND TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
