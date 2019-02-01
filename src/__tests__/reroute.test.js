import fs from 'fs';
import path from 'path';
import middy from 'middy';
import axios from 'axios';
import reroute from '..';
import { STATUS_CODES } from 'http';
import _reduce from 'lodash.reduce';
import merge from '../utils/deepmerge';

const rules = fs.readFileSync(path.join(__dirname, '_redirects')).toString();
const rulesDomain = fs
  .readFileSync(path.join(__dirname, '_redirects_reroute.danvanbrunt.com'))
  .toString();
const html404 = fs.readFileSync(path.join(__dirname, '404.html')).toString();

jest.mock('axios');
jest.mock('../s3');
import S3 from '../s3';

describe('📦 Middleware Redirects', () => {
  beforeEach(() => {
    S3.headObject.mockReset();
    S3.headObject.mockClear();
    S3.getObject.mockReset();
    S3.getObject.mockClear();
    axios.mockReset();
    axios.mockClear();
  });

  const testReroute = (request, testOpt = {}, midOpt = {}) => {
    const testOptions = merge(
      {
        noFiles: [`nofilehere/index.html`, `pretty/things.html`],
        fileContents: { _redirects: rules, '404.html': html404 },
      },
      testOpt,
    );
    const midOptions = merge(
      {
        cacheTtl: 0,
      },
      midOpt,
    );
    return new Promise((resolve, reject) => {
      S3.headObject.mockImplementation(({ Key }) => ({
        promise: () =>
          testOptions.noFiles.includes(Key)
            ? Promise.reject({ errorType: 'NoSuchKey' })
            : Promise.resolve({ statusCode: 200 }),
      }));
      S3.getObject.mockImplementation(({ Key }) => ({
        promise: () =>
          testOptions.noFiles.includes(Key)
            ? Promise.reject({ errorType: 'NoSuchKey' })
            : Promise.resolve({ Body: testOptions.fileContents[Key] }),
      }));

      const handler = middy((event, context, cb) => cb(null, event));
      handler.use(reroute(midOptions));
      handler(request, {}, (err, event) => {
        if (err) reject(err);
        resolve(event);
      });
    });
  };

  it('No _redirects file, no files should pass-through', async () => {
    const event = await testReroute(eventSample({ uri: '/asdf' }), {
      noFiles: ['asdf', 'asdf/index.html', '404.html', '_redirects'],
    });
    expect(event).toEqual(eventSample({ uri: '/asdf/index.html' }));
  });

  it('No DefaultDoc should pass-through', async () => {
    const event = await testReroute(eventSample({ uri: '/asdf' }), undefined, {
      defaultDoc: null,
    });
    expect(event).toEqual(eventSample({ uri: '/asdf' }));
  });

  it('No FriendlyURLs should pass-through', async () => {
    const event = await testReroute(
      eventSample({ uri: '/asdf/index.html' }),
      undefined,
      {
        friendlyUrls: false,
      },
    );
    expect(event).toEqual(eventSample({ uri: '/asdf/index.html' }));
  });

  it('Root route should work', async () => {
    const event = await testReroute(eventSample({ uri: '/' }));
    expect(event).toEqual(eventSample({ uri: '/index.html' }));
  });

  it('Redirect should work', async () => {
    const event = await testReroute(eventSample({ uri: '/internal1' }));
    expect(event).toEqual(redirectSample('/internal2', 301));
  });

  it('Redirect (Internal) with 301 should work', async () => {
    const event = await testReroute(eventSample({ uri: '/internal3' }));
    expect(event).toEqual(redirectSample('/internal4', 301));
  });

  it('Redirect (Internal) with 302 should work', async () => {
    const event = await testReroute(eventSample({ uri: '/internal5' }));
    expect(event).toEqual(redirectSample('/internal6', 302));
  });

  it('Redirect (Internal) with 303 should work', async () => {
    const event = await testReroute(eventSample({ uri: '/internal7' }));
    expect(event).toEqual(redirectSample('/internal8', 303));
  });

  it('Redirect (External) should work', async () => {
    const event = await testReroute(eventSample({ uri: '/internal9' }));
    expect(event).toEqual(redirectSample('https://external.com', 301));
  });

  it('Basic Rewrites should work', async () => {
    const event = await testReroute(eventSample({ uri: '/news/' }));
    expect(event).toEqual(eventSample({ uri: '/blog/index.html' }));
  });

  it('Rewrites w/o file should custom 404', async () => {
    const event = await testReroute(eventSample({ uri: '/stuff/' }));
    expect(event).toEqual(error404Sample(html404));
  });

  it('Rewrites w/o file OR custom 404 should pass-through', async () => {
    const event = await testReroute(eventSample({ uri: '/stuff/' }), {
      noFiles: ['nofilehere/index.html', '404.html'],
    });
    expect(event).toEqual(eventSample({ uri: '/nofilehere/index.html' }));
  });

  it('Trailing slash normalization should work', async () => {
    const event = await testReroute(eventSample({ uri: '/trailingslash' }));
    expect(event).toEqual(redirectSample('/trailred', 301));
  });

  it('DefaultDoc with pass-throughs should work', async () => {
    const event = await testReroute(eventSample({ uri: '/asdfdsfsd/' }));
    expect(event).toEqual(eventSample({ uri: '/asdfdsfsd/index.html' }));
  });

  it('Placeholder (Internal) Redirects should work', async () => {
    const event = await testReroute(
      eventSample({ uri: '/news/2004/02/12/my-story' }),
    );
    expect(event).toEqual(redirectSample('/blog/12/02/2004/my-story', 301));
  });

  it('Placeholder (Internal) Rewrites should work', async () => {
    const event = await testReroute(
      eventSample({ uri: '/articles/2004/02/12/my-story' }),
    );
    expect(event).toEqual(
      eventSample({ uri: '/stories/12/02/2004/my-story/index.html' }),
    );
  });

  it('Placeholder (External) Redirects should work', async () => {
    const event = await testReroute(
      eventSample({ uri: '/things/2004/02/12/my-story' }),
    );
    expect(event).toEqual(
      redirectSample('https://external.com/stuff/12/02/2004/my-story', 301),
    );
  });

  it('Splats (Internal) should work', async () => {
    const event = await testReroute(
      eventSample({ uri: '/shop/2004/01/10/my-story' }),
    );
    expect(event).toEqual(redirectSample('/checkout/2004/01/10/my-story', 301));
  });

  it('Custom 404 missing should pass-through', async () => {
    const event = await testReroute(eventSample({ uri: '/ecommerce' }), {
      noFiles: ['store-closed/index.html', '404.html'],
    });
    expect(event).toEqual(eventSample({ uri: '/store-closed/index.html' }));
  });

  it('PrettyURLs should work', async () => {
    const event = await testReroute(
      eventSample({ uri: '/pretty/things.html' }),
    );
    expect(event).toEqual(redirectSample('/pretty/things/', 301));
  });

  it('PrettyURLs should be ignored for existing files', async () => {
    const inputEvent = eventSample({ uri: '/something/about.html' });
    const event = await testReroute(inputEvent);
    expect(event).toEqual(inputEvent);
  });

  it('Proxying should work', async () => {
    axios.mockImplementation(() => Promise.resolve(axiosSample));
    const event = await testReroute(eventSample({ uri: '/api/users/iDVB' }));
    expect(event).toEqual(proxyResponseSample);
  });

  it('Condition Language match should work', async () => {
    const rules = `/langtest  /match   302!  Language=en,fr`;
    const matchEvent = await testReroute(
      eventSample({
        uri: '/langtest',
        headers: {
          'accept-language': 'en-GB,en-US;q=0.9,fr-CA;q=0.7,en;q=0.8',
        },
      }),
      undefined,
      { rules },
    );
    expect(matchEvent).toEqual(redirectSample('/match', 302));

    const unMatchEvent = await testReroute(
      eventSample({ uri: '/langtest' }),
      undefined,
      { rules },
    );
    expect(unMatchEvent).toEqual(eventSample({ uri: '/langtest/index.html' }));
  });

  it('Condition Country should work', async () => {
    const rules = `/countrytest  /match   302!  Country=US,CA`;
    const matchEvent = await testReroute(
      eventSample({
        uri: '/countrytest',
        headers: { 'cloudFront-viewer-country': 'CA' },
      }),
      undefined,
      { rules },
    );
    expect(matchEvent).toEqual(redirectSample('/match', 302));

    const unMatchEvent = await testReroute(
      eventSample({ uri: '/countrytest' }),
      undefined,
      { rules },
    );
    expect(unMatchEvent).toEqual(
      eventSample({ uri: '/countrytest/index.html' }),
    );
  });

  it('Host FROM rule should work', async () => {
    axios.mockImplementation(() => Promise.resolve(axiosSample));
    const host = 'reroute.danvanbrunt.com';
    const event = await testReroute(
      eventSample({ uri: '/hosttest', headers: { host } }),
      {
        fileContents: { [`_redirects_${host}`]: rulesDomain },
      },
      { multiFile: true },
    );
    expect(event).toEqual(redirectSample('https://thestar.com', 301));
  });

  it('Host FROM with no rule should pass-through', async () => {
    axios.mockImplementation(() => Promise.resolve(axiosSample));
    const host = 'red.danvanbrunt.com';
    const event = await testReroute(
      eventSample({ uri: '/hosttest', headers: { host } }),
      {
        noFiles: [`_redirects_${host}`],
      },
      { multiFile: true },
    );
    expect(event).toEqual(eventSample({ uri: '/hosttest/index.html' }));
  });

  it('RulesGet should cache', async () => {
    expect.assertions(2);
    const midOpt = { cacheTtl: 1 };
    await testReroute(eventSample({ uri: '/test1' }), undefined, midOpt);
    await testReroute(eventSample({ uri: '/test2' }), undefined, midOpt);
    await testReroute(eventSample({ uri: '/test3' }), undefined, midOpt);
    expect(S3.getObject).toBeCalledWith(
      expect.objectContaining({
        Key: '_redirects',
      }),
    );
    expect(S3.getObject).toHaveBeenCalledTimes(1);
  });

  it('RulesGet cache should have TTF', async () => {
    expect.assertions(1);
    const midOpt = { cacheTtl: 0 };
    await testReroute(eventSample({ uri: '/test1' }), undefined, midOpt);
    await testReroute(eventSample({ uri: '/test2' }), undefined, midOpt);
    expectNCallsWithArgs(S3.getObject.mock.calls, 2, [
      expect.objectContaining({
        Key: '_redirects',
      }),
    ]);
  });

  // it('Axios should throw on crit error', async () => {
  // const event = await testReroute(eventSample({ uri: '/internal7' }));
  // expect(event).toEqual(redirectSample('/internal8', 303));
  //   axios.mockImplementation(() => Promise.reject('Crit Error'));
  //   testScenario(
  //     eventSample({ uri: '/axiostest' }),
  //     (err, event) => {
  //       console.log({ err });
  //       expect(err.msg).toEqual('Crit Error');
  //     },
  //     done,
  //   );
  // });

  // it('Language Conditions should work', async () => {
  // const event = await testReroute(eventSample({ uri: '/internal7' }));
  // expect(event).toEqual(redirectSample('/internal8', 303));
  //   testScenario(
  //     eventSample('/langtest'),
  //     (err, event) => {
  //       expect(event).toEqual(eventSample('/langworked/index.html'));
  //     },
  //     done,
  //   );
  // });
});

