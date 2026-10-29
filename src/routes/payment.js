const express = require('express');
const paymentService = require('../services/paymentService');

const router = express.Router();

// GET /api/payment/plans
router.get('/plans', (req, res) => {
  try {
    const plans = paymentService.getPlans();
    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/payment/bot-info
router.get('/bot-info', (req, res) => {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'wallet_saving_bot';
  res.json({
    success: true,
    data: {
      botUsername,
      botUrl: `https://t.me/${botUsername}`,
      configured: Boolean(process.env.TELEGRAM_BOT_TOKEN)
    }
  });
});

// POST /api/payment/create-order
router.post('/create-order', (req, res) => {
  try {
    const { planId, customerName, customerContact, paymentMethod } = req.body;
    if (!planId) {
      return res.status(400).json({ success: false, message: 'ID Paket (planId) wajib dipilih.' });
    }

    const order = paymentService.createOrder({
      planId,
      customerName,
      customerContact,
      paymentMethod
    });

    res.json({
      success: true,
      message: 'Pesanan berhasil dibuat.',
      data: order
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/payment/order/:orderId
router.get('/order/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    const order = paymentService.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    const activation = order.status === 'paid' ? paymentService.getActivationDetails(order) : null;

    res.json({
      success: true,
      data: {
        order,
        activation
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/payment/pay-order (Simulate or Webhook Payment)
router.post('/pay-order', (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId wajib dikirimkan.' });
    }

    const result = paymentService.simulatePayment(orderId);

    res.json({
      success: true,
      message: 'Pembayaran berhasil dikonfirmasi! Token akses telah aktif.',
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/payment/verify-token
router.post('/verify-token', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token wajib diisi.' });
    }

    const verified = paymentService.verifyToken(token);
    if (!verified) {
      return res.status(404).json({ success: false, message: 'Token tidak valid atau tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: 'Token valid.',
      data: verified
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
