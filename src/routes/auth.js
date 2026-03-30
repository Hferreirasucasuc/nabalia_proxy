const { Router } = require('express');
const { soapForward } = require('../bc14');
const { signToken } = require('../auth');

const router = Router();

/**
 * POST /api/auth/login
 * Body: { agentId, password }
 *
 * Calls BC14 GetAgentInfo, returns agent data + JWT token.
 */
router.post('/login', async (req, res) => {
  const { agentId, password } = req.body;
  if (!agentId || !password) {
    return res.status(400).json({ error: 'agentId e password são obrigatórios.' });
  }

  const ns = 'urn:microsoft-dynamics-schemas/codeunit/WSHyUtilsAgentsWebPortal';
  const soapAction = `"${ns}:GetAgentInfo"`;
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetAgentInfo xmlns="${ns}">
      <agentID>${escapeXml(agentId)}</agentID>
      <agentPassword>${escapeXml(password)}</agentPassword>
    </GetAgentInfo>
  </soap:Body>
</soap:Envelope>`;

  try {
    const result = await soapForward('/Codeunit/WSHyUtilsAgentsWebPortal', soapAction, body);

    // Check for SOAP fault
    if (result.data.includes('faultstring')) {
      const faultMsg = extractTag(result.data, 'faultstring') || 'Erro de autenticação';
      return res.status(401).json({ error: faultMsg });
    }

    // Extract agent name for the JWT payload
    const agentName = extractTag(result.data, 'agentName') || '';

    // Fetch agent hierarchy — all agent IDs this agent can see
    let visibleAgents = [agentId]; // Default: only self
    try {
      const hierarchyResult = await fetchAgentHierarchy(agentId);
      if (hierarchyResult && hierarchyResult.length > 0) {
        visibleAgents = hierarchyResult;
      }
    } catch (err) {
      console.error('[AUTH] Failed to fetch agent hierarchy, using self only:', err.message);
    }

    // Sign JWT with agent info + visible agents list
    const token = signToken({ agentId, agentName, visibleAgents });

    // Return the raw SOAP result XML + token
    // The Flutter app will parse the XML as before
    res.json({
      token,
      xml: result.data,
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    res.status(502).json({ error: 'Erro ao comunicar com BC14.' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Body: { agentId }
 */
router.post('/forgot-password', async (req, res) => {
  const { agentId } = req.body;
  if (!agentId) {
    return res.status(400).json({ error: 'agentId é obrigatório.' });
  }

  const ns = 'urn:microsoft-dynamics-schemas/codeunit/WSHyUtilsWebPortal';
  const soapAction = `"${ns}:ResetPassword"`;
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ResetPassword xmlns="${ns}">
      <agentID>${escapeXml(agentId)}</agentID>
    </ResetPassword>
  </soap:Body>
</soap:Envelope>`;

  try {
    const result = await soapForward('/Codeunit/WSHyUtilsWebPortal', soapAction, body);
    res.type('text/xml').status(result.status).send(result.data);
  } catch (err) {
    console.error('[AUTH] Forgot password error:', err.message);
    res.status(502).json({ error: 'Erro ao comunicar com BC14.' });
  }
});

// ─── Agent Hierarchy ─────────────────────────────────────────────────────────

/**
 * Calls BC14 AgentsPortalFunctions.FxGetAgentHierarchy to get
 * all agent IDs visible to the given agent (pipe-separated).
 * Returns an array of agent IDs, e.g. ['AG001', 'SUB001', 'SUB002'].
 */
async function fetchAgentHierarchy(agentId) {
  const ns = 'urn:microsoft-dynamics-schemas/codeunit/AgentsPortalFunctions';
  const soapAction = `"${ns}:FxGetAgentHierarchy"`;
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FxGetAgentHierarchy xmlns="${ns}">
      <pAgentNo>${escapeXml(agentId)}</pAgentNo>
    </FxGetAgentHierarchy>
  </soap:Body>
</soap:Envelope>`;

  const result = await soapForward('/Codeunit/AgentsPortalFunctions', soapAction, body);
  const returnValue = extractTag(result.data, 'return_value') || '';
  if (!returnValue) return [agentId];
  return returnValue.split('|').filter(id => id.length > 0);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractTag(xml, tag) {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'i');
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}

module.exports = router;