//////////////////////
// Utils            //
//////////////////////

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const capitalizeParam = param =>
  param
    .split('-')
    .map(i => i.charAt(0).toUpperCase() + i.slice(1))
    .join('-');
const toKeyValue = (key, value) =>
  !!value
    ? {
        [key]: [{ key: capitalizeParam(key), value }],
      }
    : {};

const toKeyValueHeaders = headers =>
  _reduce(
    headers,
    (results, value, key) => ({
      ...results,
      ...toKeyValue(key, value),
    }),
    {},
  );

const expectNCallsWithArgs = (received, numCalls, expected) => {
  const calls = [...Array(numCalls)].map(() => expected);
  return expect(received).toEqual(calls);
};

//////////////////////
// Sample Events    //
//////////////////////

const eventSample = ({ uri, headers: headerParams }) => {
  const headers = merge(
    {
      'user-agent': [
        {
          key: 'User-Agent',
          value: 'Amazon CloudFront',
        },
      ],
      via: [
        {
          key: 'Via',
          value:
            '1.1 435df4a736dacde836367e67036d6c56.cloudfront.net (CloudFront)',
        },
      ],
      host: [
        {
          key: 'Host',
          value: 'layer-redirects-dev-defaultbucket-1hr6azp5liexa',
        },
      ],
      'accept-encoding': [
        {
          key: 'Accept-Encoding',
          value: 'gzip',
        },
      ],
      'upgrade-insecure-requests': [
        {
          key: 'upgrade-insecure-requests',
          value: '1',
        },
      ],
      'x-forwarded-for': [
        {
          key: 'X-Forwarded-For',
          value: '38.99.136.178',
        },
      ],
    },
    toKeyValueHeaders(headerParams),
  );

  return {
    Records: [
      {
        cf: {
          request: {
            method: 'GET',
            headers,
            origin: {
              s3: {
                authMethod: 'origin-access-identity',
                customHeaders: {},
                domainName: 'layer-redirects-dev-defaultbucket-1hr6azp5liexa',
                path: '',
                region: 'us-east-1',
              },
            },
            querystring: '',
            uri,
          },
        },
      },
    ],
  };
};
const redirectSample = (uri, status) => ({
  status,
  statusDescription: STATUS_CODES[status],
  headers: {
    location: [{ key: 'Location', value: uri }],
  },
});
const error404Sample = body => ({
  status: '404',
  statusDescription: STATUS_CODES['404'],
  headers: {
    'content-type': [
      {
        key: 'Content-Type',
        value: 'text/html',
      },
    ],
  },
  body: body,
});
const axiosSample = {
  status: 200,
  statusText: 'OK',
  headers: {
    server: 'GitHub.com',
    date: 'Wed, 23 Jan 2019 17:35:22 GMT',
    'content-type': 'application/json; charset=utf-8',
    'transfer-encoding': 'chunked',
    connection: 'close',
    status: '200 OK',
    'x-ratelimit-limit': '60',
    'x-ratelimit-remaining': '59',
    'x-ratelimit-reset': '1548268522',
    'cache-control': 'public, max-age=60, s-maxage=60',
    vary: 'Accept',
    etag: 'W/"99366084be4e93df287625dbcec41419"',
    'last-modified': 'Thu, 17 Jan 2019 14:08:46 GMT',
    'x-github-media-type': 'github.v3',
    'access-control-expose-headers':
      'ETag, Link, Location, Retry-After, X-GitHub-OTP, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-OAuth-Scopes, X-Accepted-OAuth-Scopes, X-Poll-Interval, X-GitHub-Media-Type',
    'access-control-allow-origin': '*',
    'strict-transport-security': 'max-age=31536000; includeSubdomains; preload',
    'x-frame-options': 'deny',
    'x-content-type-options': 'nosniff',
    'x-xss-protection': '1; mode=block',
    'referrer-policy':
      'origin-when-cross-origin, strict-origin-when-cross-origin',
    'content-security-policy': "default-src 'none'",
    'x-github-request-id': 'FE44:4BC6:2FD45F5:630C738:5C48A5DA',
  },
  data: {
    login: 'iDVB',
    id: 189506,
    node_id: 'MDQ6VXNlcjE4OTUwNg==',
    avatar_url: 'https://avatars1.githubusercontent.com/u/189506?v=4',
    gravatar_id: '',
    url: 'https://api.github.com/users/iDVB',
    html_url: 'https://github.com/iDVB',
    followers_url: 'https://api.github.com/users/iDVB/followers',
    following_url: 'https://api.github.com/users/iDVB/following{/other_user}',
    gists_url: 'https://api.github.com/users/iDVB/gists{/gist_id}',
    starred_url: 'https://api.github.com/users/iDVB/starred{/owner}{/repo}',
    subscriptions_url: 'https://api.github.com/users/iDVB/subscriptions',
    organizations_url: 'https://api.github.com/users/iDVB/orgs',
    repos_url: 'https://api.github.com/users/iDVB/repos',
    events_url: 'https://api.github.com/users/iDVB/events{/privacy}',
    received_events_url: 'https://api.github.com/users/iDVB/received_events',
    type: 'User',
    site_admin: false,
    name: 'Dan Van Brunt',
    company: '@KlickInc @KatalystAdvantage ',
    blog: '',
    location: 'Toronto, ON',
    email: null,
    hireable: null,
    bio:
      'Director of Technology @KlickInc \r\nDev, DevOp, Automation Advocate\r\nInto: #docker #serverless#makingiteasy',
    public_repos: 43,
    public_gists: 21,
    followers: 14,
    following: 11,
    created_at: '2010-01-25T16:28:03Z',
    updated_at: '2019-01-17T14:08:46Z',
  },
};
const proxyResponseSample = {
  body: `{"login":"iDVB","id":189506,"node_id":"MDQ6VXNlcjE4OTUwNg==","avatar_url":"https://avatars1.githubusercontent.com/u/189506?v=4","gravatar_id":"","url":"https://api.github.com/users/iDVB","html_url":"https://github.com/iDVB","followers_url":"https://api.github.com/users/iDVB/followers","following_url":"https://api.github.com/users/iDVB/following{/other_user}","gists_url":"https://api.github.com/users/iDVB/gists{/gist_id}","starred_url":"https://api.github.com/users/iDVB/starred{/owner}{/repo}","subscriptions_url":"https://api.github.com/users/iDVB/subscriptions","organizations_url":"https://api.github.com/users/iDVB/orgs","repos_url":"https://api.github.com/users/iDVB/repos","events_url":"https://api.github.com/users/iDVB/events{/privacy}","received_events_url":"https://api.github.com/users/iDVB/received_events","type":"User","site_admin":false,"name":"Dan Van Brunt","company":"@KlickInc @KatalystAdvantage ","blog":"","location":"Toronto, ON","email":null,"hireable":null,"bio":"Director of Technology @KlickInc \\r\\nDev, DevOp, Automation Advocate\\r\\nInto: #docker #serverless#makingiteasy","public_repos":43,"public_gists":21,"followers":14,"following":11,"created_at":"2010-01-25T16:28:03Z","updated_at":"2019-01-17T14:08:46Z"}`,
  headers: {
    'access-control-allow-origin': [
      {
        key: 'Access-Control-Allow-Origin',
        value: '*',
      },
    ],
    'access-control-expose-headers': [
      {
        key: 'Access-Control-Expose-Headers',
        value:
          'ETag, Link, Location, Retry-After, X-GitHub-OTP, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-OAuth-Scopes, X-Accepted-OAuth-Scopes, X-Poll-Interval, X-GitHub-Media-Type',
      },
    ],
    'cache-control': [
      {
        key: 'Cache-Control',
        value: 'public, max-age=60, s-maxage=60',
      },
    ],
    'content-security-policy': [
      {
        key: 'Content-Security-Policy',
        value: "default-src 'none'",
      },
    ],
    'content-type': [
      {
        key: 'Content-Type',
        value: 'application/json; charset=utf-8',
      },
    ],
    date: [
      {
        key: 'Date',
        value: 'Wed, 23 Jan 2019 17:35:22 GMT',
      },
    ],
    etag: [
      {
        key: 'Etag',
        value: 'W/"99366084be4e93df287625dbcec41419"',
      },
    ],
    'last-modified': [
      {
        key: 'Last-Modified',
        value: 'Thu, 17 Jan 2019 14:08:46 GMT',
      },
    ],
    'referrer-policy': [
      {
        key: 'Referrer-Policy',
        value: 'origin-when-cross-origin, strict-origin-when-cross-origin',
      },
    ],
    server: [
      {
        key: 'Server',
        value: 'GitHub.com',
      },
    ],
    status: [
      {
        key: 'Status',
        value: '200 OK',
      },
    ],
    'strict-transport-security': [
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubdomains; preload',
      },
    ],
    vary: [
      {
        key: 'Vary',
        value: 'Accept',
      },
    ],
    'x-content-type-options': [
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
    ],
    'x-frame-options': [
      {
        key: 'X-Frame-Options',
        value: 'deny',
      },
    ],
    'x-github-media-type': [
      {
        key: 'X-Github-Media-Type',
        value: 'github.v3',
      },
    ],
    'x-github-request-id': [
      {
        key: 'X-Github-Request-Id',
        value: 'FE44:4BC6:2FD45F5:630C738:5C48A5DA',
      },
    ],
    'x-ratelimit-limit': [
      {
        key: 'X-Ratelimit-Limit',
        value: '60',
      },
    ],
    'x-ratelimit-remaining': [
      {
        key: 'X-Ratelimit-Remaining',
        value: '59',
      },
    ],
    'x-ratelimit-reset': [
      {
        key: 'X-Ratelimit-Reset',
        value: '1548268522',
      },
    ],
    'x-xss-protection': [
      {
        key: 'X-Xss-Protection',
        value: '1; mode=block',
      },
    ],
  },
  status: 200,
  statusDescription: 'OK',
};
