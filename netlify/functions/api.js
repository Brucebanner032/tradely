// =====================================================
// TRADELY NETLIFY API FUNCTION
// =====================================================

const serverless = require("serverless-http");

const app = require("../../server");

exports.handler = serverless(app);
