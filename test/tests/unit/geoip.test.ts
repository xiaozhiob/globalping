import * as fs from 'node:fs';
import nock from 'nock';
import mockFs from 'mock-fs';
import { expect } from 'chai';
import type { LocationInfo } from '../../../src/lib/geoip/client.js';
import { fastlyLookup } from '../../../src/lib/geoip/providers/fastly.js';
import GeoipClient from '../../../src/lib/geoip/client.js';
import NullCache from '../../../src/lib/cache/null-cache.js';
import { scopedLogger } from '../../../src/lib/logger.js';
import { populateMemList } from '../../../src/lib/geoip/whitelist.js';
import nockGeoIpProviders from '../../utils/nock-geo-ip.js';

const mocks = JSON.parse(fs.readFileSync('./test/mocks/nock-geoip.json').toString()) as Record<string, any>;

const MOCK_IP = '131.255.7.26';

describe('geoip service', () => {
	let client: GeoipClient;

	before(async () => {
		await populateMemList();

		client = new GeoipClient(
			new NullCache(),
			scopedLogger('geoip:test'),
		);
	});

	afterEach(() => {
		nock.cleanAll();
	});

	it('should use maxmind & digitalelement consensus', async () => {
		nockGeoIpProviders({ fastly: 'argentina', ipinfo: 'argentina', maxmind: 'argentina' });

		const info = await client.lookup(MOCK_IP);

		expect(info).to.deep.equal({
			continent: 'SA',
			country: 'AR',
			normalizedRegion: 'south america',
			region: 'South America',
			state: undefined,
			city: 'Buenos Aires',
			normalizedCity: 'buenos aires',
			asn: 61_493,
			latitude: -34.602,
			longitude: -58.384,
			network: 'interbs s.r.l.',
			normalizedNetwork: 'interbs s.r.l.',
		});
	});

	it('should use ipinfo as a fallback', async () => {
		nock('https://globalping-geoip.global.ssl.fastly.net').get(/.*/).reply(200, mocks.fastly.argentina);
		nock('https://ipinfo.io').get(/.*/).reply(200, mocks.ipinfo.argentina);
		nock('https://geoip.maxmind.com/geoip/v2.1/city/').get(/.*/).reply(400);

		const info = await client.lookup(MOCK_IP);

		expect(info).to.deep.equal({
			asn: 61_493,
			city: 'Lagoa do Carro',
			normalizedCity: 'lagoa do carro',
			continent: 'SA',
			normalizedRegion: 'south america',
			region: 'South America',
			country: 'BR',
			latitude: -7.7568,
			longitude: -35.3656,
			state: undefined,
			network: 'InterBS S.R.L. (BAEHOST)',
			normalizedNetwork: 'interbs s.r.l. (baehost)',
		});
	});

	it('should work when ipinfo is down (prioritize maxmind)', async () => {
		nock('https://globalping-geoip.global.ssl.fastly.net').get(/.*/).reply(200, mocks.fastly.argentina);
		nock('https://ipinfo.io').get(/.*/).reply(400);
		nock('https://geoip.maxmind.com/geoip/v2.1/city/').get(/.*/).reply(200, mocks.maxmind.argentina);

		const info = await client.lookup(MOCK_IP);

		expect(info).to.deep.equal({
			asn: 61_493,
			city: 'Buenos Aires',
			normalizedCity: 'buenos aires',
			continent: 'SA',
			normalizedRegion: 'south america',
			region: 'South America',
			country: 'AR',
			latitude: -34.602,
			longitude: -58.384,
			state: undefined,
			network: 'interbs s.r.l.',
			normalizedNetwork: 'interbs s.r.l.',
		});
	});

	it('should fail when only fastly reports', async () => {
		nock('https://globalping-geoip.global.ssl.fastly.net').get(/.*/).reply(200, mocks.fastly.default);
		nock('https://ipinfo.io').get(/.*/).reply(400);
		nock('https://geoip.maxmind.com/geoip/v2.1/city/').get(/.*/).reply(500);

		const info = await client.lookup(MOCK_IP).catch((error: Error) => error);

		expect(info).to.be.an.instanceof(Error);
		expect((info as Error).message).to.equal(`unresolvable geoip: ${MOCK_IP}`);
	});

	it('should work when fastly is down', async () => {
		nock('https://globalping-geoip.global.ssl.fastly.net').get(/.*/).reply(400);
		nock('https://ipinfo.io').get(/.*/).reply(200, mocks.ipinfo.argentina);
		nock('https://geoip.maxmind.com/geoip/v2.1/city/').get(/.*/).reply(200, mocks.maxmind.argentina);

		const info = await client.lookup(MOCK_IP);

		expect(info).to.deep.equal({
			asn: 61_493,
			city: 'Lagoa do Carro',
			normalizedCity: 'lagoa do carro',
			continent: 'SA',
			normalizedRegion: 'south america',
			region: 'South America',
			country: 'BR',
			latitude: -7.7568,
			longitude: -35.3656,
			state: undefined,
			network: 'InterBS S.R.L. (BAEHOST)',
			normalizedNetwork: 'interbs s.r.l. (baehost)',
		});
	});

	it('should work when maxmind is down', async () => {
		nock('https://globalping-geoip.global.ssl.fastly.net').get(/.*/).reply(200, mocks.fastly.argentina);
		nock('https://ipinfo.io').get(/.*/).reply(200, mocks.ipinfo.argentina);
		nock('https://geoip.maxmind.com/geoip/v2.1/city/').get(/.*/).reply(400);

		const info = await client.lookup(MOCK_IP);

		expect(info).to.deep.equal({
			asn: 61_493,
			city: 'Lagoa do Carro',
			normalizedCity: 'lagoa do carro',
			continent: 'SA',
			normalizedRegion: 'south america',
			region: 'South America',
			country: 'BR',
			latitude: -7.7568,
			longitude: -35.3656,
			state: undefined,
			network: 'InterBS S.R.L. (BAEHOST)',
			normalizedNetwork: 'interbs s.r.l. (baehost)',
		});
	});

	it('should detect US state', async () => {
		nockGeoIpProviders();

		const info = await client.lookup(MOCK_IP);

		expect(info).to.deep.equal({
			asn: 123,
			city: 'Dallas',
			normalizedCity: 'dallas',
			continent: 'NA',
			normalizedRegion: 'northern america',
			region: 'Northern America',
			country: 'US',
			latitude: 32.7492,
			longitude: -96.8389,
			state: 'TX',
			network: 'Psychz Networks',
			normalizedNetwork: 'psychz networks',
		});
	});

	it('should filter out incomplete results', async () => {
		nockGeoIpProviders({ maxmind: 'emptyCity', fastly: 'emptyCity', ipinfo: 'argentina' });

		const info = await client.lookup(MOCK_IP);

		expect(info).to.deep.equal({
			asn: 61_493,
			normalizedCity: 'lagoa do carro',
			city: 'Lagoa do Carro',
			continent: 'SA',
			normalizedRegion: 'south america',
			region: 'South America',
			country: 'BR',
			state: undefined,
			latitude: -7.7568,
			longitude: -35.3656,
			network: 'InterBS S.R.L. (BAEHOST)',
			normalizedNetwork: 'interbs s.r.l. (baehost)',
		});
	});

	it('should query normalized city field', async () => {
		nockGeoIpProviders({ maxmind: 'newYork', fastly: 'newYork', ipinfo: 'newYork' });

		const info = await client.lookup(MOCK_IP);

		expect(info).to.deep.equal({
			asn: 61_493,
			normalizedCity: 'new york',
			city: 'New York',
			normalizedRegion: 'northern america',
			region: 'Northern America',
			continent: 'NA',
			country: 'US',
			state: 'NY',
			latitude: -7.7568,
			longitude: -35.3656,
			network: 'InterBS S.R.L. (BAEHOST)',
			normalizedNetwork: 'interbs s.r.l. (baehost)',
		});
	});

	it('should pick maxmind, if ipinfo has no city', async () => {
		nockGeoIpProviders({ ipinfo: 'emptyCity' });

		const info = await client.lookup(MOCK_IP);

		expect(info).to.deep.equal({
			continent: 'NA',
			country: 'US',
			state: '',
			city: 'Dallas',
			region: 'Northern America',
			normalizedRegion: 'northern america',
			normalizedCity: 'dallas',
			asn: 40676,
			latitude: 32.814,
			longitude: -96.87,
			network: 'psychz networks',
			normalizedNetwork: 'psychz networks',
		});
	});

	describe('network match', () => {
		it('should pick ipinfo data + maxmind network (missing network data)', async () => {
			nockGeoIpProviders({ ipinfo: 'emptyNetwork' });

			const info = await client.lookup(MOCK_IP);

			expect(info).to.deep.equal({
				continent: 'NA',
				normalizedRegion: 'northern america',
				region: 'Northern America',
				country: 'US',
				state: 'TX',
				city: 'Dallas',
				normalizedCity: 'dallas',
				asn: 40_676,
				latitude: 32.7492,
				longitude: -96.8389,
				network: 'psychz networks',
				normalizedNetwork: 'psychz networks',
			});
		});

		it('should pick ipinfo data + maxmind network (undefined network data)', async () => {
			nockGeoIpProviders({ fastly: 'emptyCity', ipinfo: 'undefinedNetwork' });

			const info = await client.lookup(MOCK_IP);

			expect(info).to.deep.equal({
				continent: 'NA',
				normalizedRegion: 'northern america',
				region: 'Northern America',
				country: 'US',
				state: 'TX',
				city: 'Dallas',
				normalizedCity: 'dallas',
				asn: 40_676,
				latitude: 32.7492,
				longitude: -96.8389,
				network: 'psychz networks',
				normalizedNetwork: 'psychz networks',
			});
		});

		it('should fail (missing network data + city mismatch)', async () => {
			nockGeoIpProviders({ fastly: 'emptyCity', ipinfo: 'emptyNetwork', maxmind: 'argentina' });
			nock('https://globalping-geoip.global.ssl.fastly.net').get(/.*/).reply(200, mocks.fastly.emptyCity);
			nock('https://ipinfo.io').get(/.*/).reply(200, mocks.ipinfo.emptyNetwork);
			nock('https://geoip.maxmind.com/geoip/v2.1/city/').get(/.*/).reply(200, mocks.maxmind.argentina);

			const info: LocationInfo | Error = await client.lookup(MOCK_IP).catch((error: Error) => error);

			expect(info).to.be.instanceof(Error);
		});
	});

	describe('provider parsing', () => {
		describe('fastly', () => {
			it('should filter out "reserved" city name', async () => {
				nock('https://globalping-geoip.global.ssl.fastly.net').get(/.*/).reply(200, mocks.fastly.reserved);

				const result = await fastlyLookup(MOCK_IP);

				expect(result).to.deep.equal({
					client: undefined,
					location: {
						asn: 61_493,
						city: '',
						normalizedCity: '',
						continent: 'SA',
						country: 'AR',
						latitude: -34.61,
						longitude: -58.42,
						network: 'interbs s.r.l.',
						normalizedNetwork: 'interbs s.r.l.',
						state: undefined,
					},
				});
			});

			it('should filter out "private" city name', async () => {
				nock('https://globalping-geoip.global.ssl.fastly.net').get(/.*/).reply(200, mocks.fastly.private);

				const result = await fastlyLookup(MOCK_IP);

				expect(result).to.deep.equal({
					client: undefined,
					location: {
						asn: 61_493,
						city: '',
						normalizedCity: '',
						continent: 'SA',
						country: 'AR',
						latitude: -34.61,
						longitude: -58.42,
						network: 'interbs s.r.l.',
						normalizedNetwork: 'interbs s.r.l.',
						state: undefined,
					},
				});
			});
		});
	});

	describe('limit vpn/tor connection', () => {
		it('should pass - non-vpn', async () => {
			nockGeoIpProviders();

			const response: LocationInfo | Error = await client.lookup(MOCK_IP).catch((error: Error) => error);

			expect(response).to.deep.equal({
				asn: 123,
				city: 'Dallas',
				normalizedCity: 'dallas',
				normalizedRegion: 'northern america',
				region: 'Northern America',
				continent: 'NA',
				country: 'US',
				latitude: 32.7492,
				longitude: -96.8389,
				state: 'TX',
				network: 'Psychz Networks',
				normalizedNetwork: 'psychz networks',
			});
		});

		it('should pass - no client object', async () => {
			nockGeoIpProviders({ fastly: 'noClient' });

			const response: LocationInfo | Error = await client.lookup(MOCK_IP).catch((error: Error) => error);

			expect(response).to.deep.equal({
				asn: 123,
				city: 'Dallas',
				normalizedCity: 'dallas',
				continent: 'NA',
				normalizedRegion: 'northern america',
				region: 'Northern America',
				country: 'US',
				latitude: 32.7492,
				longitude: -96.8389,
				state: 'TX',
				network: 'Psychz Networks',
				normalizedNetwork: 'psychz networks',
			});
		});

		it('should pass - detect VPN (whitelisted)', async () => {
			const MOCK_IP = '5.134.119.43';

			mockFs({
				config: {
					'whitelist-ips.txt': `${MOCK_IP}`,
				},
			});

			nockGeoIpProviders({ fastly: 'proxyDescVpn' });

			const response: LocationInfo | Error = await client.lookup(MOCK_IP).catch((error: Error) => error);

			expect(response).to.deep.equal({
				asn: 123,
				city: 'Dallas',
				normalizedCity: 'dallas',
				continent: 'NA',
				normalizedRegion: 'northern america',
				region: 'Northern America',
				country: 'US',
				latitude: 32.7492,
				longitude: -96.8389,
				state: 'TX',
				network: 'Psychz Networks',
				normalizedNetwork: 'psychz networks',
			});

			mockFs.restore();
		});

		it('should detect VPN (proxy_desc)', async () => {
			nockGeoIpProviders({ fastly: 'proxyDescVpn' });

			const response: LocationInfo | Error = await client.lookup(MOCK_IP).catch((error: Error) => error);

			expect(response).to.be.instanceof(Error);
			expect((response as Error).message).to.equal('vpn detected');
		});

		it('should detect TOR-EXIT (proxy_desc)', async () => {
			nockGeoIpProviders({ fastly: 'proxyDescTor' });

			const response: LocationInfo | Error = await client.lookup(MOCK_IP).catch((error: Error) => error);

			expect(response).to.be.instanceof(Error);
			expect((response as Error).message).to.equal('vpn detected');
		});

		it('should detect corporate (proxy_type)', async () => {
			nockGeoIpProviders({ fastly: 'proxyTypeCorporate' });

			const response: LocationInfo | Error = await client.lookup(MOCK_IP).catch((error: Error) => error);

			expect(response).to.be.instanceof(Error);
			expect((response as Error).message).to.equal('vpn detected');
		});

		it('should detect aol (proxy_type)', async () => {
			nockGeoIpProviders({ fastly: 'proxyTypeAol' });

			const response: LocationInfo | Error = await client.lookup(MOCK_IP).catch((error: Error) => error);

			expect(response).to.be.instanceof(Error);
			expect((response as Error).message).to.equal('vpn detected');
		});

		it('should detect anonymous (proxy_type)', async () => {
			nockGeoIpProviders({ fastly: 'proxyTypeAnonymous' });

			const response: LocationInfo | Error = await client.lookup(MOCK_IP).catch((error: Error) => error);

			expect(response).to.be.instanceof(Error);
			expect((response as Error).message).to.equal('vpn detected');
		});

		it('should detect blackberry (proxy_type)', async () => {
			nockGeoIpProviders({ fastly: 'proxyTypeBlackberry' });

			const response: LocationInfo | Error = await client.lookup(MOCK_IP).catch((error: Error) => error);

			expect(response).to.be.instanceof(Error);
			expect((response as Error).message).to.equal('vpn detected');
		});
	});
});
