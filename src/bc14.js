const axios = require('axios');
const config = require('./config');

/**
 * Forward a SOAP request to BC14, injecting the server-side Basic Auth.
 *
 * @param {string} path       – BC14 WS path after the base, e.g. "/Codeunit/AgentsPortalFunctions"
 * @param {string} soapAction – SOAPAction header value
 * @param {string} body       – Full SOAP envelope XML
 * @returns {Promise<string>} – Raw XML response from BC14
 */
async function soapForward(path, soapAction, body) {
  const url = `${config.bc14.wsBase}${path}`;

  const response = await axios.post(url, body, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      Accept: 'text/xml',
      SOAPAction: soapAction,
      Authorization: config.bc14.basicAuth,
    },
    // Return raw text, don't parse
    responseType: 'text',
    // Don't throw on 500 — BC14 returns SOAP faults with HTTP 500
    validateStatus: (status) => status < 600,
    timeout: 30000,
  });

  return { status: response.status, data: response.data };
}

module.exports = { soapForward };
