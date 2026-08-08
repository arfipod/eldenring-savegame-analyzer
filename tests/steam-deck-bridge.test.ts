import { describe, expect, it } from 'vitest';
import {
  isPrivateIpv4,
  isSteamDeckOsRelease,
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
