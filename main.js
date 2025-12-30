import { initScene, scene, camera, renderer } from './js/scene.js';
import { initControls, orbitControls } from './js/controls.js';
import { initSelection } from './js/selection.js';
import { initUI } from './js/ui.js';
import { state } from './js/state.js';
import { alignTool } from './js/alignTool.js';
import { faceSnapTool } from './js/faceSnapTool.js';
import { transformTool } from './js/transformTool.js';

import { initDashboard } from './js/dashboard.js';
console.log('main.js: calling initScene');
initScene();
console.log('main.js: initScene returned');
initControls(camera, renderer);
initSelection(camera, renderer);
initUI();
initDashboard();
faceSnapTool.init(camera, renderer);

function animate() {
    requestAnimationFrame(animate);
    orbitControls.update();
    alignTool.update();
    transformTool.update();
    renderer.render(scene, camera);
}

animate();

// Splash Screen Logic
function initSplash() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('fade-out');
            setTimeout(() => {
                splash.style.display = 'none';
            }, 800); // 800ms matches CSS transition
        }, 2500); // Show splash for 2.5 seconds
    }
}

initSplash();
