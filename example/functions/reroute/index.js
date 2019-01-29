'use strict';

process.env.DEBUG = 'reroute:log';

const middy = require('middy');
const reroute = require('./lib/reroute');

const handler = middy((event, context, cb) => {
  const request = !!event.Records ? event.Records[0].cf.request : event;
  cb(null, request);
}).use(reroute());

module.exports = { handler };
