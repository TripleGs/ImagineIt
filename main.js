import { initScene, scene, camera, renderer } from './js/scene.js';
import { initControls, orbitControls } from './js/controls.js';
import { initSelection } from './js/selection.js';
import { initUI } from './js/ui.js';
import { state } from './js/state.js';
import { alignTool } from './js/alignTool.js';
import { faceSnapTool } from './js/faceSnapTool.js';

console.log('main.js: calling initScene');
initScene();
console.log('main.js: initScene returned');
initControls(camera, renderer);
initSelection(camera, renderer);
initUI();
faceSnapTool.init(camera, renderer);

function animate() {
    requestAnimationFrame(animate);
    orbitControls.update();
    alignTool.update();
    renderer.render(scene, camera);
}

animate();
