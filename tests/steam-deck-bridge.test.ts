import { describe, expect, it } from 'vitest';
import {
  isPrivateIpv4,
  isLoopbackAddress,
  isSteamDeckOsRelease,
  knownHostPatternMatches,
  parseTrustedHostKeys,
  selectLatestSaveCandidate,
  validateDeckRequest,
} from '../server/steam-deck-bridge';

describe('local Steam Deck bridge', () => {
  it('only accepts private IPv4 targets', () => {
    expect(isPrivateIpv4('10.32.192.31')).toBe(true);
    expect(isPrivateIpv4('172.16.0.1')).toBe(true);
    expect(isPrivateIpv4('192.168.1.20')).toBe(true);
    expect(isPrivateIpv4('127.0.0.1')).toBe(true);
    expect(isPrivateIpv4('8.8.8.8')).toBe(false);
    expect(isPrivateIpv4('steamdeck.local')).toBe(false);
  });

  it('only treats loopback clients as local', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('192.168.1.20')).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });

  it('validates credentials without normalizing the password', () => {
    expect(validateDeckRequest({
      host: ' 10.32.192.31 ',
      username: ' deck ',
      password: ' pass with spaces ',
    })).toEqual({
      host: '10.32.192.31',
      username: 'deck',
      password: ' pass with spaces ',
    });
    expect(() => validateDeckRequest({ host: '1.1.1.1', username: 'deck', password: 'secret' })).toThrow();
    expect(() => validateDeckRequest({ host: '10.0.0.2', username: '../deck', password: 'secret' })).toThrow();
  });

  it('recognizes SteamOS identity without accepting a generic Linux host', () => {
    expect(isSteamDeckOsRelease('NAME="SteamOS"\nID=steamos\nVARIANT_ID=steamdeck\n')).toBe(true);
    expect(isSteamDeckOsRelease('NAME=Arch Linux\nID=arch\n')).toBe(false);
  });

  it('matches plain and hashed OpenSSH host patterns', async () => {
    expect(knownHostPatternMatches('10.32.192.31', '10.32.192.31')).toBe(true);
    expect(knownHostPatternMatches('[10.32.192.31]:22', '10.32.192.31')).toBe(true);
    expect(knownHostPatternMatches('10.32.192.32', '10.32.192.31')).toBe(false);

    const { createHmac } = await import('node:crypto');
    const salt = Buffer.from('fixed test salt');
    const digest = createHmac('sha1', salt).update('10.32.192.31').digest('base64');
    const pattern = `|1|${salt.toString('base64')}|${digest}`;
    expect(knownHostPatternMatches(pattern, '10.32.192.31')).toBe(true);
    expect(knownHostPatternMatches(pattern, '10.32.192.32')).toBe(false);
  });

  it('extracts only matching trusted public keys', () => {
    const key = Buffer.from('synthetic public key blob').toString('base64');
    const contents = `# comment\n10.32.192.31 ssh-ed25519 ${key}\n10.0.0.2 ssh-ed25519 ZGlmZmVyZW50\n`;
    expect([...parseTrustedHostKeys(contents, '10.32.192.31')]).toEqual([key]);
    expect(parseTrustedHostKeys(contents, '10.32.192.32').size).toBe(0);
  });

  it('chooses the newest save and prefers the native save on a timestamp tie', () => {
    expect(selectLatestSaveCandidate([
      { path: '/one/ER0000.sl2', fileName: 'ER0000.sl2', size: 20, modifiedAtSeconds: 100 },
      { path: '/two/ER0000.co2', fileName: 'ER0000.co2', size: 20, modifiedAtSeconds: 200 },
    ])?.fileName).toBe('ER0000.co2');
    expect(selectLatestSaveCandidate([
      { path: '/one/ER0000.co2', fileName: 'ER0000.co2', size: 20, modifiedAtSeconds: 300 },
      { path: '/two/ER0000.sl2', fileName: 'ER0000.sl2', size: 20, modifiedAtSeconds: 300 },
    ])?.fileName).toBe('ER0000.sl2');
    expect(selectLatestSaveCandidate([])).toBeNull();
  });
});
