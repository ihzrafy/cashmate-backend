const fs = require('fs');
const { google } = require('googleapis');
const crypto = require('crypto');

let sheetsClientPromise = null;
const verifiedSheets = new Set();
const sheetsCacheMap = new Map(); // Map<spreadsheetId, { data: [], time: number }>
const CACHE_TTL_MS = 20000;

const HEADERS = ['ID', 'Tanggal', 'Jenis', 'Jumlah', 'Kategori', 'Keterangan', 'Created_At'];

function getCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
  if (!keyPath || !fs.existsSync(keyPath)) {
    throw new Error(`Google service account file not found at: ${keyPath || 'none'}`);
  }

  const raw = fs.readFileSync(keyPath, 'utf8');
  return JSON.parse(raw);
}

function resolveSpreadsheetId(idOrUrl) {
  const raw = idOrUrl || process.env.SPREADSHEET_ID || '';
  const match = String(raw).match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : String(raw).trim();
}

async function getSheetsClient() {
  if (!sheetsClientPromise) {
    sheetsClientPromise = (async () => {
      const credentials = getCredentials();
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
      const authClient = await auth.getClient();
      return google.sheets({ version: 'v4', auth: authClient });
    })();
  }

  return sheetsClientPromise;
}

function parseAmount(value) {
  const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : 0;
}

async function verifySheet(customSpreadsheetId) {
  const spreadsheetId = resolveSpreadsheetId(customSpreadsheetId);
  const targetSheetName = process.env.SHEET_NAME || 'Transactions';

  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID tidak ditemukan');
  }

  if (verifiedSheets.has(spreadsheetId)) {
    return true;
  }

  const sheets = await getSheetsClient();

  // Check if targetSheetName exists, if not create it
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetList = meta.data.sheets || [];
    const exists = sheetList.some(s => s.properties && s.properties.title === targetSheetName);

    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: targetSheetName
                }
              }
            }
          ]
        }
      });
    }
  } catch (err) {
    console.warn(`[SheetsService] Verifikasi tab ${targetSheetName} fallback:`, err.message);
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${targetSheetName}!A1:G1`
  });

  const headerRow = response.data.values && response.data.values[0];
  if (!headerRow || headerRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${targetSheetName}!A1:G1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [HEADERS]
      }
    });
  }

  verifiedSheets.add(spreadsheetId);
  return true;
}

async function getTransactions(customSpreadsheetId) {
  const spreadsheetId = resolveSpreadsheetId(customSpreadsheetId);
  const sheetName = process.env.SHEET_NAME || 'Transactions';

  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID belum dikonfigurasi.');
  }

  // Check in-memory cache
  const cached = sheetsCacheMap.get(spreadsheetId);
  if (cached && (Date.now() - cached.time < CACHE_TTL_MS)) {
    return cached.data;
  }

  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:G`
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) {
    sheetsCacheMap.set(spreadsheetId, { data: [], time: Date.now() });
    return [];
  }

  const dataRows = rows.slice(1);

  const transactions = dataRows
    .filter(row => row[0] && row[0].trim())
    .map((row) => ({
      id: row[0] || '',
      date: row[1] || '',
      type: row[2] || 'Expense',
      amount: parseAmount(row[3]),
      category: row[4] || 'Uncategorized',
      description: row[5] || row[4] || 'Uncategorized',
      createdAt: row[6] || row[1] || ''
    }));

  sheetsCacheMap.set(spreadsheetId, { data: transactions, time: Date.now() });
  return transactions;
}

async function appendTransaction(customSpreadsheetId, { id, date, type, amount, category, description, createdAt }) {
  const spreadsheetId = resolveSpreadsheetId(customSpreadsheetId);
  const sheetName = process.env.SHEET_NAME || 'Transactions';

  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID belum dikonfigurasi.');
  }

  const sheets = await getSheetsClient();

  const txId = id || crypto.randomUUID();
  const txDate = date || new Date().toISOString();
  const txCreated = createdAt || new Date().toISOString();
  const txDesc = description || category || '';

  const row = [txId, txDate, type, amount, category, txDesc, txCreated];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:G`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [row]
    }
  });

  const txObj = {
    id: txId,
    date: txDate,
    type,
    amount,
    category,
    description: txDesc,
    createdAt: txCreated
  };

  // Update in-memory cache immediately
  const cached = sheetsCacheMap.get(spreadsheetId);
  if (cached) {
    cached.data.unshift(txObj);
    cached.time = Date.now();
  } else {
    sheetsCacheMap.set(spreadsheetId, { data: [txObj], time: Date.now() });
  }

  return txObj;
}

async function updateTransaction(customSpreadsheetId, id, updates) {
  const spreadsheetId = resolveSpreadsheetId(customSpreadsheetId);
  const sheetName = process.env.SHEET_NAME || 'Transactions';

  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:G`
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((r, idx) => idx > 0 && r[0] === id);

  if (rowIndex === -1) {
    throw new Error(`Transaction ${id} not found in Google Sheets`);
  }

  const currentRow = rows[rowIndex];
  const updatedRow = [
    id,
    updates.date || currentRow[1],
    updates.type || currentRow[2],
    updates.amount !== undefined ? updates.amount : currentRow[3],
    updates.category || currentRow[4],
    updates.description !== undefined ? updates.description : currentRow[5],
    currentRow[6] || new Date().toISOString()
  ];

  const targetRowNumber = rowIndex + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${targetRowNumber}:G${targetRowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [updatedRow]
    }
  });

  const updatedObj = {
    id,
    date: updatedRow[1],
    type: updatedRow[2],
    amount: parseAmount(updatedRow[3]),
    category: updatedRow[4],
    description: updatedRow[5],
    createdAt: updatedRow[6]
  };

  // Invalidate cache
  sheetsCacheMap.delete(spreadsheetId);

  return updatedObj;
}

