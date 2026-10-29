// Flexible regex supporting /in, /out, /in@bot, /out@bot, or plain "in", "out"
const COMMAND_REGEX = /^\/?(in|out)(?:@\w+)?\s+(\d+(?:[.,]\d+)?\s*(?:k|rb|ribu|jt|juta|m|mio)?|\d+(?:[.,\s]\d+)*)\s*(.*)$/i;

const CATEGORY_KEYWORDS = {
  'Makan & Minum': [
    'makan', 'minum', 'kopi', 'cafe', 'resto', 'restaurant', 'bakso', 'soto', 'nasi',
    'warteg', 'lunch', 'dinner', 'sarapan', 'breakfast', 'snack', 'gofood', 'grabfood',
    'shopeefood', 'es teh', 'susu', 'roti', 'ayam', 'mie', 'indomie'
  ],
  'Transportasi': [
    'bensin', 'pertamax', 'pertalite', 'solar', 'ojol', 'grab', 'gojek', 'maxim',
    'tol', 'parkir', 'kereta', 'krl', 'mrt', 'lrt', 'bus', 'transjakarta', 'angkot',
    'tiket', 'servis', 'oli', 'tambal'
  ],
  'Tagihan & Utilitas': [
    'listrik', 'pln', 'air', 'pdam', 'wifi', 'internet', 'indihome', 'biznet', 'myrepublic',
    'pulsa', 'kuota', 'bpjs', 'pbb', 'sewa', 'kost', 'kontrakan', 'cicilan', 'kartu kredit'
  ],
  'Belanja': [
    'baju', 'sepatu', 'belanja', 'supermarket', 'pasar', 'indomaret', 'alfamart',
    'lazada', 'shopee', 'tokopedia', 'mall', 'beli', 'celana', 'jaket', 'tas', 'skincare'
  ],
  'Hiburan': [
    'nonton', 'bioskop', 'xxi', 'cgv', 'netflix', 'spotify', 'game', 'steam',
    'liburan', 'hotel', 'villa', 'youtube', 'karaoke', 'wisata'
  ],
  'Kesehatan': [
    'obat', 'dokter', 'apotek', 'vitamin', 'klinik', 'rs', 'rumah sakit', 'gym', 'fitness'
  ],
  'Investasi & Tabungan': [
    'saham', 'reksadana', 'crypto', 'emas', 'tabungan', 'deposito', 'bibit', 'bareksa', 'ajaib'
  ]
};

const INCOME_CATEGORY_KEYWORDS = {
  'Gaji': ['gaji', 'salary', 'payroll', 'upah'],
  'Freelance': ['freelance', 'proyek', 'project', 'client', 'klien', 'jasa', 'desain', 'coding'],
  'Investasi': ['dividen', 'capital gain', 'bunga', 'profit', 'cuan', 'hasil investasi'],
  'Bonus & Hadiah': ['bonus', 'thr', 'reward', 'hadiah', 'angpao', 'tips'],
  'Bisnis & Penjualan': ['jualan', 'toko', 'omset', 'penjualan', 'orderan', 'laba']
};

function parseAmount(rawStr) {
  if (!rawStr) return null;
  const str = String(rawStr).trim().toLowerCase();

  // Handle shorthand units (k, rb, jt, etc.)
  let multiplier = 1;
  let cleanNum = str;

  if (str.endsWith('k') || str.endsWith('rb') || str.endsWith('ribu')) {
    multiplier = 1000;
    cleanNum = str.replace(/(k|rb|ribu)$/, '').trim();
  } else if (str.endsWith('jt') || str.endsWith('juta') || str.endsWith('m') || str.endsWith('mio')) {
    multiplier = 1000000;
    cleanNum = str.replace(/(jt|juta|m|mio)$/, '').trim();
  }

  // If there is a unit multiplier (e.g. 1.5jt or 2,5k)
  if (multiplier > 1) {
    cleanNum = cleanNum.replace(',', '.');
    const val = parseFloat(cleanNum);
    return Number.isFinite(val) ? Math.round(val * multiplier) : null;
  }

  // No unit multiplier: Indonesian currency formatting (e.g. 100.000, 100,000, 1.250.000)
  // Remove optional trailing cents like ,00 or .00
  cleanNum = cleanNum.replace(/[,.]00$/, '');

  // Strip all thousand separators (. or , or spaces)
  const numericOnly = cleanNum.replace(/[^0-9]/g, '');
  const parsed = parseInt(numericOnly, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function detectCategory(description, type) {
  if (!description) {
    return type === 'Income' ? 'Lain-lain' : 'Kebutuhan Harian';
  }

  const text = description.toLowerCase();

  if (type === 'Income') {
    for (const [category, keywords] of Object.entries(INCOME_CATEGORY_KEYWORDS)) {
      if (keywords.some(kw => text.includes(kw))) {
        return category;
      }
    }
    return 'Pemasukan Lain';
  }

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      return category;
    }
  }

  return 'Lain-lain';
}

function parseTelegramMessage(text) {
  if (!text) {
    return null;
  }

  const match = COMMAND_REGEX.exec(text.trim());
  if (!match) {
    return null;
  }

  const command = match[1].toLowerCase();
  const rawAmount = match[2];
  const rawDescription = (match[3] || '').trim();
  const amount = parseAmount(rawAmount);

  if (!amount || amount <= 0) {
    return null;
  }

  const type = command === 'in' ? 'Income' : 'Expense';
  const category = detectCategory(rawDescription, type);
  const description = rawDescription || category;

  return {
    type,
    amount,
    category,
    description
  };
}

module.exports = {
  parseAmount,
  detectCategory,
  parseTelegramMessage
};
