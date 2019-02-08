import fs from 'fs';
import path from 'path';
import middy from 'middy';
import axios from 'axios';
import reroute from '.';
import _reduce from 'lodash.reduce';
import merge from './utils/deepmerge';
import {
  eventResponse,
  redirectResponse,
  customResponse,
  axiosResponse,
  proxyResponse,
} from './tests/responses';

const rules = fs
  .readFileSync(path.join(__dirname, './tests/_redirects'))
  .toString();
const rulesDomain = fs
  .readFileSync(
    path.join(__dirname, './tests/_redirects_reroute.danvanbrunt.com'),
  )
  .toString();
const html404 = fs
  .readFileSync(path.join(__dirname, './tests/404.html'))
  .toString();

jest.mock('axios');
jest.mock('./s3');
import S3 from './s3';

describe('📦  Reroute Middleware', () => {
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

  describe('Settings and Files', () => {
    it('No _redirects file, no files should pass-through', async () => {
      const event = await testReroute(eventResponse({ uri: '/asdf' }), {
        noFiles: ['asdf', 'asdf/index.html', '404.html', '_redirects'],
      });
      expect(event).toEqual(eventResponse({ uri: '/asdf/index.html' }));
    });

    it('No DefaultDoc should pass-through', async () => {
      const event = await testReroute(
        eventResponse({ uri: '/asdf' }),
        undefined,
        {
          defaultDoc: null,
        },
      );
      expect(event).toEqual(eventResponse({ uri: '/asdf' }));
    });

    it('No FriendlyURLs should pass-through', async () => {
      const event = await testReroute(
        eventResponse({ uri: '/asdf/index.html' }),
        undefined,
        {
          friendlyUrls: false,
        },
      );
      expect(event).toEqual(eventResponse({ uri: '/asdf/index.html' }));
    });

    it('Root route should work', async () => {
      const event = await testReroute(eventResponse({ uri: '/' }));
      expect(event).toEqual(eventResponse({ uri: '/index.html' }));
    });
  });

  describe('URL Normalization', () => {
    it('PrettyURLs should work', async () => {
      const event = await testReroute(
        eventResponse({ uri: '/pretty/things.html' }),
      );
      expect(event).toEqual(redirectResponse('/pretty/things/', 301));
    });

    it('PrettyURLs should be ignored for existing files', async () => {
      const inputEvent = eventResponse({ uri: '/something/about.html' });
      const event = await testReroute(inputEvent);
      expect(event).toEqual(inputEvent);
    });

    it('Trailing slash normalization should work', async () => {
      const event = await testReroute(eventResponse({ uri: '/trailingslash' }));
      expect(event).toEqual(redirectResponse('/trailred', 301));
    });

    it('DefaultDoc with pass-throughs should work', async () => {
      const event = await testReroute(eventResponse({ uri: '/asdfdsfsd/' }));
      expect(event).toEqual(eventResponse({ uri: '/asdfdsfsd/index.html' }));
    });
  });

  describe('Redirects', () => {
    it('Basics should work', async () => {
      const event = await testReroute(eventResponse({ uri: '/internal1' }));
      expect(event).toEqual(redirectResponse('/internal2', 301));
    });

    it('Internal with 301 should work', async () => {
      const event = await testReroute(eventResponse({ uri: '/internal3' }));
      expect(event).toEqual(redirectResponse('/internal4', 301));
    });

    it('Internal with 302 should work', async () => {
      const event = await testReroute(eventResponse({ uri: '/internal5' }));
      expect(event).toEqual(redirectResponse('/internal6', 302));
    });

    it('Internal with 303 should work', async () => {
      const event = await testReroute(eventResponse({ uri: '/internal7' }));
      expect(event).toEqual(redirectResponse('/internal8', 303));
    });

    it('External should work', async () => {
      const event = await testReroute(eventResponse({ uri: '/internal9' }));
      expect(event).toEqual(redirectResponse('https://external.com', 301));
    });
  });

  describe('Rewrites', () => {
    it('Basic Rewrites should work', async () => {
      const event = await testReroute(eventResponse({ uri: '/news/' }));
      expect(event).toEqual(eventResponse({ uri: '/blog/index.html' }));
    });

    it('Rewrites w/o file should custom 404', async () => {
      const event = await testReroute(eventResponse({ uri: '/stuff/' }));
      expect(event).toEqual(customResponse(html404));
    });

    it('Rewrites w/o file OR custom 404 should pass-through', async () => {
      const event = await testReroute(eventResponse({ uri: '/stuff/' }), {
        noFiles: ['nofilehere/index.html', '404.html'],
      });
      expect(event).toEqual(eventResponse({ uri: '/nofilehere/index.html' }));
    });
  });

  describe('Proxying', () => {
    it('Basic should work', async () => {
      axios.mockImplementation(() => Promise.resolve(axiosResponse));
      const event = await testReroute(
        eventResponse({ uri: '/api/users/iDVB' }),
      );
      expect(event).toEqual(proxyResponse);
    });
  });

  describe('Placeholders & Splats', () => {
    it('Placeholder (Internal) Redirects should work', async () => {
      const event = await testReroute(
        eventResponse({ uri: '/news/2004/02/12/my-story' }),
      );
      expect(event).toEqual(redirectResponse('/blog/12/02/2004/my-story', 301));
    });

    it('Placeholder (Internal) Rewrites should work', async () => {
      const event = await testReroute(
        eventResponse({ uri: '/articles/2004/02/12/my-story' }),
      );
      expect(event).toEqual(
        eventResponse({ uri: '/stories/12/02/2004/my-story/index.html' }),
      );
    });

    it('Placeholder (External) Redirects should work', async () => {
      const event = await testReroute(
        eventResponse({ uri: '/things/2004/02/12/my-story' }),
      );
      expect(event).toEqual(
        redirectResponse('https://external.com/stuff/12/02/2004/my-story', 301),
      );
    });

    it('Splats (Internal) should work', async () => {
      const event = await testReroute(
        eventResponse({ uri: '/shop/2004/01/10/my-story' }),
      );
      expect(event).toEqual(
        redirectResponse('/checkout/2004/01/10/my-story', 301),
      );
    });
  });

  describe('Host Domains', () => {
    it('FROM rule should work', async () => {
      axios.mockImplementation(() => Promise.resolve(axiosResponse));
      const host = 'reroute.danvanbrunt.com';
      const event = await testReroute(
        eventResponse({ uri: '/hosttest', headers: { host } }),
        {
          fileContents: { [`_redirects_${host}`]: rulesDomain },
        },
        { multiFile: true },
      );
      expect(event).toEqual(redirectResponse('https://thestar.com', 301));
    });

    it('FROM with no rule should pass-through', async () => {
      axios.mockImplementation(() => Promise.resolve(axiosResponse));
      const host = 'red.danvanbrunt.com';
      const event = await testReroute(
        eventResponse({ uri: '/hosttest', headers: { host } }),
        {
          noFiles: [`_redirects_${host}`],
        },
        { multiFile: true },
      );
      expect(event).toEqual(eventResponse({ uri: '/hosttest/index.html' }));
    });

    it('Absolute FROM should work', async () => {
      const host1 = 'red.danvanbrunt.com';
      const host2 = 'blue.danvanbrunt.com';
      const rules = `
        https://${host1}/local  https://twitter.com   302!
        /local  https://www.cnn.com   302!
      `;

      const matchEvent = await testReroute(
        eventResponse({ uri: '/local', headers: { host: host1 } }),
        undefined,
        { rules },
      );
      expect(matchEvent).toEqual(redirectResponse('https://twitter.com', 302));

      const unMatchEvent = await testReroute(
        eventResponse({ uri: '/local', headers: { host: host2 } }),
        undefined,
        { rules },
      );
      expect(unMatchEvent).toEqual(
        redirectResponse('https://www.cnn.com', 302),
      );
    });
  });

  describe('Custom 404s', () => {
    it('When missing should pass-through', async () => {
      const event = await testReroute(eventResponse({ uri: '/ecommerce' }), {
        noFiles: ['store-closed/index.html', '404.html'],
      });
      expect(event).toEqual(eventResponse({ uri: '/store-closed/index.html' }));
    });
  });

  describe('Special Rules', () => {
    it('Condition Language match should work', async () => {
      const rules = `/langtest  /match   302!  Language=en,fr`;
      const matchEvent = await testReroute(
        eventResponse({
          uri: '/langtest',
          headers: {
            'accept-language': 'en-GB,en-US;q=0.9,fr-CA;q=0.7,en;q=0.8',
          },
        }),
        undefined,
        { rules },
      );
      expect(matchEvent).toEqual(redirectResponse('/match', 302));

      const unMatchEvent = await testReroute(
        eventResponse({ uri: '/langtest' }),
        undefined,
        { rules },
      );
      expect(unMatchEvent).toEqual(
        eventResponse({ uri: '/langtest/index.html' }),
      );
    });

    it('Condition Country should work', async () => {
      const rules = `/countrytest  /match   302!  Country=US,CA`;
      const matchEvent = await testReroute(
        eventResponse({
          uri: '/countrytest',
          headers: { 'cloudfront-viewer-country': 'CA' },
        }),
        undefined,
        { rules },
      );
      expect(matchEvent).toEqual(redirectResponse('/match', 302));

      const unMatchEvent = await testReroute(
        eventResponse({ uri: '/countrytest' }),
        undefined,
        { rules },
      );
      expect(unMatchEvent).toEqual(
        eventResponse({ uri: '/countrytest/index.html' }),
      );
    });
  });

  describe('Caching', () => {
    it('RulesGet should cache', async () => {
      expect.assertions(2);
      const midOpt = { cacheTtl: 1 };
      await testReroute(eventResponse({ uri: '/test1' }), undefined, midOpt);
      await testReroute(eventResponse({ uri: '/test2' }), undefined, midOpt);
      await testReroute(eventResponse({ uri: '/test3' }), undefined, midOpt);
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
      await testReroute(eventResponse({ uri: '/test1' }), undefined, midOpt);
      await testReroute(eventResponse({ uri: '/test2' }), undefined, midOpt);
      expectNCallsWithArgs(S3.getObject.mock.calls, 2, [
        expect.objectContaining({
          Key: '_redirects',
        }),
      ]);
    });
  });
});

const expectNCallsWithArgs = (received, numCalls, expected) => {
  const calls = [...Array(numCalls)].map(() => expected);
  return expect(received).toEqual(calls);
};
