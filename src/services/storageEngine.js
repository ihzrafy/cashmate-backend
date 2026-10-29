const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sheetsService = require('./sheetsService');
const userService = require('./userService');

const DATA_DIR = path.resolve(__dirname, '../../data');
const TENANTS_DIR = path.join(DATA_DIR, 'tenants');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TENANTS_DIR)) fs.mkdirSync(TENANTS_DIR, { recursive: true });
}

function getTenantDir(tenantId) {
  ensureDirectories();
  const dir = path.join(TENANTS_DIR, String(tenantId));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function loadTenantTransactions(tenantId) {
  if (!tenantId) {
    if (!fs.existsSync(TRANSACTIONS_FILE)) return [];
    try {
      return JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
    } catch {
      return [];
    }
  }
  const tDir = getTenantDir(tenantId);
  const tFile = path.join(tDir, 'transactions.json');
  if (!fs.existsSync(tFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(tFile, 'utf8'));
  } catch {
    return [];
  }
}

function saveTenantTransactions(tenantId, transactions) {
  if (!tenantId) {
    ensureDirectories();
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2), 'utf8');
    return;
  }
  const tDir = getTenantDir(tenantId);
  const tFile = path.join(tDir, 'transactions.json');
  fs.writeFileSync(tFile, JSON.stringify(transactions, null, 2), 'utf8');
}

function isGoogleSheetsConfigured(user) {
  const hasCreds = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    (process.env.GOOGLE_SERVICE_ACCOUNT_PATH && fs.existsSync(process.env.GOOGLE_SERVICE_ACCOUNT_PATH))
  );
  const sheetId = user?.spreadsheetId || process.env.SPREADSHEET_ID;
  return hasCreds && Boolean(sheetId);
}

