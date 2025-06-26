const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
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

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
