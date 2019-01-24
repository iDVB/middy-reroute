const fs = require('fs');
const path = require('path');
const middy = require('middy');
const axios = require('axios');
const reroute = require('../src/reroute');
const STATUS_CODES = require('http').STATUS_CODES;

const rules = fs.readFileSync(path.join(__dirname, '_redirects')).toString();
const html404 = fs.readFileSync(path.join(__dirname, '404.html')).toString();

jest.mock('axios');
jest.mock('../src/s3');
const S3 = require('../src/s3');

const eventSample = uri => ({
  Records: [
    {
      cf: {
        request: {
          method: 'GET',
          headers: {
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
            host: [
              {
                key: 'Host',
                value: 'layer-redirects-dev-defaultbucket-1hr6azp5liexa',
              },
            ],
          },
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
});
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
  status: 200,
  statusDescription: 'OK',
};

describe('📦 Middleware Redirects', () => {
  beforeEach(() => {
    S3.headObject.mockReset();
    S3.headObject.mockClear();
    S3.getObject.mockReset();
    S3.getObject.mockClear();
    axios.mockReset();
    axios.mockClear();
  });

  const testScenario = (
    request,
    callback,
    done,
    testOptions = {
      noFiles: [`nofilehere/index.html`, `pretty/things.html`],
      fileContents: { _redirect: rules, '404.html': html404 },
    },
    midOptions = { rules },
  ) => {
    S3.headObject.mockImplementation(({ Key }) => {
      return {
        promise: () =>
          testOptions.noFiles.includes(Key)
            ? Promise.reject({ statusCode: 404 })
            : Promise.resolve({ statusCode: 200 }),
      };
    });
    S3.getObject.mockImplementation(({ Key }) => {
      const resp = { Body: testOptions.fileContents[Key] };
      return {
        promise: () => Promise.resolve(resp),
      };
    });

    const handler = middy((event, context, cb) => cb(null, event));
    handler.use(reroute(midOptions));
    handler(request, {}, (err, event) => {
      if (err) throw err;
      callback(event);
      done();
    });
  };

  test('Root route should work', done => {
    testScenario(
      eventSample('/'),
      event => {
        expect(event).toEqual(eventSample('/index.html'));
      },
      done,
      {
        noFiles: ['/'],
        fileContents: { _redirect: rules, '404.html': html404 },
      },
    );
  });

  test('Redirect should work', done => {
    testScenario(
      eventSample('/internal1'),
      event => {
        // expect(S3.getObject).toBeCalled();
        expect(event).toEqual(redirectSample('/internal2', 301));
      },
      done,
    );
  });

  test('Redirect (Internal) with 301 should work', done => {
    testScenario(
      eventSample('/internal3'),
      event => {
        expect(event).toEqual(redirectSample('/internal4', 301));
      },
      done,
    );
  });

  test('Redirect (Internal) with 302 should work', done => {
    testScenario(
      eventSample('/internal5'),
      event => {
        expect(event).toEqual(redirectSample('/internal6', 302));
      },
      done,
    );
  });

  test('Redirect (Internal) with 303 should work', done => {
    testScenario(
      eventSample('/internal7'),
      event => {
        expect(event).toEqual(redirectSample('/internal8', 303));
      },
      done,
    );
  });

  test('Redirect (External) should work', done => {
    testScenario(
      eventSample('/internal9'),
      event => {
        expect(event).toEqual(redirectSample('https://external.com', 301));
      },
      done,
    );
  });

  test('Basic Rewrites should work', done => {
    testScenario(
      eventSample('/news/'),
      event => {
        expect(event).toEqual(eventSample('/blog/index.html'));
      },
      done,
    );
  });

  test('Rewrites w/o file should custom 404', done => {
    testScenario(
      eventSample('/stuff/'),
      event => {
        expect(event).toEqual(error404Sample(html404));
      },
      done,
    );
  });

  test('Rewrites w/o file OR custom 404 should pass-through', done => {
    testScenario(
      eventSample('/stuff/'),
      event => {
        expect(event).toEqual(eventSample('/nofilehere/index.html'));
      },
      done,
      {
        noFiles: ['/nofilehere/index.html', '404.html'],
        fileContents: { _redirect: rules },
      },
    );
  });

  test('Trailing slash normalization should work', done => {
    testScenario(
      eventSample('/trailingslash'),
      event => {
        expect(event).toEqual(redirectSample('/trailred', 301));
      },
      done,
    );
  });

  test('DefaultDoc with pass-throughs should work', done => {
    testScenario(
      eventSample('/asdfdsfsd/'),
      event => {
        expect(event).toEqual(eventSample('/asdfdsfsd/index.html'));
      },
      done,
    );
  });

  test('Placeholder (Internal) Redirects should work', done => {
    testScenario(
      eventSample('/news/2004/02/12/my-story'),
      event => {
        expect(event).toEqual(redirectSample('/blog/12/02/2004/my-story', 301));
      },
      done,
    );
  });

  test('Placeholder (Internal) Rewrites should work', done => {
    testScenario(
      eventSample('/articles/2004/02/12/my-story'),
      event => {
        expect(event).toEqual(
          eventSample('/stories/12/02/2004/my-story/index.html'),
        );
      },
      done,
    );
  });

  test('Placeholder (External) Redirects should work', done => {
    testScenario(
      eventSample('/things/2004/02/12/my-story'),
      event => {
        expect(event).toEqual(
          redirectSample('https://external.com/stuff/12/02/2004/my-story', 301),
        );
      },
      done,
    );
  });

  test('Splats (Internal) should work', done => {
    testScenario(
      eventSample('/shop/2004/01/10/my-story'),
      event => {
        expect(event).toEqual(
          redirectSample('/checkout/2004/01/10/my-story', 301),
        );
      },
      done,
    );
  });

  // test('Custom 404s should work', done => {
  //   testScenario(
  //     { rules },
  //     eventSample('/ecommerce'),
  //     event => {
  //       expect(event).toEqual(eventSample('/store-closed'));
  //     },
  //     done,
  //   );
  // });

  test('PrettyURLs should work', done => {
    testScenario(
      eventSample('/pretty/things.html'),
      event => {
        expect(event).toEqual(redirectSample('/pretty/things/', 301));
      },
      done,
    );
  });

  test('PrettyURLs should be ignored for existing files', done => {
    const inputEvent = eventSample('/something/about.html');
    testScenario(
      inputEvent,
      event => {
        expect(event).toEqual(inputEvent);
      },
      done,
    );
  });

  test('Proxying should work', done => {
    axios.mockImplementation(() => Promise.resolve(axiosSample));
    testScenario(
      eventSample('/api/users/iDVB'),
      event => {
        expect(event).toEqual(proxyResponseSample);
      },
      done,
    );
  });

  // test('Catch-all should work', done => {
  //   testScenario(
  //     { rules },
  //     eventSample('/somerandomlongthing'),
  //     event => {
  //       expect(event).toEqual(eventSample('/index.html'));
  //     },
  //     done,
  //   );
  // });
});

//  /photos/*    /images/*    200!
