'use strict';

process.env.DEBUG = 'reroute:log';

const middy = require('middy');
const { reroute, rerouteOrigin } = require('./lib/reroute');

const handler = middy((event, context, cb) => {
  const request = !!event.Records ? event.Records[0].cf.request : event;
  cb(null, request);
})
  .use(rerouteOrigin({ tableName: 'middy-reroute-example-prod-domainmap' }))
  .use(
    reroute({
      cacheTtl: 1,
    }),
  );

module.exports = { handler };
