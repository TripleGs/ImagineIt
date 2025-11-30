import { initScene, scene, camera, renderer } from './js/scene.js';
import { initControls, orbitControls } from './js/controls.js';
import { initSelection } from './js/selection.js';
import { initUI } from './js/ui.js?v=cachebust';
import { state } from './js/state.js';
import { alignTool } from './js/alignTool.js';

initScene();
initControls(camera, renderer);
initSelection(camera, renderer);
initUI();

function animate() {
    requestAnimationFrame(animate);
    orbitControls.update();
    alignTool.update();
    renderer.render(scene, camera);
}

animate();
