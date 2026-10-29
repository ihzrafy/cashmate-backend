const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const userService = require('./userService');

const DATA_DIR = path.resolve(__dirname, '../../data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadOrders() {
  ensureDataDir();
  if (!fs.existsSync(ORDERS_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[PaymentService] Error reading orders.json:', err.message);
    return [];
  }
}

function saveOrders(orders) {
  ensureDataDir();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
}

const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter (1 Bulan)',
    period: '30 Hari',
    price: 29000,
    originalPrice: 49000,
    durationDays: 30,
    description: 'Cocok untuk Anda yang ingin mencoba sistem pencatatan otomatis praktis.',
    popular: false,
    badge: null,
    features: [
      'Akses Penuh Bot Telegram (30 Hari)',
      'Web Dashboard Interaktif & Analitik',
      'Sinkronisasi Google Sheets Pribadi',
      'Pencatatan Transaksi Tanpa Batas',
      'Format Bahasa Alami (50k, 1.5jt, dll)',
      'Ekspor Laporan Keuangan ke CSV'
    ]
  },
  pro: {
    id: 'pro',
    name: 'Pro (1 Tahun)',
    period: '365 Hari (1 Tahun)',
    price: 149000,
    originalPrice: 348000,
    durationDays: 365,
    description: 'Paling diminati! Hemat 57% untuk perencanaan finansial disiplin sepanjang tahun.',
    popular: true,
    badge: 'PALING POPULER',
    features: [
      'Akses Penuh Bot Telegram (1 Tahun)',
      'Web Dashboard Pro Lengkap & Cepat',
      'Sinkronisasi Real-time Google Sheets',
      'Limit Anggaran & Notifikasi Boncos',
      'Analisis Grafik Pengeluaran Komprehensif',
      'Ekspor CSV & Spreadsheet Kustom',
      'Prioritas Fitur Baru & Customer Support'
    ]
  },
  lifetime: {
    id: 'lifetime',
    name: 'Lifetime (Akses Selamanya)',
    period: 'Akses Selamanya',
    price: 299000,
    originalPrice: 799000,
    durationDays: 36500, // 100 years
    description: 'Bayar sekali, nikmati akses seumur hidup tanpa biaya langganan berulang.',
    popular: false,
    badge: 'BEST VALUE',
    features: [
      'Akses Bot Telegram Seumur Hidup',
      'Web Dashboard Pro Tanpa Batas Waktu',
      'Sinkronisasi Google Sheets Otomatis',
      'Bebas Biaya Perpanjangan Selamanya',
      'Semua Fitur Pro + Semua Update Masa Depan',
      'VIP Priority Support di Telegram & WhatsApp',
      'Multi-device & Integrasi Google Drive'
    ]
  }
};

function generateOrderId() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${dateStr}-${rand}`;
}

function generateLicenseToken(planId) {
  const prefix = planId === 'lifetime' ? 'CASHMATE-LIFE' : planId === 'pro' ? 'CASHMATE-PRO' : 'CASHMATE-STARTER';
  const randPart1 = crypto.randomBytes(3).toString('hex').toUpperCase();
  const randPart2 = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${randPart1}-${randPart2}`;
}

