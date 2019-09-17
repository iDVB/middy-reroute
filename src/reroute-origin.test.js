import middy from 'middy';
import _reduce from 'lodash.reduce';
import dotProp from 'dot-prop-immutable';
import { rerouteOrigin } from '.';
import merge from './utils/deepmerge';
import { eventResponse, ddbResponse } from './tests/responses';

const ORIGIN_S3_DOTPATH = 'Records.0.cf.request.origin.s3';

jest.mock('./ddb');
import DDB from './ddb';

const FAKE_TABLE_NAME = 'middy-reroute-example-prod-domainmap';

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
    const testOptions = merge(
      {
        context: {
          functionName: 'us-east-1.middy-reroute-example-prod-originrequest',
        },
      },
      testOpt,
    );
    const midOptions = merge({}, midOpt);
    return new Promise((resolve, reject) => {
      DDB.getItem.mockImplementation(
        ({
          Key: {
            Host: { S: domain },
          },
          TableName: tablename,
        }) => {
          return {
            promise: () =>
              tablename === FAKE_TABLE_NAME
                ? !!testOptions.domainMap && !!testOptions.domainMap[domain]
                  ? Promise.resolve(
                      ddbResponse(domain, testOptions.domainMap[domain]),
                    )
                  : Promise.reject({ errorType: 'NoSuchKey' })
                : Promise.reject({ errorType: 'Access Denied' }),
          };
        },
      );

      const handler = middy((event, context, cb) => cb(null, event));
      handler.use(rerouteOrigin(midOptions));
      handler(event, testOptions.context, (err, event) => {
        if (err) reject(err);
        resolve(event);
      });
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

  it('Non-standard functionSuffix', async () => {
    const headers = { host: 'blue.danvanbrunt.com' };
    const domainMap = {
      'blue.danvanbrunt.com': 'middy-reroute-origin-blue.s3.amazonaws.com',
    };
    const context = {
      functionName: 'us-east-1.middy-reroute-example-prod-originrequestproxy',
    };
    const event = await testReroute({
      event: eventResponse({ uri: '/thingy', headers }),
      testOptions: { domainMap, context },
      midOptions: { functionSuffix: '-originrequestproxy' },
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

  // test for both
  // marketing-stack-proxy-dev-originrequest
  // and
  // us-east-1.marketing-stack-proxy-dev-originrequest
});
