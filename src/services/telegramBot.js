const { Telegraf, Markup } = require('telegraf');
const storageEngine = require('./storageEngine');
const userService = require('./userService');
const sheetsService = require('./sheetsService');
const { parseTelegramMessage } = require('../utils/telegramParser');
const { formatCurrency } = require('../utils/format');

function calculateBalance(transactions) {
  return transactions.reduce((total, transaction) => {
    if (transaction.type === 'Income') {
      return total + transaction.amount;
    }
    return total - transaction.amount;
  }, 0);
}

function getWebUrl() {
  return process.env.APP_URL || 'http://localhost:5173';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'your-telegram-token') {
    console.log('ℹ️ TELEGRAM_BOT_TOKEN belum diset. Telegram bot dinonaktifkan (aplikasi tetap berjalan normal).');
    return null;
  }

  try {
    const bot = new Telegraf(token);

    // Helper to resolve user
    const resolveUser = (ctx) => {
      if (!ctx.from) return null;
      return userService.registerOrUpdateUser({
        telegramId: ctx.from.id,
        username: ctx.from.username || '',
        firstName: ctx.from.first_name || '',
        lastName: ctx.from.last_name || ''
      });
    };

    // Handler for activating license token
    const handleActivate = async (ctx, customToken = null) => {
      const token = customToken || (ctx.message && ctx.message.text ? ctx.message.text.replace(/^\/(activate|redeem)\s*/i, '').trim() : '');
      if (!token) {
        return ctx.replyWithHTML(`
⚠️ <b>Cara Aktivasi Token CashMate:</b>
Ketik: <code>/activate &lt;KODE_TOKEN_ANDA&gt;</code>

<i>Contoh: <code>/activate CASHMATE-PRO-8A2F-9C1D</code></i>

Belum memiliki token? Beli paket di website kami:
👉 ${getWebUrl()}
`);
      }

      try {
        const activatedUser = userService.activateTokenForTelegramUser({
          telegramId: ctx.from.id,
          username: ctx.from.username || '',
          firstName: ctx.from.first_name || '',
          lastName: ctx.from.last_name || ''
        }, token);

        const expiryStr = activatedUser.subscriptionEndsAt 
          ? new Date(activatedUser.subscriptionEndsAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
          : 'Akses Selamanya';
        
        const webUrl = `${getWebUrl()}/?auth=${activatedUser.authToken}`;

        await ctx.replyWithHTML(`
🎉 <b>SELAMAT! AKUN ANDA TELAH AKTIF!</b>
━━━━━━━━━━━━━━━━━━━━
👑 <b>Paket:</b> ${escapeHtml(activatedUser.plan || 'CashMate Pro')}
📅 <b>Masa Aktif:</b> s.d. <b>${expiryStr}</b>
🔑 <b>Token Akses:</b> <code>${activatedUser.authToken}</code>
━━━━━━━━━━━━━━━━━━━━
✨ <b>Fitur yang Kini Terbuka:</b>
• Pencatatan transaksi tanpa batas
• Web Dashboard Interaktif & Analitik Lengkap
• Sinkronisasi otomatis ke Google Sheets pribadi
• Limit Anggaran bulanan & Notifikasi Boncos

🌐 <b>Buka Web Dashboard Pribadi Anda:</b>
👉 <a href="${webUrl}">${webUrl}</a>

Ketik contoh transaksi pertamamu:
<code>/out 25k Kopi Kenangan</code>
`);
      } catch (err) {
        await ctx.reply(`❌ Aktivasi gagal: ${err.message}\n\nPastikan Anda menyalin kode token dengan benar atau dapatkan token di ${getWebUrl()}`);
      }
    };

    bot.command('activate', handleActivate);
    bot.command('redeem', handleActivate);

    // /status command (Account subscription & token status)
    bot.command('status', async (ctx) => {
      try {
        const user = resolveUser(ctx);
        const isPro = user.status === 'pro';
        const planName = user.plan || (isPro ? 'CashMate Pro' : 'Free Trial 7 Hari');
        const expiryDate = user.subscriptionEndsAt || user.trialEndsAt;
        const expiryStr = expiryDate 
          ? new Date(expiryDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
          : '-';
        const webUrl = `${getWebUrl()}/?auth=${user.authToken}`;
        const sheetText = user.spreadsheetId ? '✅ Terhubung ke Google Sheets' : '⚠️ Belum Terhubung (Penyimpanan Cloud Lokal)';

        const msg = `
👤 <b>Status Akun CashMate Anda:</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Nama:</b> ${escapeHtml(user.firstName)} (@${escapeHtml(user.username || 'user')})
💎 <b>Status:</b> ${isPro ? '👑 PRO MEMBER' : '⏳ MASA PERCOBAAN (TRIAL)'}
📦 <b>Paket:</b> ${escapeHtml(planName)}
📅 <b>Berlaku Hingga:</b> ${expiryStr}
📊 <b>Google Sheets:</b> ${sheetText}
🔑 <b>Token Akses:</b> <code>${user.authToken}</code>
━━━━━━━━━━━━━━━━━━━━
🌐 <b>Dashboard Web Anda:</b>
👉 <a href="${webUrl}">${webUrl}</a>

${!isPro ? `💡 <i>Ingin upgrade ke Pro tanpa batas? Beli token resmi di: ${getWebUrl()}</i>` : ''}
`;
        await ctx.replyWithHTML(msg);
      } catch (err) {
        await ctx.reply(`❌ Gagal mengambil status akun: ${err.message}`);
      }
    });

    // /start command (Comprehensive Onboarding Guide + Deep Linking Token Activation)
    bot.start(async (ctx) => {
      // Check if start command has token payload (e.g. /start CASHMATE-PRO-...)
      const textParts = (ctx.message && ctx.message.text ? ctx.message.text.trim().split(/\s+/) : []);
      const startPayload = ctx.payload || (textParts.length > 1 ? textParts[1] : null);

      if (startPayload && (startPayload.startsWith('CASHMATE') || startPayload.startsWith('usr_'))) {
        return handleActivate(ctx, startPayload);
      }

      const user = resolveUser(ctx);
      const webUrl = `${getWebUrl()}/?auth=${user.authToken}`;
      const isPublicHttps = webUrl.startsWith('https://') && !webUrl.includes('localhost') && !webUrl.includes('127.0.0.1');

      const welcome = `
👋 <b>Halo ${escapeHtml(ctx.from.first_name || 'Teman')}!</b>

Selamat datang di <b>CashMate</b> — asisten pencatat keuangan pribadi otomatis Anda! 💳✨

Anda bisa mencatat pemasukan & pengeluaran hanya dalam <b>3 detik</b> langsung dari Telegram tanpa perlu membuka aplikasi yang berat.

━━━━━━━━━━━━━━━━━━━━
🚀 <b>CARA CEPAT MENCATAT:</b>

1️⃣ <b>Mencatat Pengeluaran (/out)</b>
Ketik <code>/out [jumlah] [keterangan]</code>
• Contoh: <code>/out 25k Kopi Kenangan</code>
• Contoh: <code>/out 50.000 Bensin Pertamax</code>
• Contoh: <code>/out 150rb Belanja Bulanan</code>

2️⃣ <b>Mencatat Pemasukan (/in)</b>
Ketik <code>/in [jumlah] [keterangan]</code>
• Contoh: <code>/in 5000000 Gaji Bulanan</code>
• Contoh: <code>/in 1.5jt Freelance Desain</code>
• Contoh: <code>/in 100k Hadiah Ulang Tahun</code>

<i>💡 Tips: Bot otomatis mengenali singkatan "k", "rb", "jt", titik/koma, dan otomatis mendeteksi kategori pengeluaran Anda!</i>

━━━━━━━━━━━━━━━━━━━━
📊 <b>MENU & PERINTAH PRAKTIS:</b>
• <code>/saldo</code> — Cek total saldo & cashflow bulan ini
• <code>/laporan</code> — Laporan bulanan & pengeluaran terbesar
• <code>/transaksi</code> — Lihat 5 transaksi terakhir Anda
• <code>/budget</code> — Cek limit anggaran kategori Anda
• <code>/status</code> — Cek status paket & token lisensi Anda
• <code>/activate &lt;token&gt;</code> — Aktivasi paket Pro
• <code>/web</code> — Buka Web Dashboard pribadi Anda
• <code>/help</code> — Panduan lengkap penggunaan bot

━━━━━━━━━━━━━━━━━━━━
🌐 <b>DASHBOARD GRAFIK PRIBADI:</b>
Buka grafik analitik keuangan Anda di browser:
👉 <a href="${webUrl}">${webUrl}</a>

📑 <b>HUBUNGKAN KE GOOGLE SHEETS:</b>
Ingin data otomatis masuk ke spreadsheet milik Anda sendiri?
1. Buat spreadsheet di <a href="https://sheets.google.com">Google Sheets</a>.
2. Bagikan (Editor) ke: <code>sheets-bot@gen-lang-client-0257398658.iam.gserviceaccount.com</code>
3. Kirim ke bot: <code>/connect &lt;link_spreadsheet&gt;</code>

━━━━━━━━━━━━━━━━━━━━
👇 <b>Yuk coba sekarang!</b> Ketik contoh transaksi pertama:
<code>/out 25k Kopi Kenangan</code>
`;

      if (isPublicHttps) {
        await ctx.replyWithHTML(welcome, Markup.inlineKeyboard([
          [Markup.button.url('🚀 Buka Dashboard Web Saya', webUrl)]
        ]));
      } else {
        await ctx.replyWithHTML(welcome);
      }
    });

    // /web or /dashboard command (Magic Link Login)
    const handleWebCommand = async (ctx) => {
      const user = resolveUser(ctx);
      const webUrl = `${getWebUrl()}/?auth=${user.authToken}`;
      const isPublicHttps = webUrl.startsWith('https://') && !webUrl.includes('localhost') && !webUrl.includes('127.0.0.1');

      const msg = `
🌐 <b>Dashboard Keuangan Pribadi Anda:</b>

Klik tautan di bawah ini untuk langsung membuka dashboard analitik & riwayat transaksi Anda:
👉 <a href="${webUrl}">${webUrl}</a>

<i>Link ini bersifat rahasia khusus untuk akun Anda.</i>
`;

      if (isPublicHttps) {
        await ctx.replyWithHTML(msg, Markup.inlineKeyboard([
          [Markup.button.url('🚀 Buka Dashboard Web Saya', webUrl)]
        ]));
      } else {
        await ctx.replyWithHTML(msg);
      }
    };

    bot.command('web', handleWebCommand);
    bot.command('dashboard', handleWebCommand);
    bot.command('login', handleWebCommand);

    // /help command
    bot.help(async (ctx) => {
      const helpText = `
💡 <b>Panduan Lengkap Penggunaan Bot</b>

1️⃣ <b>Mencatat Transaksi:</b>
   • <code>/in 5000000 Gaji Kantor</code> (Pemasukan)
   • <code>/out 25k Kopi Kenangan</code> (Pengeluaran)
   • <code>/out 50.000 Bensin</code>

2️⃣ <b>Cek Keuangan Pribadi:</b>
   • <code>/saldo</code> : Total saldo & ringkasan bulan ini
   • <code>/laporan</code> : Ringkasan pemasukan vs pengeluaran
   • <code>/transaksi</code> : 5 transaksi terakhir Anda
   • <code>/budget</code> : Status limit anggaran kategori Anda
   • <code>/web</code> : Dapatkan link login dashboard web

3️⃣ <b>Google Sheets:</b>
   • <code>/connect &lt;link_spreadsheet&gt;</code> : Hubungkan Google Sheets Anda
   • <code>/desain</code> atau <code>/format</code> : Rapikan & perindah tampilan Spreadsheet Anda
`;
      await ctx.replyWithHTML(helpText);
    });

    // /saldo command (user-specific)
    bot.command('saldo', async (ctx) => {
      try {
        const user = resolveUser(ctx);
        const all = await storageEngine.getAllTransactions(user);
        const balance = calculateBalance(all);

        const now = new Date();
        const curMonth = now.getMonth();
        const curYear = now.getFullYear();

        let monthIn = 0;
        let monthOut = 0;

        all.forEach(t => {
          const d = new Date(t.date);
          if (d.getMonth() === curMonth && d.getFullYear() === curYear) {
            if (t.type === 'Income') monthIn += t.amount;
            else monthOut += t.amount;
          }
        });

        const sheetStatus = user.spreadsheetId ? '📊 Google Sheets Terhubung' : '💾 Penyimpanan Cloud Pribadi';

        const msg = `
💰 <b>Ringkasan Saldo Anda:</b>
━━━━━━━━━━━━━━━━━━━━
💳 <b>Total Saldo:</b> ${formatCurrency(balance)}

🟢 <b>Pemasukan Bulan Ini:</b> ${formatCurrency(monthIn)}
🔴 <b>Pengeluaran Bulan Ini:</b> ${formatCurrency(monthOut)}
📊 <b>Sisa Bersih:</b> ${formatCurrency(monthIn - monthOut)}
━━━━━━━━━━━━━━━━━━━━
<i>${sheetStatus}</i>
`;
        await ctx.replyWithHTML(msg);
      } catch (err) {
        await ctx.reply(`❌ Gagal mengambil data saldo: ${err.message}`);
      }
    });

    // /laporan command (user-specific)
    bot.command('laporan', async (ctx) => {
      try {
        const user = resolveUser(ctx);
        const all = await storageEngine.getAllTransactions(user);
        const now = new Date();
        const curMonth = now.getMonth();
        const curYear = now.getFullYear();

        let monthIn = 0;
        let monthOut = 0;
        const catMap = {};

        all.forEach(t => {
          const d = new Date(t.date);
          if (d.getMonth() === curMonth && d.getFullYear() === curYear) {
            if (t.type === 'Income') {
              monthIn += t.amount;
            } else {
              monthOut += t.amount;
              catMap[t.category] = (catMap[t.category] || 0) + t.amount;
            }
          }
        });

        const topCats = Object.entries(catMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([cat, amt]) => `• ${escapeHtml(cat)}: ${formatCurrency(amt)}`)
          .join('\n');

        const savingsRate = monthIn > 0 ? Math.round(((monthIn - monthOut) / monthIn) * 100) : 0;

        const msg = `
📊 <b>Laporan Keuangan (${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}):</b>
━━━━━━━━━━━━━━━━━━━━
🟢 <b>Total Masuk:</b> ${formatCurrency(monthIn)}
🔴 <b>Total Keluar:</b> ${formatCurrency(monthOut)}
📈 <b>Rasio Tabungan:</b> ${savingsRate}%
━━━━━━━━━━━━━━━━━━━━
<b>5 Pengeluaran Terbesar:</b>
${topCats || 'Belum ada pengeluaran bulan ini.'}
`;
        await ctx.replyWithHTML(msg);
      } catch (err) {
        await ctx.reply(`❌ Gagal membuat laporan: ${err.message}`);
      }
    });

    // /transaksi command (user-specific)
    bot.command('transaksi', async (ctx) => {
      try {
        const user = resolveUser(ctx);
        const { data } = await storageEngine.getTransactions({ limit: 5 }, user);

        if (data.length === 0) {
          return ctx.reply('Belum ada transaksi tercatat. Mulai dengan /out 25k Kopi');
        }

        const lines = data.map(t => {
          const sign = t.type === 'Income' ? '🟢 +' : '🔴 -';
          const d = new Date(t.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
          return `${sign} <b>${formatCurrency(t.amount)}</b> - ${escapeHtml(t.description || t.category)} <i>(${d})</i>`;
        }).join('\n');

        const msg = `
📋 <b>5 Transaksi Terakhir Anda:</b>
━━━━━━━━━━━━━━━━━━━━
${lines}
━━━━━━━━━━━━━━━━━━━━
`;
        await ctx.replyWithHTML(msg);
      } catch (err) {
        await ctx.reply(`❌ Gagal memuat transaksi: ${err.message}`);
      }
    });

    // /budget command (user-specific)
    bot.command('budget', async (ctx) => {
      try {
        const user = resolveUser(ctx);
        const budgets = storageEngine.getBudgets(user);
        const all = await storageEngine.getAllTransactions(user);
        const now = new Date();
        const curMonth = now.getMonth();
        const curYear = now.getFullYear();

        const catSpent = {};
        all.forEach(t => {
          const d = new Date(t.date);
          if (t.type === 'Expense' && d.getMonth() === curMonth && d.getFullYear() === curYear) {
            catSpent[t.category] = (catSpent[t.category] || 0) + t.amount;
          }
        });

        const lines = Object.entries(budgets).map(([cat, limit]) => {
          const spent = catSpent[cat] || 0;
          const pct = Math.round((spent / limit) * 100);
          const icon = pct > 100 ? '🚨' : pct > 80 ? '⚠️' : '✅';
          return `${icon} <b>${escapeHtml(cat)}</b>: ${formatCurrency(spent)} / ${formatCurrency(limit)} (${pct}%)`;
        }).join('\n');

        const msg = `
🎯 <b>Status Anggaran Bulan Ini:</b>
━━━━━━━━━━━━━━━━━━━━
${lines || 'Belum ada batas anggaran yang diatur.'}
━━━━━━━━━━━━━━━━━━━━
`;
        await ctx.replyWithHTML(msg);
      } catch (err) {
        await ctx.reply(`❌ Gagal mengambil status budget: ${err.message}`);
      }
    });

    // /connect command or sheet URL handler
    bot.command('connect', async (ctx) => {
      const text = ctx.message.text.replace(/^\/connect\s*/i, '').trim();
      if (!text) {
        return ctx.replyWithHTML(`
⚠️ <b>Cara Menghubungkan Google Sheets:</b>
1. Buat Spreadsheet di Google Sheets.
2. Klik tombol <b>Bagikan / Share</b> (Editor) ke email robot:
<code>sheets-bot@gen-lang-client-0257398658.iam.gserviceaccount.com</code>
3. Kirim perintah:
<code>/connect &lt;link_spreadsheet_kamu&gt;</code>
`);
      }

      const cleanId = userService.extractSpreadsheetId(text);
      if (!cleanId) {
        return ctx.reply('❌ Link Google Sheets tidak valid. Pastikan menyalin link lengkap dari browser.');
      }

      ctx.sendChatAction('typing').catch(() => {});

      try {
        await sheetsService.verifySheet(cleanId);
        // Automatically beautify and format sheet layout
        await sheetsService.formatAndDesignSheet(cleanId).catch(err => {
          console.warn('[Bot] Auto format sheet notice:', err.message);
        });

        const user = resolveUser(ctx);
        userService.updateSpreadsheetId(user.telegramId, cleanId);
        user.spreadsheetId = cleanId;

        await storageEngine.syncLocalToSheets(user);

        await ctx.replyWithHTML(`
✅ <b>Google Sheets Berhasil Terhubung & Didesain Rapi!</b>
━━━━━━━━━━━━━━━━━━━━
📊 <b>ID Spreadsheet:</b> <code>${cleanId}</code>
🎨 <b>Tampilan Otomatis:</b> Header Emerald beku (frozen), lebar kolom presisi, format nominal Rupiah otomatis.
🚀 Semua transaksi baru Anda otomatis tercatat langsung ke Google Sheets Anda!
`);
      } catch (err) {
        await ctx.reply(`❌ Gagal menghubungkan: ${err.message}\nPastikan Anda sudah membagikan spreadsheet (akses Editor) ke email robot kami.`);
      }
    });

    // /desain or /format command
    bot.command(['desain', 'format'], async (ctx) => {
      const user = resolveUser(ctx);
      const sheetId = user.spreadsheetId || process.env.SPREADSHEET_ID;

      if (!sheetId) {
        return ctx.replyWithHTML(`
⚠️ <b>Google Sheets belum terhubung!</b>
Hubungkan spreadsheet Anda terlebih dahulu dengan perintah:
<code>/connect &lt;link_spreadsheet&gt;</code>
`);
      }

      ctx.sendChatAction('typing').catch(() => {});

      try {
        await ctx.reply('🎨 Sedang merapikan dan mendesain Google Sheets Anda...');
        await sheetsService.formatAndDesignSheet(sheetId);
        await ctx.replyWithHTML(`
✨ <b>Google Sheets Berhasil Didesain Cantik & Rapi!</b>
━━━━━━━━━━━━━━━━━━━━
🎨 <b>Detail Desain yang Diterapkan:</b>
• 🟢 <b>Header:</b> Emerald gelap elegan + teks putih tebal (Sticky/Frozen)
• 📏 <b>Lebar Kolom:</b> Disesuaikan proporsional (ID, Tanggal, Jenis, Jumlah, Kategori, Keterangan)
• 💰 <b>Format Mata Uang:</b> Kolom nominal otomatis berformat <code>Rp #,##0</code>
• 📐 <b>Posisi Teks:</b> Tanggal & Jenis rata tengah, Nominal rata kanan
• 📊 <b>Gridlines:</b> Garis pembatas sel aktif rapi

Buka file Google Sheets Anda untuk melihat perubahannya! 🚀
`);
      } catch (err) {
        await ctx.reply(`❌ Gagal mendesain spreadsheet: ${err.message}`);
      }
    });

    // General text handler for /in and /out
    bot.on('text', async (ctx) => {
      const message = (ctx.message && ctx.message.text) || '';
      const user = resolveUser(ctx);

      // Check if user sent a raw Google Sheets link
      if (message.includes('docs.google.com/spreadsheets/d/')) {
        const cleanId = userService.extractSpreadsheetId(message);
        if (cleanId) {
          ctx.sendChatAction('typing').catch(() => {});
          try {
            await sheetsService.verifySheet(cleanId);
            await sheetsService.formatAndDesignSheet(cleanId).catch(() => {});
            userService.updateSpreadsheetId(user.telegramId, cleanId);
            user.spreadsheetId = cleanId;
            await storageEngine.syncLocalToSheets(user);

            return ctx.replyWithHTML(`
✅ <b>Google Sheets Berhasil Terhubung & Didesain!</b>
━━━━━━━━━━━━━━━━━━━━
ID Spreadsheet: <code>${cleanId}</code>
Mulai sekarang, setiap kali Anda mencatat, datanya otomatis masuk dengan format rapi ke Google Sheets Anda!
`);
          } catch (err) {
            return ctx.reply(`❌ Gagal menghubungkan: ${err.message}\nPastikan Anda sudah membagikan spreadsheet (akses Editor) ke email robot kami:\nsheets-bot@gen-lang-client-0257398658.iam.gserviceaccount.com`);
          }
        }
      }

      ctx.sendChatAction('typing').catch(() => {});

      const parsed = parseTelegramMessage(message);
      if (!parsed) {
        const lower = message.trim().toLowerCase();
        if (lower.startsWith('/') || lower.startsWith('in') || lower.startsWith('out')) {
          await ctx.reply('⚠️ Format tidak dikenali. Gunakan contoh:\n/in 50000 Gaji\n/out 15k Kopi\n/in 1.5jt Freelance\n\nKetik /web untuk buka dashboard web Anda.');
        }
        return;
      }

      try {
        await storageEngine.createTransaction({
          type: parsed.type,
          amount: parsed.amount,
          category: parsed.category,
          description: parsed.description,
          date: new Date().toISOString()
        }, user);

        const all = await storageEngine.getAllTransactions(user);
        const balance = calculateBalance(all);
        const icon = parsed.type === 'Income' ? '🟢' : '🔴';

        const replyHtml = `${icon} <b>Berhasil Dicatat!</b>
━━━━━━━━━━━━━━━━━━━━
• <b>Jenis:</b> ${parsed.type}
• <b>Jumlah:</b> ${formatCurrency(parsed.amount)}
• <b>Kategori:</b> ${escapeHtml(parsed.category)}
• <b>Keterangan:</b> ${escapeHtml(parsed.description)}
━━━━━━━━━━━━━━━━━━━━
💳 <b>Sisa Saldo:</b> ${formatCurrency(balance)}`;

        try {
          await ctx.replyWithHTML(replyHtml);
        } catch {
          await ctx.reply(
            `${icon} Berhasil Dicatat!\n--------------------\n• Jenis: ${parsed.type}\n• Jumlah: ${formatCurrency(parsed.amount)}\n• Kategori: ${parsed.category}\n• Keterangan: ${parsed.description}\n--------------------\n💳 Sisa Saldo: ${formatCurrency(balance)}`
          );
        }

        console.log(`✅ [User @${user.username || user.telegramId}] Sukses mencatat ${parsed.type}: ${formatCurrency(parsed.amount)} (${parsed.description})`);
      } catch (error) {
        console.error('❌ Gagal mencatat transaksi Telegram:', error.message);
        await ctx.reply(`❌ Gagal mencatat transaksi: ${error.message}`);
      }
    });

    bot.catch((err, ctx) => {
      console.warn(`⚠️ [TelegramBot] Error saat memproses pesan dari @${ctx.from?.username || ctx.from?.first_name}:`, err.message);
    });

    // Register official slash command suggestions in Telegram
    bot.telegram.setMyCommands([
      { command: 'out', description: 'Catat pengeluaran (misal: /out 25k Kopi)' },
      { command: 'in', description: 'Catat pemasukan (misal: /in 5jt Gaji)' },
      { command: 'saldo', description: 'Cek total saldo & cashflow' },
      { command: 'laporan', description: 'Laporan bulanan & pengeluaran terbesar' },
      { command: 'transaksi', description: 'Lihat 5 transaksi terakhir' },
      { command: 'budget', description: 'Cek status limit anggaran' },
      { command: 'status', description: 'Cek status paket & token lisensi Anda' },
      { command: 'activate', description: 'Aktivasi token paket Pro' },
      { command: 'web', description: 'Buka Dashboard Web pribadi' },
      { command: 'connect', description: 'Hubungkan Google Sheets pribadi' },
      { command: 'help', description: 'Panduan lengkap' }
    ]).catch((err) => console.warn('⚠️ Gagal mengatur menu commands Telegram:', err.message));

    bot.launch()
      .then(() => console.log('🤖 Telegram Bot Multi-Tenant aktif dan siap melayani pengguna!'))
      .catch((err) => console.warn('⚠️ Gagal menjalankan Telegram Bot:', err.message));

    return bot;
  } catch (error) {
    console.warn('⚠️ Inisialisasi Telegram Bot error:', error.message);
    return null;
  }
}

module.exports = {
  startTelegramBot
};
