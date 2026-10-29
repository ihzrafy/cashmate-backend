const crypto = require('crypto');

/**
 * Generate realistic sample transactions distributed across current month and past months
 * to provide an immediate rich visualization experience.
 */
function generateSeedTransactions() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const transactions = [];

  const addTx = (daysAgo, type, amount, category, description) => {
    const d = new Date(year, month, now.getDate() - daysAgo, 12, 0, 0);
    transactions.push({
      id: crypto.randomUUID(),
      date: d.toISOString(),
      type,
      amount,
      category,
      description: description || category,
      createdAt: d.toISOString()
    });
  };

  // Past months historical anchors for monthly trends
  for (let m = 5; m >= 1; m -= 1) {
    const pastDate = new Date(year, month - m, 25);
    transactions.push({
      id: crypto.randomUUID(),
      date: new Date(year, month - m, 1, 9, 0).toISOString(),
      type: 'Income',
      amount: 12500000,
      category: 'Gaji',
      description: `Gaji Bulanan M-${m}`,
      createdAt: new Date(year, month - m, 1).toISOString()
    });

    // Expenses for past month
    const monthlyExpenses = [
      { cat: 'Makan & Minum', amt: 2800000 + (m * 80000) },
      { cat: 'Tagihan & Utilitas', amt: 1250000 },
      { cat: 'Transportasi', amt: 900000 + (m * 45000) },
      { cat: 'Belanja', amt: 1400000 - (m * 50000) },
      { cat: 'Hiburan', amt: 450000 }
    ];

    monthlyExpenses.forEach((exp, idx) => {
      const expDate = new Date(year, month - m, 5 + (idx * 4), 14, 0);
      transactions.push({
        id: crypto.randomUUID(),
        date: expDate.toISOString(),
        type: 'Expense',
        amount: exp.amt,
        category: exp.cat,
        description: `${exp.cat} M-${m}`,
        createdAt: expDate.toISOString()
      });
    });
  }

  // Current month transactions (Recent and active)
  // Income
  addTx(12, 'Income', 12500000, 'Gaji', 'Gaji Pokok Bulanan');
  addTx(6, 'Income', 3500000, 'Freelance', 'Proyek Redesign Landing Page');
  addTx(2, 'Income', 850000, 'Investasi', 'Dividen Reksadana Saham');

  // Expenses
  addTx(0, 'Expense', 45000, 'Makan & Minum', 'Makan Siang Nasi Padang + Es Teh');
  addTx(0, 'Expense', 32000, 'Makan & Minum', 'Kopi Susu Gula Aren');
  addTx(1, 'Expense', 150000, 'Transportasi', 'Isi Bensin Pertamax Full');
  addTx(2, 'Expense', 285000, 'Makan & Minum', 'Dinner Keluarga di Resto');
  addTx(3, 'Expense', 450000, 'Tagihan & Utilitas', 'Token Listrik PLN');
  addTx(4, 'Expense', 399000, 'Tagihan & Utilitas', 'Langganan Internet WiFi');
  addTx(5, 'Expense', 650000, 'Belanja', 'Kebutuhan Bulanan Supermarket');
  addTx(7, 'Expense', 120000, 'Hiburan', 'Nonton Bioskop XXI 2 Tiket');
  addTx(8, 'Expense', 45000, 'Transportasi', 'GrabCar Pulang Kantor');
  addTx(9, 'Expense', 186000, 'Belanja', 'Beli Kemeja Kerja Online');
  addTx(11, 'Expense', 85000, 'Makan & Minum', 'Makan Malam Sushi');

  return transactions;
}

const DEFAULT_BUDGETS = {
  'Makan & Minum': 3000000,
  'Transportasi': 1200000,
  'Tagihan & Utilitas': 1500000,
  'Belanja': 1500000,
  'Hiburan': 600000
};

module.exports = {
  generateSeedTransactions,
  DEFAULT_BUDGETS
};
