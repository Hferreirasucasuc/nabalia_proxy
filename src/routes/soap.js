const { Router } = require('express');
const { soapForward } = require('../bc14');

const router = Router();

/**
 * Pages where Agent_No filtering must be enforced server-side.
 * Any ReadMultiple request to these pages will have the Agent_No filter
 * injected (or overridden) to match the authenticated agent's ID.
 */
const AGENT_FILTERED_PAGES = new Set([
  'WSContractlist',
  'WSPriceRequestHeaderList',
  'WSUtilitiesAdhesions',
  'WSAgentFeeDefaultList',
  'WSInvoiceSimHeader',
]);

/**
 * Injects or overrides the Agent_No filter in a ReadMultiple SOAP envelope.
 * If an Agent_No filter already exists, it is replaced with the correct value.
 * If none exists, one is added before the closing </ReadMultiple> tag.
 */
function enforceAgentFilter(soapBody, agentId) {
  // Remove any existing Agent_No filter the client may have sent
  // Pattern: <filter><Field>Agent_No</Field><Criteria>...</Criteria></filter>
  const agentFilterRegex = /<filter>\s*<Field>Agent_No<\/Field>\s*<Criteria>[^<]*<\/Criteria>\s*<\/filter>/gi;
  let cleaned = soapBody.replace(agentFilterRegex, '');

  // Inject the server-enforced Agent_No filter before </ReadMultiple>
  const agentFilter =
    `    <filter>\n` +
    `      <Field>Agent_No</Field>\n` +
    `      <Criteria>${escapeXml(agentId)}</Criteria>\n` +
    `    </filter>\n`;

  // Insert before the closing ReadMultiple tag
  cleaned = cleaned.replace(
    /<\/ReadMultiple>/i,
    `${agentFilter}    </ReadMultiple>`
  );

  return cleaned;
}

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * POST /api/soap/:type/:name
 *
 * Transparent SOAP proxy. Forwards the request body (SOAP envelope) to BC14,
 * injecting the server-side Basic Auth credentials.
 *
 * Security: For ReadMultiple requests on agent-scoped pages, the Agent_No
 * filter is enforced server-side based on the JWT token.
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
  let soapBody = req.body;
  if (!soapBody || typeof soapBody !== 'string') {
    return res.status(400).json({ error: 'Body SOAP em falta.' });
  }

  // ── Security: enforce Agent_No filter on agent-scoped pages ──────────
  if (
    type === 'Page' &&
    AGENT_FILTERED_PAGES.has(name) &&
    soapBody.includes('ReadMultiple') &&
    req.agent?.agentId
  ) {
    soapBody = enforceAgentFilter(soapBody, req.agent.agentId);
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
