const { Router } = require('express');
const { soapForward } = require('../bc14');

const router = Router();

/**
 * POST /api/soap/:type/:name
 *
 * Transparent SOAP proxy. Forwards the request body (SOAP envelope) to BC14,
 * injecting the server-side Basic Auth credentials.
 *
 * :type = "Codeunit" or "Page"
 * :name = BC14 WS object name, e.g. "AgentsPortalFunctions", "WSPriceRequestHeader"
 *
 * The client must send:
 *   - Header: SOAPAction (the original SOAPAction value)
 *   - Body:   Full SOAP XML envelope
 *
 * The proxy returns the raw BC14 XML response.
 */
router.post('/:type/:name', async (req, res) => {
  const { type, name } = req.params;

  // Validate type
  const validTypes = ['Codeunit', 'Page'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Tipo inválido: ${type}. Use Codeunit ou Page.` });
  }

  // Get SOAP action from header
  const soapAction = req.headers['soapaction'] || req.headers['SOAPAction'] || '';
  if (!soapAction) {
    return res.status(400).json({ error: 'Header SOAPAction em falta.' });
  }

  // The body is the raw SOAP envelope (parsed as text by express.text())
  const soapBody = req.body;
  if (!soapBody || typeof soapBody !== 'string') {
    return res.status(400).json({ error: 'Body SOAP em falta.' });
  }

  const path = `/${type}/${name}`;

  try {
    const result = await soapForward(path, soapAction, soapBody);
    res.type('text/xml').status(result.status).send(result.data);
  } catch (err) {
    console.error(`[SOAP] Error forwarding ${path}:`, err.message);
    res.status(502).json({ error: 'Erro ao comunicar com BC14.' });
  }
});

module.exports = router;
