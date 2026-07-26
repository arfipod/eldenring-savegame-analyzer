import type { ByteTuple4 } from '../types';

export class SaveParseError extends Error {
  readonly offset?: number;

  constructor(message: string, offset?: number) {
    super(offset === undefined ? message : `${message} (offset 0x${offset.toString(16)})`);
    this.name = 'SaveParseError';
    this.offset = offset;
  }
}

export class BinaryReader {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  private cursor = 0;

  constructor(buffer: ArrayBuffer) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);
  }

  get length(): number {
    return this.bytes.byteLength;
  }

  pos(): number {
    return this.cursor;
  }

  remaining(): number {
    return this.length - this.cursor;
  }

  ensure(length: number, at = this.cursor): void {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new SaveParseError(`Longitud binaria inválida: ${length}`, at);
    }
    if (at < 0 || at + length > this.length) {
      throw new SaveParseError(
        `Partida truncada: se necesitan ${length} bytes y quedan ${Math.max(0, this.length - at)}`,
        at,
      );
    }
  }

  seek(position: number): void {
    this.ensure(0, position);
    this.cursor = position;
  }

  skip(length: number): void {
    this.ensure(length);
    this.cursor += length;
  }

  u8(): number {
    this.ensure(1);
    return this.bytes[this.cursor++] ?? 0;
  }

  i8(): number {
    const value = this.u8();
    return value > 0x7f ? value - 0x100 : value;
  }

  u16(): number {
    this.ensure(2);
    const value = this.view.getUint16(this.cursor, true);
    this.cursor += 2;
    return value;
  }

  i16(): number {
    this.ensure(2);
    const value = this.view.getInt16(this.cursor, true);
    this.cursor += 2;
    return value;
  }

  u32(): number {
    this.ensure(4);
    const value = this.view.getUint32(this.cursor, true);
    this.cursor += 4;
    return value;
  }

  i32(): number {
    this.ensure(4);
    const value = this.view.getInt32(this.cursor, true);
    this.cursor += 4;
    return value;
  }

  f32(): number {
    this.ensure(4);
    const value = this.view.getFloat32(this.cursor, true);
    this.cursor += 4;
    return value;
  }

  u64String(): string {
    this.ensure(8);
    const value = this.view.getBigUint64(this.cursor, true);
    this.cursor += 8;
    return value.toString();
  }

  byteTuple4(): ByteTuple4 {
    return [this.u8(), this.u8(), this.u8(), this.u8()];
  }

  bytesCopy(length: number): Uint8Array {
    this.ensure(length);
    const result = this.bytes.slice(this.cursor, this.cursor + length);
    this.cursor += length;
    return result;
  }

  bytesView(length: number): Uint8Array {
    this.ensure(length);
    const result = this.bytes.subarray(this.cursor, this.cursor + length);
    this.cursor += length;
    return result;
  }

  byteAt(position: number): number {
    this.ensure(1, position);
    return this.bytes[position] ?? 0;
  }

  u16At(position: number): number {
    this.ensure(2, position);
    return this.view.getUint16(position, true);
  }

  u32At(position: number): number {
    this.ensure(4, position);
    return this.view.getUint32(position, true);
  }

  i32At(position: number): number {
    this.ensure(4, position);
    return this.view.getInt32(position, true);
  }

  f32At(position: number): number {
    this.ensure(4, position);
    return this.view.getFloat32(position, true);
  }

  u64StringAt(position: number): string {
    this.ensure(8, position);
    return this.view.getBigUint64(position, true).toString();
  }

  subarrayAt(position: number, length: number): Uint8Array {
    this.ensure(length, position);
    return this.bytes.subarray(position, position + length);
  }

  utf16LeAt(position: number, byteLength: number): string {
    const raw = this.subarrayAt(position, byteLength);
    let end = 0;
    while (end + 1 < raw.length && !(raw[end] === 0 && raw[end + 1] === 0)) {
      end += 2;
    }
    return new TextDecoder('utf-16le').decode(raw.subarray(0, end)).trimEnd();
  }
}

export function bytesToHex(bytes: Uint8Array, maxLength = bytes.length): string {
  return Array.from(bytes.subarray(0, maxLength), (value) => value.toString(16).padStart(2, '0')).join('');
}
