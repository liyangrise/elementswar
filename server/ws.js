'use strict';
/* 极简 WebSocket 服务端实现（RFC 6455），零依赖 —— 服务器上不需要 npm install */
const crypto = require('crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

class Conn {
  constructor(socket, ip) {
    this.socket = socket;
    this.ip = ip;
    this.buf = Buffer.alloc(0);
    this.closed = false;
    this.onMessage = () => {};
    this.onClose = () => {};
  }

  send(obj) {
    if (this.closed) return;
    this.sendFrame(0x1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8'));
  }

  sendFrame(opcode, payload) {
    if (this.closed || this.socket.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    header[0] = 0x80 | opcode;
    try { this.socket.write(Buffer.concat([header, payload])); } catch (e) { this.close(); }
  }

  ping() { this.sendFrame(0x9, Buffer.alloc(0)); }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.sendFrame(0x8, Buffer.alloc(0)); } catch (e) { }
    try { this.socket.end(); } catch (e) { }
    this.onClose();
  }

  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < off + 2) return;
        len = this.buf.readUInt16BE(off); off += 2;
      } else if (len === 127) {
        if (this.buf.length < off + 8) return;
        len = Number(this.buf.readBigUInt64BE(off)); off += 8;
      }
      let mask = null;
      if (masked) {
        if (this.buf.length < off + 4) return;
        mask = this.buf.slice(off, off + 4); off += 4;
      }
      if (this.buf.length < off + len) return;
      const payload = Buffer.from(this.buf.slice(off, off + len));
      this.buf = this.buf.slice(off + len);
      if (masked && mask) {
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      if (opcode === 0x8) { this.close(); return; }
      if (opcode === 0x9) { this.sendFrame(0xA, payload); continue; }
      if (opcode === 0xA) continue;
      if ((opcode === 0x1 || opcode === 0x2) && fin) {
        let msg;
        try { msg = JSON.parse(payload.toString('utf8')); } catch (e) { continue; }
        this.onMessage(msg);
      }
    }
  }
}

function attach(httpServer, onConnection) {
  httpServer.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    socket.setNoDelay(true);
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + acceptKey(key) + '\r\n\r\n'
    );
    const ip = (req.socket.remoteAddress || '').replace('::ffff:', '');
    const conn = new Conn(socket, ip);
    socket.on('data', (d) => conn.onData(d));
    socket.on('error', () => conn.close());
    socket.on('close', () => conn.close());
    conn.onData(Buffer.alloc(0));
    onConnection(conn, req);
  });
}

module.exports = { attach };
