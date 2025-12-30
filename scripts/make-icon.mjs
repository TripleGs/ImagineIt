import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const svgPath = path.join(rootDir, 'assets', 'icon.svg');
const outPath = path.join(rootDir, 'assets', 'icon.png');

const size = Number.parseInt(process.argv[2], 10) || 512;
const cornerRadius = Number.parseFloat(process.argv[3]) || 18;

function addRoundedCorners(svg) {
    // Add rx/ry to the first rect (background) if missing.
    return svg.replace(/<rect([^>]*?)(\/?)>/, (match, attrs, selfClose) => {
        if (/\brx=/.test(attrs)) return match;
        const separator = attrs.endsWith(' ') ? '' : ' ';
        const end = selfClose === '/' ? ' />' : '>';
        return `<rect${attrs}${separator}rx="${cornerRadius}" ry="${cornerRadius}"${end}`;
    });
}

async function run() {
    if (!fs.existsSync(svgPath)) {
        console.error(`Missing SVG at ${svgPath}`);
        app.exit(1);
        return;
    }

    const svg = fs.readFileSync(svgPath, 'utf8');
    const roundedSvg = addRoundedCorners(svg);
    const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(roundedSvg).toString('base64')}`;

    const html = `<!doctype html>
<html>
<body style="margin:0;background:transparent;">
<canvas id="c" width="${size}" height="${size}"></canvas>
<script>
const svgDataUrl = ${JSON.stringify(svgDataUrl)};
const img = new Image();
img.onload = () => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  window.__iconPng = canvas.toDataURL('image/png');
};
img.onerror = () => { window.__iconPng = null; };
img.src = svgDataUrl;
</script>
</body>
</html>`;

    const win = new BrowserWindow({
        show: false,
        width: size,
        height: size,
        webPreferences: {
            offscreen: true,
            contextIsolation: true,
            sandbox: true
        }
    });

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await win.loadURL(dataUrl);

    const pngDataUrl = await win.webContents.executeJavaScript(`
        new Promise((resolve, reject) => {
            const start = Date.now();
            const tick = () => {
                if (window.__iconPng !== undefined) return resolve(window.__iconPng);
                if (Date.now() - start > 5000) return reject(new Error('Timed out'));
                requestAnimationFrame(tick);
            };
            tick();
        })
    `);

    if (!pngDataUrl) {
        console.error('Failed to render SVG to image.');
        app.exit(1);
        return;
    }

    const base64 = pngDataUrl.split(',')[1];
    fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
    console.log(`Wrote ${outPath}`);
    win.close();
    app.exit(0);
}

app.whenReady().then(run);
