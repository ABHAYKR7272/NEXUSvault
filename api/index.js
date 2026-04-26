// Vercel serverless entry — wraps the Express app from /backend
// On Vercel, process.env.VERCEL is set automatically, so server.js
// will skip app.listen() and just export the Express app.
module.exports = require('../backend/server.js');
