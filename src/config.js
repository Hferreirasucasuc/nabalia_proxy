require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3100', 10),

  bc14: {
    host: process.env.BC14_HOST || 'localhost',
    port: parseInt(process.env.BC14_PORT || '9047', 10),
    instance: process.env.BC14_INSTANCE || 'BC140Test',
    company: process.env.BC14_COMPANY || 'PropensaAlternativa',
    user: process.env.BC14_USER,
    pass: process.env.BC14_PASS,
    get wsBase() {
      return `http://${this.host}:${this.port}/${this.instance}/WS/${this.company}`;
    },
    get basicAuth() {
      return 'Basic ' + Buffer.from(`${this.user}:${this.pass}`).toString('base64');
    },
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:8080')
    .split(',')
    .map(s => s.trim()),
};
