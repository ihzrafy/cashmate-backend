const express = require('express');
const transactionsController = require('../controllers/transactionsController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply multi-tenant authentication middleware to all /api routes
router.use(authMiddleware);

// User Profile & Sheets Connection
router.get('/user/me', transactionsController.getMe);
router.post('/user/connect-sheets', transactionsController.connectSheets);
router.post('/user/disconnect-sheets', transactionsController.disconnectSheets);
router.post('/user/format-sheets', transactionsController.formatSheets);

// System diagnostics & status (for active tenant)
router.get('/status', transactionsController.getStatus);

// Transactions CRUD
router.get('/transactions', transactionsController.getTransactions);
router.post('/transactions', transactionsController.createTransaction);
router.put('/transactions/:id', transactionsController.updateTransaction);
router.delete('/transactions/:id', transactionsController.deleteTransaction);

// Summary & Analytics
router.get('/summary', transactionsController.getSummary);

// Budgets
router.get('/budgets', transactionsController.getBudgets);
router.post('/budgets', transactionsController.setBudgets);

// Export CSV
router.get('/export', transactionsController.exportTransactions);

// Telegram Simulator for testing
router.post('/telegram/simulate', async (req, res) => {
  const { parseTelegramMessage } = require('../utils/telegramParser');
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ success: false, message: 'Field text harus diisi.' });
  }
  const parsed = parseTelegramMessage(text);
  if (!parsed) {
    return res.status(422).json({
      success: false,
      message: 'Format pesan tidak dikenali. Gunakan contoh: /in 5000000 Gaji atau /out 25k Kopi'
    });
  }
  try {
    const transaction = await require('../services/storageEngine').createTransaction({
      type: parsed.type,
      amount: parsed.amount,
      category: parsed.category,
      description: parsed.description,
      date: new Date().toISOString()
    }, req.user);

    res.json({
      success: true,
      message: 'Transaksi berhasil disimulasikan dan dicatat.',
      parsed,
      transaction
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
