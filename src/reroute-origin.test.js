import middy from 'middy';
import _reduce from 'lodash.reduce';
import dotProp from 'dot-prop-immutable';
import { rerouteOrigin } from '.';
import merge from './utils/deepmerge';
import { eventResponse } from './tests/responses';

const ORIGIN_S3_DOTPATH = 'Records.0.cf.request.origin.s3';

describe('📦  Reroute Origin', () => {
  const testReroute = (request, testOpt = {}, midOpt = {}) => {
    const testOptions = merge({}, testOpt);
    const midOptions = merge({}, midOpt);
    return new Promise((resolve, reject) => {
      const handler = middy((event, context, cb) => cb(null, event));
      handler.use(rerouteOrigin(midOptions));
      handler(
        request,
        { functionName: 'us-east-1.middy-reroute-example-prod-originrequest' },
        (err, event) => {
          if (err) reject(err);
          resolve(event);
        },
      );
    });
  };

  it('Basic Domain Origin Routing', async () => {
    const headers = { host: 'blue.danvanbrunt.com' };
    const event = await testReroute(eventResponse({ uri: '/thingy', headers }));
    expect(event).toEqual(
      eventResponse(
        { uri: '/thingy', headers },
        dotProp.set({}, ORIGIN_S3_DOTPATH, {
          domainName: 'middy-reroute-origin-blue.s3.amazonaws.com',
          region: 'us-east-1',
        }),
      ),
    );
  });
});
