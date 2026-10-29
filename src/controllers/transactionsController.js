const storageEngine = require('../services/storageEngine');
const userService = require('../services/userService');
const sheetsService = require('../services/sheetsService');
const { formatCurrency } = require('../utils/format');

function parseDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function getLastMonths(count, now) {
  const months = [];
  const anchor = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    months.push({
      key: getMonthKey(date),
      label: date.toLocaleString('id-ID', { month: 'short' }),
      year: date.getFullYear(),
      monthIndex: date.getMonth()
    });
  }
  return months;
}

function buildSummary(transactions, budgets = {}) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Previous month anchor
  const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
  const prevMonth = prevMonthDate.getMonth();
  const prevYear = prevMonthDate.getFullYear();

  let balance = 0;
  let monthIncome = 0;
  let monthExpense = 0;
  let prevMonthIncome = 0;
  let prevMonthExpense = 0;

  const categoryTotals = new Map();
  const expenseByMonth = new Map();
  const incomeByMonth = new Map();
  const dailyExpensesMap = new Map();

  const lastMonths = getLastMonths(6, now);
  const lastMonthKeys = new Set(lastMonths.map((m) => m.key));

  transactions.forEach((tx) => {
    const isIncome = (tx.type || '').toLowerCase() === 'income';
    const amount = Number(tx.amount) || 0;

    if (isIncome) {
      balance += amount;
    } else {
      balance -= amount;
    }

    const txDate = parseDate(tx.date);
    if (!txDate) return;

    const txYear = txDate.getFullYear();
    const txMonth = txDate.getMonth();
    const monthKey = getMonthKey(txDate);

    // Current month totals
    if (txYear === currentYear && txMonth === currentMonth) {
      if (isIncome) {
        monthIncome += amount;
      } else {
        monthExpense += amount;
        const currentCatTotal = categoryTotals.get(tx.category) || 0;
        categoryTotals.set(tx.category, currentCatTotal + amount);

        // Daily expense map for current month
        const dayKey = txDate.getDate();
        const currentDaily = dailyExpensesMap.get(dayKey) || 0;
        dailyExpensesMap.set(dayKey, currentDaily + amount);
      }
    }

    // Previous month totals
    if (txYear === prevYear && txMonth === prevMonth) {
      if (isIncome) {
        prevMonthIncome += amount;
      } else {
        prevMonthExpense += amount;
      }
    }

    // 6 Months trend totals
    if (lastMonthKeys.has(monthKey)) {
      if (isIncome) {
        const cur = incomeByMonth.get(monthKey) || 0;
        incomeByMonth.set(monthKey, cur + amount);
      } else {
        const cur = expenseByMonth.get(monthKey) || 0;
        expenseByMonth.set(monthKey, cur + amount);
      }
    }
  });

  // Calculate savings rate
  const netSavings = monthIncome - monthExpense;
  const savingsRate = monthIncome > 0 ? Math.round((netSavings / monthIncome) * 100) : 0;

  // Average daily expense
  const dayOfMonth = Math.max(1, now.getDate());
  const averageDailyExpense = Math.round(monthExpense / dayOfMonth);

  // 6-month monthly expense and income trend
  const monthlyExpenseTrend = lastMonths.map((m) => ({
    month: m.label,
    pengeluaran: expenseByMonth.get(m.key) || 0,
    pemasukan: incomeByMonth.get(m.key) || 0
  }));

  // Cashflow comparison
  const incomeVsExpense = [
    { label: 'Pemasukan', amount: monthIncome, color: '#10B981' },
    { label: 'Pengeluaran', amount: monthExpense, color: '#EF4444' }
  ];

  // Category allocation with percentage
  const categoryAllocation = Array.from(categoryTotals.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: monthExpense > 0 ? Math.round((amount / monthExpense) * 100) : 0
    }))
    .sort((a, b) => b.amount - a.amount);

  // Daily spending bars
  const dailySpending = [];
  for (let day = 1; day <= dayOfMonth; day += 1) {
    dailySpending.push({
      day: `${day}`,
      amount: dailyExpensesMap.get(day) || 0
    });
  }

  // Budget status comparison
  const budgetStatus = Object.entries(budgets).map(([category, limit]) => {
    const spent = categoryTotals.get(category) || 0;
    const percentage = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    return {
      category,
      limit,
      spent,
      percentage,
      status: percentage > 100 ? 'over' : percentage > 80 ? 'warning' : 'ok'
    };
  });

  return {
    balance,
    monthIncome,
    monthExpense,
    prevMonthIncome,
    prevMonthExpense,
    savingsRate,
    averageDailyExpense,
    monthlyExpenseTrend,
    categoryAllocation,
    incomeVsExpense,
    dailySpending,
    budgetStatus,
    recentTransactions: transactions.slice(0, 10)
  };
}

