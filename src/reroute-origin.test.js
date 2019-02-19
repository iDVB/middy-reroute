import middy from 'middy';
import _reduce from 'lodash.reduce';
import dotProp from 'dot-prop-immutable';
import { rerouteOrigin } from '.';
import merge from './utils/deepmerge';
import { eventResponse } from './tests/responses';

const ORIGIN_S3_DOTPATH = 'Records.0.cf.request.origin.s3';

const ddbResponse = (host, table, region = 'us-east-1') => ({
  Item: {
    Host: {
      S: host,
    },
    Region: {
      S: region,
    },
    Origin: {
      S: table,
    },
  },
});

jest.mock('./ddb');
import DDB from './ddb';

describe('📦  Reroute Origin', () => {
  beforeEach(() => {
    DDB.getItem.mockReset();
    DDB.getItem.mockClear();
  });

  const testReroute = (request, testOpt = {}, midOpt = {}) => {
    const testOptions = merge({}, testOpt);
    const midOptions = merge({}, midOpt);
    return new Promise((resolve, reject) => {
      DDB.getItem.mockImplementation(({ Key: { Host: { S: domain } } }) => {
        console.log('DDB.getItem.mockImplementation', domain);
        return {
          promise: () =>
            !!testOptions.domainMap && !!testOptions.domainMap[domain]
              ? Promise.resolve(
                  ddbResponse(domain, testOptions.domainMap[domain]),
                )
              : Promise.reject({ errorType: 'NoSuchKey' }),
        };
      });

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
    const domainMap = {
      'blue.danvanbrunt.com': 'middy-reroute-origin-blue.s3.amazonaws.com',
    };
    const event = await testReroute(
      eventResponse({ uri: '/thingy', headers }),
      { domainMap },
    );
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
