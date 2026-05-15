import { spawn } from 'child_process';

const dev = spawn('npm', ['run', 'dev'], { stdio: 'pipe', shell: true });
let output = '';
dev.stdout.on('data', d => {
  output += d.toString();
  if (output.includes('Ready') || output.includes('started server') || output.includes('compiled successfully')) {
    setTimeout(async () => {
      try {
        const res = await fetch('http://localhost:3000/', { redirect: 'manual' });
        console.log("STATUS:", res.status);
        console.log("LOCATION:", res.headers.get('location'));
        
        const res2 = await fetch('http://localhost:3000/login', { redirect: 'manual' });
        console.log("LOGIN STATUS:", res2.status);
      } catch (e) {
        console.log("ERR:", e);
      }
      dev.kill();
      process.exit(0);
    }, 3000);
  }
});
dev.stderr.on('data', d => console.error(d.toString()));
setTimeout(() => {
  console.log("Timeout reached");
  dev.kill();
  process.exit(1);
}, 20000);
