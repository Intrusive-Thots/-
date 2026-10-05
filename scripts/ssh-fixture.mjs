import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';

const require = createRequire(import.meta.url);
const { Server, Client } = require('ssh2');

const mode = process.argv[2];
const port = Number(process.argv[3] || 2224);
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const hostKey = privateKey.export({ type: 'pkcs1', format: 'pem' });

if (mode === 'fingerprint') {
  const conn = new Client();
  conn.on('ready', () => {
    conn.end();
  });
  conn.on('error', (error) => {
    console.error(error.message);
    process.exit(1);
  });
  conn.connect({
    host: '127.0.0.1',
    port,
    username: 'root',
    password: 'secret',
    hostHash: 'sha256',
    readyTimeout: 8000,
    hostVerifier: (fingerprint) => {
      process.stdout.write(`${fingerprint}\n`);
      return true;
    },
  });
} else {
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    client.on('error', () => {});
    client.on('authentication', (ctx) => {
      if (ctx.method === 'none') {
        ctx.reject(['password', 'keyboard-interactive']);
        return;
      }
      if (ctx.method === 'password' && ctx.username === 'root' && ctx.password === 'secret') {
        ctx.accept();
        return;
      }
      if (ctx.method === 'keyboard-interactive' && ctx.username === 'root') {
        ctx.prompt([{ prompt: 'Password: ', echo: false }], (answers) => {
          if (answers && answers[0] === 'secret') ctx.accept();
          else ctx.reject(['password']);
        });
        return;
      }
      ctx.reject(['password']);
    });
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept();
        session.on('exec', (acceptExec, _reject, info) => {
          const stream = acceptExec();
          if (info.command === 'exit-7') {
            stream.stderr.write('failed');
            stream.exit(7);
            stream.close();
            return;
          }
          stream.write(`OUT:${info.command}\n`);
          stream.exit(0);
          stream.close();
        });
      });
    });
  });
  server.on('error', (error) => {
    console.error(error.message);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`READY ${port}\n`);
  });
}
