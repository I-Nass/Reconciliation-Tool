const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize SQLite database
const dbPath = path.join(__dirname, 'reconciliation_history.db');
const db = new sqlite3.Database(dbPath);

// Create tables if they don't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS reconciliation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    internal_filename TEXT,
    provider_filename TEXT,
    matched_count INTEGER,
    internal_only_count INTEGER,
    provider_only_count INTEGER,
    mismatched_count INTEGER,
    result_data TEXT,
    cache_key TEXT UNIQUE
  )`);
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_cache_key ON reconciliation_history(cache_key)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON reconciliation_history(timestamp)`);
});

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Increase limit for large files
app.use(express.static(path.join(__dirname, 'public')));

app.post('/reconcile', (req, res) => {
  const { internal, provider } = req.body;

  if (!internal || !provider) {
    return res.status(400).json({ error: 'Missing input data' });
  }

  const matched = [];
  const internalOnly = [];
  const providerOnly = [];
  const partialMismatches = [];

  const providerMap = new Map();
  provider.forEach(tx => providerMap.set(tx.transaction_reference, tx));

  internal.forEach(intTx => {
    const provTx = providerMap.get(intTx.transaction_reference);
    if (provTx) {
      if (intTx.amount === provTx.amount && intTx.status === provTx.status) {
        matched.push(intTx);
      } else {
        partialMismatches.push({
          reference: intTx.transaction_reference,
          internal: intTx,
          provider: provTx
        });
      }
      providerMap.delete(intTx.transaction_reference);
    } else {
      internalOnly.push(intTx);
    }
  });

  providerMap.forEach(tx => providerOnly.push(tx));

  return res.json({ matched, internalOnly, providerOnly, partialMismatches });
});

// Save reconciliation to database
app.post('/save-history', (req, res) => {
  const { 
    internal_filename, 
    provider_filename, 
    result, 
    cache_key 
  } = req.body;

  const stmt = db.prepare(`INSERT OR REPLACE INTO reconciliation_history 
    (internal_filename, provider_filename, matched_count, internal_only_count, 
     provider_only_count, mismatched_count, result_data, cache_key) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  stmt.run([
    internal_filename,
    provider_filename,
    result.matched?.length || 0,
    result.internalOnly?.length || 0,
    result.providerOnly?.length || 0,
    result.partialMismatches?.length || 0,
    JSON.stringify(result),
    cache_key
  ], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, id: this.lastID });
  });

  stmt.finalize();
});

// Get reconciliation history
app.get('/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  db.all(`SELECT id, timestamp, internal_filename, provider_filename, 
          matched_count, internal_only_count, provider_only_count, mismatched_count
          FROM reconciliation_history 
          ORDER BY timestamp DESC 
          LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get specific reconciliation result
app.get('/history/:id', (req, res) => {
  const id = req.params.id;
  
  db.get(`SELECT * FROM reconciliation_history WHERE id = ?`, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    try {
      row.result_data = JSON.parse(row.result_data);
    } catch (e) {
      console.error('Error parsing result data:', e);
    }
    
    res.json(row);
  });
});

// Delete reconciliation record
app.delete('/history/:id', (req, res) => {
  const id = req.params.id;
  
  db.run(`DELETE FROM reconciliation_history WHERE id = ?`, [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, changes: this.changes });
  });
});

// Check cache for existing reconciliation
app.post('/check-cache', (req, res) => {
  const { cache_key } = req.body;
  
  db.get(`SELECT result_data FROM reconciliation_history WHERE cache_key = ? 
          AND datetime(timestamp, '+30 minutes') > datetime('now')`, [cache_key], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (row) {
      try {
        const result = JSON.parse(row.result_data);
        res.json({ cached: true, result });
      } catch (e) {
        res.json({ cached: false });
      }
    } else {
      res.json({ cached: false });
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});