const paymentService = {
  getPlans() {
    return Object.values(PLANS);
  },

  getPlanById(planId) {
    return PLANS[planId] || null;
  },

  createOrder({ planId, customerName, customerContact, paymentMethod = 'qris' }) {
    const plan = PLANS[planId];
    if (!plan) {
      throw new Error(`Paket '${planId}' tidak ditemukan.`);
    }

    const orderId = generateOrderId();
    const token = generateLicenseToken(planId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15 mins checkout timer

    // Mock payment details based on method
    let paymentDetails = {};
    if (paymentMethod === 'bca_va') {
      paymentDetails = {
        method: 'bca_va',
        name: 'BCA Virtual Account',
        accountNumber: `8277${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        instructions: 'Transfer ke nomor BCA Virtual Account di atas sebelum batas waktu.'
      };
    } else if (paymentMethod === 'mandiri_va') {
      paymentDetails = {
        method: 'mandiri_va',
        name: 'Mandiri Virtual Account',
        accountNumber: `88708${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        instructions: 'Transfer ke nomor Mandiri Virtual Account di atas melalui Mandiri Livin atau ATM.'
      };
    } else if (paymentMethod === 'gopay') {
      paymentDetails = {
        method: 'gopay',
        name: 'GoPay / E-Wallet',
        qrCode: `00020101021226590014ID.LINKAJA.WWW0118936000100000000000520454995802ID5918CASHMATE INDONESIA6012JAKARTA PUSAT61051011062070703A016304A1B2`,
        instructions: 'Buka aplikasi GoPay atau E-Wallet lainnya dan scan QRIS.'
      };
    } else {
      // Default: QRIS
      paymentDetails = {
        method: 'qris',
        name: 'QRIS (Semua E-Wallet & Mobile Banking)',
        qrCode: `00020101021226590014ID.LINKAJA.WWW0118936000100000000000520454995802ID5918CASHMATE INDONESIA6012JAKARTA PUSAT61051011062070703A016304A1B2`,
        instructions: 'Scan QRIS ini menggunakan aplikasi BCA, Mandiri, BRI, GoPay, OVO, DANA, atau ShopeePay Anda.'
      };
    }

    const order = {
      orderId,
      planId: plan.id,
      planName: plan.name,
      amount: plan.price,
      durationDays: plan.durationDays,
      customerName: customerName ? customerName.trim() : 'Pengguna Baru',
      customerContact: customerContact ? customerContact.trim() : '',
      paymentMethod,
      paymentDetails,
      token,
      status: 'pending', // 'pending' | 'paid' | 'expired'
      createdAt: now.toISOString(),
      expiresAt
    };

    const orders = loadOrders();
    orders.push(order);
    saveOrders(orders);

    return order;
  },

  getOrder(orderId) {
    const orders = loadOrders();
    return orders.find(o => o.orderId === orderId) || null;
  },

  simulatePayment(orderId) {
    const orders = loadOrders();
    const order = orders.find(o => o.orderId === orderId);
    if (!order) {
      throw new Error(`Pesanan dengan ID ${orderId} tidak ditemukan.`);
    }

    if (order.status === 'paid') {
      return {
        alreadyPaid: true,
        order,
        activation: this.getActivationDetails(order)
      };
    }

    order.status = 'paid';
    order.paidAt = new Date().toISOString();
    saveOrders(orders);

    // Register or pre-provision the user in userService with this token
    userService.provisionPaidUser({
      token: order.token,
      planId: order.planId,
      planName: order.planName,
      durationDays: order.durationDays,
      customerName: order.customerName,
      customerContact: order.customerContact,
      orderId: order.orderId
    });

    return {
      success: true,
      order,
      activation: this.getActivationDetails(order)
    };
  },

  getActivationDetails(order) {
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'wallet_saving_bot';
    const baseUrl = process.env.APP_URL || 'http://localhost:5173';
    return {
      token: order.token,
      planName: order.planName,
      botUsername,
      telegramDeepLink: `https://t.me/${botUsername}?start=${order.token}`,
      telegramActivationCommand: `/activate ${order.token}`,
      dashboardLoginUrl: `${baseUrl}/?auth=${order.token}`
    };
  },

  verifyToken(token) {
    if (!token) return null;
    const cleanToken = String(token).trim();
    const user = userService.getUserByAuthToken(cleanToken);
    if (!user) return null;

    return {
      valid: true,
      user: {
        firstName: user.firstName,
        username: user.username,
        status: user.status,
        plan: user.plan || 'Free Trial',
        subscriptionEndsAt: user.subscriptionEndsAt || user.trialEndsAt,
        spreadsheetId: user.spreadsheetId
      }
    };
  }
};

module.exports = paymentService;