const transactionsController = {
  // Current user info
  async getMe(req, res) {
    try {
      const user = req.user;
      res.json({
        success: true,
        user: {
          telegramId: user.telegramId,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          spreadsheetId: user.spreadsheetId,
          isSheetsConnected: Boolean(user.spreadsheetId),
          status: user.status,
          trialEndsAt: user.trialEndsAt,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Connect Google Sheets
  async connectSheets(req, res) {
    try {
      const { spreadsheetUrl } = req.body;
      if (!spreadsheetUrl) {
        return res.status(400).json({ success: false, message: 'URL atau ID Google Sheets harus diisi.' });
      }

      const cleanId = userService.extractSpreadsheetId(spreadsheetUrl);
      if (!cleanId) {
        return res.status(400).json({ success: false, message: 'Format link Google Sheets tidak valid.' });
      }

      // Verify permissions on the sheet
      await sheetsService.verifySheet(cleanId);

      // Update user profile
      const updatedUser = userService.updateSpreadsheetId(req.user.telegramId, cleanId);

      // Sync any local transactions
      await storageEngine.syncLocalToSheets(updatedUser);

      res.json({
        success: true,
        message: 'Google Sheets berhasil terhubung dan tersinkronisasi!',
        spreadsheetId: cleanId
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: `Gagal menghubungkan Google Sheets: ${error.message}. Pastikan spreadsheet sudah di-share (Editor) ke email robot.`
      });
    }
  },

  async disconnectSheets(req, res) {
    try {
      userService.updateSpreadsheetId(req.user.telegramId, null);
      res.json({ success: true, message: 'Koneksi Google Sheets berhasil diputuskan.' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async formatSheets(req, res) {
    try {
      const spreadsheetId = req.user?.spreadsheetId || process.env.SPREADSHEET_ID;
      if (!spreadsheetId) {
        return res.status(400).json({ success: false, message: 'Belum ada Google Sheets yang terhubung.' });
      }
      const result = await sheetsService.formatAndDesignSheet(spreadsheetId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getTransactions(req, res) {
    try {
      const { search, type, category, startDate, endDate, page = 1, limit = 20 } = req.query;
      const result = await storageEngine.getTransactions({
        search,
        type,
        category,
        startDate,
        endDate,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      }, req.user);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async createTransaction(req, res) {
    try {
      const { type, amount, category, description, date } = req.body;

      if (!type || !amount || Number(amount) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Jenis (type) dan jumlah nominal (amount > 0) wajib diisi.'
        });
      }

      const transaction = await storageEngine.createTransaction({
        type,
        amount: Number(amount),
        category: category || 'Lain-lain',
        description: description || category || 'Lain-lain',
        date: date || new Date().toISOString()
      }, req.user);

      res.status(201).json({
        success: true,
        data: transaction,
        message: 'Transaksi berhasil dicatat.'
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updateTransaction(req, res) {
    try {
      const { id } = req.params;
      const { type, amount, category, description, date } = req.body;

      const updated = await storageEngine.updateTransaction(id, {
        type,
        amount: amount !== undefined ? Number(amount) : undefined,
        category,
        description,
        date
      }, req.user);

      res.json({
        success: true,
        data: updated,
        message: 'Transaksi berhasil diperbarui.'
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async deleteTransaction(req, res) {
    try {
      const { id } = req.params;
      await storageEngine.deleteTransaction(id, req.user);
      res.json({
        success: true,
        message: 'Transaksi berhasil dihapus.'
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getSummary(req, res) {
    try {
      const transactions = await storageEngine.getAllTransactions(req.user);
      const budgets = storageEngine.getBudgets(req.user);
      const summary = buildSummary(transactions, budgets);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getBudgets(req, res) {
    try {
      const budgets = storageEngine.getBudgets(req.user);
      res.json({ success: true, budgets });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async setBudgets(req, res) {
    try {
      const { budgets } = req.body;
      if (!budgets || typeof budgets !== 'object') {
        return res.status(400).json({ success: false, message: 'Format anggaran tidak valid.' });
      }
      const updated = storageEngine.setBudgets(budgets, req.user);
      res.json({ success: true, budgets: updated, message: 'Anggaran berhasil diperbarui.' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async exportTransactions(req, res) {
    try {
      const transactions = await storageEngine.getAllTransactions(req.user);
      const headers = ['ID', 'Tanggal', 'Jenis', 'Jumlah', 'Kategori', 'Keterangan', 'Created_At'];

      const csvRows = [headers.join(',')];
      transactions.forEach((tx) => {
        const row = [
          `"${tx.id}"`,
          `"${tx.date}"`,
          `"${tx.type}"`,
          tx.amount,
          `"${(tx.category || '').replace(/"/g, '""')}"`,
          `"${(tx.description || '').replace(/"/g, '""')}"`,
          `"${tx.createdAt || ''}"`
        ];
        csvRows.push(row.join(','));
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=transaksi_${req.user?.telegramId || 'export'}.csv`);
      res.status(200).send(csvRows.join('\n'));
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getStatus(req, res) {
    try {
      const status = await storageEngine.getStatus(req.user);
      const isTeleConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
      res.json({
        ...status,
        telegram: {
          configured: isTeleConfigured
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = transactionsController;
