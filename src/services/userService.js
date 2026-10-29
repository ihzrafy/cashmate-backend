const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(__dirname, '../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadUsers() {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[UserService] Error reading users.json:', err.message);
    return [];
  }
}

function saveUsers(users) {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function generateAuthToken() {
  return 'usr_' + crypto.randomBytes(24).toString('hex');
}

function extractSpreadsheetId(input) {
  if (!input) return null;
  const match = String(input).match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  const cleaned = String(input).trim();
  return cleaned.length > 15 ? cleaned : null;
}

const DEFAULT_BUDGETS = {
  'Makan & Minum': 3000000,
  'Transportasi': 1200000,
  'Tagihan & Utilitas': 1500000,
  'Belanja': 1500000,
  'Hiburan': 600000
};

const userService = {
  extractSpreadsheetId,

  getAllUsers() {
    return loadUsers();
  },

  getUserByTelegramId(telegramId) {
    if (!telegramId) return null;
    const users = loadUsers();
    return users.find(u => String(u.telegramId) === String(telegramId)) || null;
  },

  getUserByAuthToken(token) {
    if (!token) return null;
    const users = loadUsers();
    return users.find(u => u.authToken === token) || null;
  },

  registerOrUpdateUser({ telegramId, username, firstName, lastName }) {
    if (!telegramId) throw new Error('telegramId is required');

    const users = loadUsers();
    let user = users.find(u => String(u.telegramId) === String(telegramId));
    const now = new Date().toISOString();

    if (!user) {
      // 7-day free trial for new users
      const trialEnds = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      user = {
        telegramId: String(telegramId),
        username: username || '',
        firstName: firstName || 'User',
        lastName: lastName || '',
        spreadsheetId: null,
        authToken: generateAuthToken(),
        status: 'active', // 'active' | 'trial' | 'expired'
        trialEndsAt: trialEnds,
        budgets: { ...DEFAULT_BUDGETS },
        createdAt: now,
        lastActiveAt: now
      };
      users.push(user);
    } else {
      user.username = username || user.username;
      user.firstName = firstName || user.firstName;
      user.lastName = lastName || user.lastName;
      user.lastActiveAt = now;
      if (!user.authToken) {
        user.authToken = generateAuthToken();
      }
      if (!user.budgets) {
        user.budgets = { ...DEFAULT_BUDGETS };
      }
    }

    saveUsers(users);
    return user;
  },

  updateSpreadsheetId(telegramId, spreadsheetInput) {
    const sheetId = extractSpreadsheetId(spreadsheetInput);
    if (!sheetId) {
      throw new Error('Format Spreadsheet ID atau URL Google Sheets tidak valid.');
    }

    const users = loadUsers();
    const user = users.find(u => String(u.telegramId) === String(telegramId));
    if (!user) {
      throw new Error(`User with telegramId ${telegramId} not found`);
    }

    user.spreadsheetId = sheetId;
    user.lastActiveAt = new Date().toISOString();
    saveUsers(users);
    return user;
  },

  updateBudgets(telegramId, budgets) {
    const users = loadUsers();
    const user = users.find(u => String(u.telegramId) === String(telegramId));
    if (!user) {
      throw new Error(`User with telegramId ${telegramId} not found`);
    }

    user.budgets = { ...user.budgets, ...budgets };
    user.lastActiveAt = new Date().toISOString();
    saveUsers(users);
    return user;
  },

  regenerateAuthToken(telegramId) {
    const users = loadUsers();
    const user = users.find(u => String(u.telegramId) === String(telegramId));
    if (!user) {
      throw new Error(`User with telegramId ${telegramId} not found`);
    }

    user.authToken = generateAuthToken();
    saveUsers(users);
    return user.authToken;
  },

  /**
   * Pre-provisions a paid user license after successful payment
   */
  provisionPaidUser({ token, planId, planName, durationDays, customerName, customerContact, orderId }) {
    const users = loadUsers();
    let user = users.find(u => u.authToken === token);
    const now = new Date();
    const subscriptionEndsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    if (!user) {
      user = {
        telegramId: null, // will be linked on /start <token> or /activate <token>
        username: customerContact && customerContact.startsWith('@') ? customerContact.replace('@', '') : '',
        firstName: customerName || 'Pengguna Pro',
        lastName: '',
        spreadsheetId: null,
        authToken: token,
        status: 'pro',
        plan: planName || 'Pro',
        planId: planId || 'pro',
        orderId: orderId || null,
        customerContact: customerContact || '',
        subscriptionEndsAt,
        budgets: { ...DEFAULT_BUDGETS },
        createdAt: now.toISOString(),
        lastActiveAt: now.toISOString()
      };
      users.push(user);
    } else {
      user.status = 'pro';
      user.plan = planName || user.plan;
      user.planId = planId || user.planId;
      user.subscriptionEndsAt = subscriptionEndsAt;
      user.lastActiveAt = now.toISOString();
    }

    saveUsers(users);
    return user;
  },

  /**
   * Activates a paid token for a Telegram user
   */
  activateTokenForTelegramUser({ telegramId, username, firstName, lastName }, token) {
    if (!token) throw new Error('Token wajib diisi.');
    const cleanToken = String(token).trim();
    const users = loadUsers();

    // 1. Look for token record
    let tokenUser = users.find(u => u.authToken === cleanToken);
    
    // Check if token doesn't exist in users.json, check orders.json
    if (!tokenUser) {
      const ordersFile = path.join(DATA_DIR, 'orders.json');
      if (fs.existsSync(ordersFile)) {
        try {
          const orders = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
          const order = orders.find(o => o.token === cleanToken && o.status === 'paid');
          if (order) {
            tokenUser = this.provisionPaidUser({
              token: order.token,
              planId: order.planId,
              planName: order.planName,
              durationDays: order.durationDays,
              customerName: order.customerName,
              customerContact: order.customerContact,
              orderId: order.orderId
            });
          }
        } catch (e) {
          console.error('Failed reading orders for activation:', e.message);
        }
      }
    }

    if (!tokenUser) {
      throw new Error(`Token "${cleanToken}" tidak valid atau belum pernah dibeli. Silakan beli token di website.`);
    }

    // Check if a user record for this telegramId already existed
    const existingTelegramUser = users.find(u => String(u.telegramId) === String(telegramId) && u.authToken !== cleanToken);

    if (existingTelegramUser) {
      // Migrate tenant data folder if exists
      const oldDir = path.join(DATA_DIR, 'tenants', existingTelegramUser.authToken);
      const newDir = path.join(DATA_DIR, 'tenants', cleanToken);
      if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
        try {
          fs.renameSync(oldDir, newDir);
        } catch (err) {
          console.warn('Tenant data rename warning:', err.message);
        }
      }

      // Merge properties into tokenUser
      tokenUser.spreadsheetId = tokenUser.spreadsheetId || existingTelegramUser.spreadsheetId;
      tokenUser.budgets = tokenUser.budgets || existingTelegramUser.budgets;

      // Remove the old unlinked trial user record
      const idx = users.findIndex(u => u === existingTelegramUser);
      if (idx !== -1) {
        users.splice(idx, 1);
      }
    }

    // Bind current Telegram info to tokenUser
    tokenUser.telegramId = String(telegramId);
    tokenUser.username = username || tokenUser.username;
    tokenUser.firstName = firstName || tokenUser.firstName;
    tokenUser.lastName = lastName || tokenUser.lastName;
    tokenUser.status = 'pro';
    tokenUser.lastActiveAt = new Date().toISOString();

    saveUsers(users);
    return tokenUser;
  },

  /**
   * Seeds the primary owner from .env so the current workspace continues to work seamlessly
   */
  ensureDefaultOwner(defaultSpreadsheetId) {
    const users = loadUsers();
    if (users.length === 0) {
      const cleanId = extractSpreadsheetId(defaultSpreadsheetId);
      const defaultUser = {
        telegramId: 'default_admin',
        username: 'admin',
        firstName: 'Owner',
        lastName: '',
        spreadsheetId: cleanId || null,
        authToken: 'usr_default_admin_master_key',
        status: 'pro',
        plan: 'Lifetime (Developer Owner)',
        subscriptionEndsAt: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString(),
        budgets: { ...DEFAULT_BUDGETS },
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString()
      };
      users.push(defaultUser);
      saveUsers(users);
      return defaultUser;
    }
    return users[0];
  }
};

module.exports = userService;
