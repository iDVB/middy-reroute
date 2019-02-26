import middy from 'middy';
import _reduce from 'lodash.reduce';
import dotProp from 'dot-prop-immutable';
import { rerouteOrigin } from '.';
import merge from './utils/deepmerge';
import { eventResponse, ddbResponse } from './tests/responses';

const ORIGIN_S3_DOTPATH = 'Records.0.cf.request.origin.s3';

jest.mock('./ddb');
import DDB from './ddb';

describe('📦  Reroute Origin', () => {
  beforeEach(() => {
    DDB.getItem.mockReset();
    DDB.getItem.mockClear();
  });

  const testReroute = ({
    event,
    testOptions: testOpt = {},
    midOptions: midOpt = {},
  }) => {
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
        event,
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
    const event = await testReroute({
      event: eventResponse({ uri: '/thingy', headers }),
      testOptions: { domainMap },
    });
    expect(event).toEqual(
      eventResponse(
        { uri: '/thingy', headers },
        dotProp.merge({ Records: [] }, ORIGIN_S3_DOTPATH, {
          domainName: 'middy-reroute-origin-blue.s3.amazonaws.com',
          region: 'us-east-1',
        }),
      ),
    );
  });
});
