const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const transactionsRouter = require('./routes/transactions');
const paymentRouter = require('./routes/payment');
const { startTelegramBot } = require('./services/telegramBot');
const storageEngine = require('./services/storageEngine');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Enhanced Health & Diagnostic endpoint
app.get('/health', async (req, res) => {
  try {
    const status = await storageEngine.getStatus();
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      storage: status,
      telegram: {
        configured: Boolean(process.env.TELEGRAM_BOT_TOKEN)
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// API Routes
app.use('/api/payment', paymentRouter);
app.use('/api', transactionsRouter);

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

const port = process.env.PORT || 4000;
const server = app.listen(port, () => {
  console.log(`=========================================`);
  console.log(`🚀 CashMate Backend berjalan di port ${port}`);
  console.log(`📡 URL: http://localhost:${port}`);
  console.log(`📊 Mode Penyimpanan: ${storageEngine.isUsingGoogleSheets() ? 'Google Sheets' : 'Local JSON Storage (Fallback Aktif)'}`);
  console.log(`=========================================`);
});

const bot = startTelegramBot();

process.once('SIGINT', () => {
  if (bot) {
    bot.stop('SIGINT');
  }
  server.close(() => process.exit(0));
});

process.once('SIGTERM', () => {
  if (bot) {
    bot.stop('SIGTERM');
  }
  server.close(() => process.exit(0));
});