async function deleteTransaction(customSpreadsheetId, id) {
  const spreadsheetId = resolveSpreadsheetId(customSpreadsheetId);
  const sheetName = process.env.SHEET_NAME || 'Transactions';

  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:G`
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((r, idx) => idx > 0 && r[0] === id);

  if (rowIndex === -1) {
    throw new Error(`Transaction ${id} not found in Google Sheets`);
  }

  const targetRowNumber = rowIndex + 1;
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A${targetRowNumber}:G${targetRowNumber}`
  });

  // Invalidate cache
  sheetsCacheMap.delete(spreadsheetId);

  return { success: true, id };
}

/**
 * Programmatically designs & formats the spreadsheet to look professional:
 * - Frozen row 1 with dark emerald background and crisp white bold text
 * - Optimal column widths for readability
 * - Currency number formatting (Rp #,##0) for amount column
 * - Centered date and type columns
 * - Soft alternating row zebra striping (banding)
 * - Explicit gridlines
 */
async function formatAndDesignSheet(customSpreadsheetId) {
  const spreadsheetId = resolveSpreadsheetId(customSpreadsheetId);
  const targetSheetName = process.env.SHEET_NAME || 'Transactions';

  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID belum dikonfigurasi.');
  }

  // Ensure headers exist first
  await verifySheet(spreadsheetId);

  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetList = meta.data.sheets || [];
  const targetSheet = sheetList.find(s => s.properties && s.properties.title === targetSheetName) || sheetList[0];
  const sheetId = targetSheet.properties.sheetId;

  const requests = [
    // 1. Freeze Header Row (Row 1) & Show Gridlines
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
            hideGridlines: false
          }
        },
        fields: 'gridProperties.frozenRowCount,gridProperties.hideGridlines'
      }
    },
    // 2. Set Header Row Height to 40px
    {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: 0,
          endIndex: 1
        },
        properties: {
          pixelSize: 40
        },
        fields: 'pixelSize'
      }
    },
    // 3. Style Header Row: Dark Emerald #064E3B, White Bold Text, Centered, Middle Aligned
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 7
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.024, green: 0.306, blue: 0.231 },
            textFormat: {
              foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
              fontSize: 10,
              bold: true
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // 4. Optimal Column Widths
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 130 }, // ID
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 120 }, // Tanggal
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
        properties: { pixelSize: 100 }, // Jenis
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
        properties: { pixelSize: 140 }, // Jumlah
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 },
        properties: { pixelSize: 150 }, // Kategori
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 },
        properties: { pixelSize: 280 }, // Keterangan
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 },
        properties: { pixelSize: 170 }, // Created_At
        fields: 'pixelSize'
      }
    },
    // 5. Format Column D (Jumlah) to Currency "Rp #,##0" and Right Aligned
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          startColumnIndex: 3,
          endColumnIndex: 4
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'CURRENCY',
              pattern: '"Rp "#,##0'
            },
            horizontalAlignment: 'RIGHT',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(numberFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // 6. Format Column B (Tanggal) and C (Jenis) Centered
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          startColumnIndex: 1,
          endColumnIndex: 3
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
      }
    }
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests }
  });

  // 7. Try adding alternating row colors (Banding)
  try {
    const existingBanding = targetSheet.bandedRanges || [];
    if (existingBanding.length === 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addBandedRange: {
                bandedRange: {
                  range: {
                    sheetId,
                    startRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: 7
                  },
                  rowProperties: {
                    firstBandColor: { red: 1.0, green: 1.0, blue: 1.0 },
                    secondBandColor: { red: 0.97, green: 0.98, blue: 0.98 }
                  }
                }
              }
            }
          ]
        }
      });
    }
  } catch (err) {
    // Banding might already exist or not supported, ignore silently
  }

  return { success: true, message: 'Spreadsheet berhasil didesain rapi dan profesional!' };
}

module.exports = {
  getSheetsClient,
  verifySheet,
  getTransactions,
  appendTransaction,
  updateTransaction,
  deleteTransaction,
  formatAndDesignSheet,
  resolveSpreadsheetId
};
