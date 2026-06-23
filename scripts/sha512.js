import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const password = process.argv[2] || await promptPassword();
const hash = createHash('sha512').update(password).digest('hex');
console.log(hash);

async function promptPassword() {
  const rl = createInterface({ input, output });
  const value = await rl.question('LGU+ password: ');
  rl.close();
  return value;
}