const storageEngine = {
  isUsingGoogleSheets(user) {
    return isGoogleSheetsConfigured(user);
  },

  async getStatus(user) {
    const activeUser = user || userService.ensureDefaultOwner(process.env.SPREADSHEET_ID);
    const usingSheets = isGoogleSheetsConfigured(activeUser);
    let sheetsConnected = false;
    let sheetError = null;

    if (usingSheets && activeUser.spreadsheetId) {
      try {
        await sheetsService.verifySheet(activeUser.spreadsheetId);
        sheetsConnected = true;
      } catch (err) {
        sheetError = err.message;
      }
    }

    const allTx = await this.getAllTransactions(activeUser);

    return {
      storageMode: usingSheets && sheetsConnected ? 'google_sheets' : 'local_json',
      googleSheetsConfigured: usingSheets,
      googleSheetsConnected: sheetsConnected,
      googleSheetsError: sheetError,
      spreadsheetId: activeUser.spreadsheetId ? `${activeUser.spreadsheetId.substring(0, 8)}...` : null,
      fullSpreadsheetId: activeUser.spreadsheetId || null,
      sheetName: process.env.SHEET_NAME || 'Transactions',
      totalRecords: allTx.length,
      user: {
        telegramId: activeUser.telegramId,
        username: activeUser.username,
        firstName: activeUser.firstName,
        status: activeUser.status
      }
    };
  },

  async getAllTransactions(user) {
    const activeUser = user || userService.ensureDefaultOwner(process.env.SPREADSHEET_ID);
    const tenantId = activeUser?.telegramId;

    if (isGoogleSheetsConfigured(activeUser) && activeUser.spreadsheetId) {
      try {
        return await sheetsService.getTransactions(activeUser.spreadsheetId);
      } catch (err) {
        console.warn(`[StorageEngine] Fetch Google Sheets gagal untuk user ${tenantId} (${err.message}). Fallback ke lokal.`);
      }
    }

    return loadTenantTransactions(tenantId);
  },

  async getTransactions(options = {}, user) {
    const activeUser = user || userService.ensureDefaultOwner(process.env.SPREADSHEET_ID);
    const { search, type, category, startDate, endDate, page = 1, limit = 20 } = options;
    const all = await this.getAllTransactions(activeUser);

    let filtered = [...all];

    if (type && type !== 'all') {
      const normalizedType = type.toLowerCase();
      filtered = filtered.filter(t => (t.type || '').toLowerCase() === normalizedType);
    }

    if (category && category !== 'all') {
      const catLower = category.toLowerCase();
      filtered = filtered.filter(t => (t.category || '').toLowerCase() === catLower);
    }

    if (search && search.trim()) {
      const query = search.trim().toLowerCase();
      filtered = filtered.filter(t => {
        const cat = (t.category || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const amt = String(t.amount || '');
        return cat.includes(query) || desc.includes(query) || amt.includes(query);
      });
    }

    if (startDate) {
      const sDate = new Date(startDate);
      filtered = filtered.filter(t => new Date(t.date) >= sDate);
    }

    if (endDate) {
      const eDate = new Date(endDate);
      filtered = filtered.filter(t => new Date(t.date) <= eDate);
    }

    // Sort descending by date
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    const total = filtered.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const totalPages = Math.ceil(total / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = filtered.slice(startIndex, startIndex + limitNum);

    return {
      data: paginated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasPrev: pageNum > 1,
        hasNext: pageNum < totalPages
      }
    };
  },

  async createTransaction({ type, amount, category, description, date }, user) {
    const activeUser = user || userService.ensureDefaultOwner(process.env.SPREADSHEET_ID);
    const tenantId = activeUser?.telegramId;

    const id = crypto.randomUUID();
    const normalizedType = (type || 'Expense').toLowerCase() === 'income' ? 'Income' : 'Expense';
    const parsedAmount = Math.abs(Number(amount)) || 0;
    const normalizedCategory = (category || 'Lain-lain').trim();
    const normalizedDesc = (description || normalizedCategory).trim();
    const isoDate = date ? new Date(date).toISOString() : new Date().toISOString();
    const createdAt = new Date().toISOString();

    const transaction = {
      id,
      date: isoDate,
      type: normalizedType,
      amount: parsedAmount,
      category: normalizedCategory,
      description: normalizedDesc,
      createdAt
    };

    if (isGoogleSheetsConfigured(activeUser) && activeUser.spreadsheetId) {
      try {
        await sheetsService.appendTransaction(activeUser.spreadsheetId, transaction);
        // Also keep tenant local backup
        const local = loadTenantTransactions(tenantId);
        local.unshift(transaction);
        saveTenantTransactions(tenantId, local);
        return transaction;
      } catch (err) {
        console.warn(`[StorageEngine] Google Sheets append failed (${err.message}). Simpan ke penyimpanan lokal tenant.`);
      }
    }

    const local = loadTenantTransactions(tenantId);
    local.unshift(transaction);
    saveTenantTransactions(tenantId, local);
    return transaction;
  },

  async updateTransaction(id, updates, user) {
    const activeUser = user || userService.ensureDefaultOwner(process.env.SPREADSHEET_ID);
    const tenantId = activeUser?.telegramId;

    if (isGoogleSheetsConfigured(activeUser) && activeUser.spreadsheetId) {
      try {
        const updated = await sheetsService.updateTransaction(activeUser.spreadsheetId, id, updates);
        const local = loadTenantTransactions(tenantId);
        const idx = local.findIndex(t => t.id === id);
        if (idx !== -1) {
          local[idx] = { ...local[idx], ...updated };
          saveTenantTransactions(tenantId, local);
        }
        return updated;
      } catch (err) {
        console.warn(`[StorageEngine] Sheets update failed (${err.message}). Update lokal.`);
      }
    }

    const local = loadTenantTransactions(tenantId);
    const idx = local.findIndex(t => t.id === id);
    if (idx === -1) {
      throw new Error(`Transaksi dengan ID ${id} tidak ditemukan.`);
    }

    local[idx] = {
      ...local[idx],
      ...updates,
      amount: updates.amount !== undefined ? Math.abs(Number(updates.amount)) : local[idx].amount
    };

    saveTenantTransactions(tenantId, local);
    return local[idx];
  },

  async deleteTransaction(id, user) {
    const activeUser = user || userService.ensureDefaultOwner(process.env.SPREADSHEET_ID);
    const tenantId = activeUser?.telegramId;

    if (isGoogleSheetsConfigured(activeUser) && activeUser.spreadsheetId) {
      try {
        await sheetsService.deleteTransaction(activeUser.spreadsheetId, id);
      } catch (err) {
        console.warn(`[StorageEngine] Sheets delete failed (${err.message}). Hapus lokal.`);
      }
    }

    const local = loadTenantTransactions(tenantId);
    const filtered = local.filter(t => t.id !== id);
    saveTenantTransactions(tenantId, filtered);
    return { success: true, id };
  },

  getBudgets(user) {
    const activeUser = user || userService.ensureDefaultOwner(process.env.SPREADSHEET_ID);
    return activeUser?.budgets || {};
  },

  setBudgets(budgets, user) {
    const activeUser = user || userService.ensureDefaultOwner(process.env.SPREADSHEET_ID);
    if (activeUser?.telegramId) {
      userService.updateBudgets(activeUser.telegramId, budgets);
    }
    return budgets;
  },

  /**
   * Syncs existing local tenant transactions into Google Sheets once connected
   */
  async syncLocalToSheets(user) {
    if (!user || !user.spreadsheetId) return;
    const local = loadTenantTransactions(user.telegramId);
    if (local.length === 0) return;

    try {
      await sheetsService.verifySheet(user.spreadsheetId);
      const existingInSheets = await sheetsService.getTransactions(user.spreadsheetId);
      const existingIds = new Set(existingInSheets.map(t => t.id));

      for (const tx of local) {
        if (!existingIds.has(tx.id)) {
          await sheetsService.appendTransaction(user.spreadsheetId, tx);
        }
      }
    } catch (err) {
      console.error('[StorageEngine] Error syncing local transactions to sheets:', err.message);
    }
  }
};

module.exports = storageEngine;
