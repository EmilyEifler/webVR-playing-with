var camera, scene, overlayScene, renderer, mesh, effect, controls, levelTexture, levelMesh, scoreTexture, scoreMesh, polychoron, numCells, matArray;
var objectArray = [];
var noms = [
  document.querySelector('#nom1'),
  document.querySelector('#nom2'),
  document.querySelector('#nom3'),
  document.querySelector('#nom4'),
  document.querySelector('#nom5')
];
var winNoise = document.querySelector('#win');
var gamePoints = 0;
var muteSound = false;
var level = -1;

// one quaternion per cell


var polychora = [
  { // 5 Cell (Simplex)
    quatPerCellArray: centers_5_cell_dual,
    modelFileName: 'media/5-cell_tet_subdiv_flip_norm.obj',
    rotMatrixArray: makeRotMatrixArray(centers_5_cell, centers_5_cell_dual, 1.31812),
    nomDistance: 1.7
  },
  { // 8 Cell (Hypercube)
    quatPerCellArray: centers_8_cell,
    modelFileName: 'media/8-cell_cube_subdiv_flip_norm.obj',
    nomDistance: 1.1
  },
  { // 16 Cell
    quatPerCellArray: centers_16_cell,
    modelFileName: 'media/16-cell_tet_subdiv_flip_norm.obj',
    rotMatrixArray: makeRotMatrixArray(centers_16_cell_vert_centered, centers_8_cell, 1.0471975511965977462), //N[ArcCos[0.5]]
    nomDistance: 1.2
  },
  { // 24 Cell (special snowflake)
    quatPerCellArray: centers_24_cell,
    modelFileName: 'media/24-cell_oct_subdiv_flip_norm.obj',
    nomDistance: 0.8
  },
  { // 120 Cell (the best)
    quatPerCellArray: centers_120_cell,
    modelFileName: 'media/120-cell_dodec_subdiv_flip_norm.obj',
    nomDistance: 0.6
  },
  { // 600 Cell
    quatPerCellArray: centers_600_cell,
    modelFileName: 'media/600-cell_tet_subdiv_flip_norm.obj',
    rotMatrixArray: makeRotMatrixArray(centers_600_cell_vert_centered, centers_120_cell, 0.38813951537018876328), //N[ArcCos[GR*GR/Sqrt[8]]]
    nomDistance: 0.4
  }
];

var travelDir = centers_120_cell[3];
var colourDir = centers_120_cell[3];
var HopfColorMatrix = makeHopfColorMatrix(colourDir);
var headQuat = new THREE.Vector4().set(0,0,0,1);
var controlsQuat = new THREE.Vector4().set(0,0,0,1);
var moveQuat = new THREE.Vector4().set(0,0,0,1);

var modelScale = 0.9;

var timing = {
  start: [Date.now(),0,0,0,0,0],
  end: [0,0,0,0,0,0]
};

init();
animate();

function onkey(event) {
  event.preventDefault();
  if (event.keyCode == 90) { // z
    controls.zeroSensor();
  }
};
window.addEventListener("keydown", onkey, true);

document.body.addEventListener('dblclick', function () {
  effect.setFullScreen(true);
});

THREE.Matrix4.prototype.add = function (m) {   //addition of matrices needs to be implemented??
  this.set.apply(this, [].map.call(this.elements, function (c, i) { return c + m.elements[i] }));
};

function loadStuff() {
  // one material per object, since they have different quaternions
  for (var i = 0; i < numCells; i++) {
    matArray[i] = materialBase.clone();
  }

  // load the mesh
  var manager = new THREE.LoadingManager();
  var loader = new THREE.OBJLoader(manager);
  loader.load(modelFileName, function (object) {
    // make numCells copies of the mesh and assign them a unique material out of the numCells we created previously
    for (var i = 0; i < numCells; i++) {
      objectArray[i] = object.clone();

      objectArray[i].traverse(function (child) {
        if (child instanceof THREE.Mesh) {
          child.material = matArray[i];
          child.frustumCulled = false;
        }
      });

      scene.add(objectArray[i]);
    }
  });
}

function makeHopfColorMatrix( colourDir ) {
  //rotate colourDir to lie along (0,0,z,w), fixing (0,0,0,1)
  //http://math.stackexchange.com/questions/293116/rotating-one-3-vector-to-another

  var A = new THREE.Vector3(colourDir.x, colourDir.y, colourDir.z);
  var B = new THREE.Vector3(0.0,0.0,1.0);
  var X = new THREE.Vector3();
  X.crossVectors(A,B);
  X.normalize();
  var theta = Math.acos( A.dot(B)/(A.length()*B.length())); ///dont care about sign
  var m = new THREE.Matrix4().set(  0.0,-X.z, X.y, 0.0, //input is row vectors
    X.z,  0.0,-X.x, 0.0,
    -X.y, X.x,  0.0, 0.0,
    0.0,  0.0,  0.0, 0.0
  );

  var m2 = new THREE.Matrix4().copy(m).multiply(m);
  m.multiplyScalar(Math.sin(theta));
  m2.multiplyScalar(1.0-Math.cos(theta));
  var Rot = new THREE.Matrix4();
  Rot.add(m);
  Rot.add(m2);

  return Rot;
}

function init() {
  scene = new THREE.Scene();
  overlayScene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.2, 25);
  camera.position.x = 0;
  camera.position.z = 0;

  // vr stuff
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  document.body.appendChild(renderer.domElement);

  controls = new THREE.VRControls(camera);

  effect = new THREE.VREffect(renderer);
  effect.setSize(window.innerWidth, window.innerHeight);

  // material for the cells is a shader
  materialBase = new THREE.ShaderMaterial({
    // these are the parameters for the shader
    uniforms: {
      // global time
      time: {
        type: "f",
        value: 0.0
      },
      // quaternion that moves cells into 4-space, set once per cell
      quatPerCell: {
        type: "v4",
        value: new THREE.Vector4( 0, 0, 0, 0 )
      },
      mousePos: {
        type: "v2",
        value: new THREE.Vector2(0,0)
      },
      travelDir: {
        type: "v4",
        value: new THREE.Vector4( 0, 0, 0, 0 )
      },
      colourDir: {
        type: "v4",
        value: new THREE.Vector4( 0, 0, 0, 0 )
      },
      HopfColorMatrix: {
        type: "m4",
        value: new THREE.Matrix4().set( 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 )
      },
      moveQuat: {
        type: "v4",
        value: new THREE.Vector4( 0, 0, 0, 1 )
      },
      rotMatrix: {
        type: "m3",
        value: new THREE.Matrix3().set( 0, 0, 0, 0, 0, 0, 0, 0, 0 )
      },
      modelScale: {
        type: "f",
        value: 1.0
      }
    },
    vertexShader: document.getElementById('vertexShader').textContent,
    fragmentShader: document.getElementById('fragmentShader').textContent
  });
  materialBase.side = THREE.FrontSide;

  levelTexture = new THREEx.DynamicTexture(1024,512).clear();
  levelMesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(.5, .25),
                    new THREE.MeshBasicMaterial( {color: 0xffffff, transparent: true, opacity: 1, map: levelTexture.texture, side: THREE.DoubleSide} ));
  levelMesh.position.z = -0.3;
  scoreTexture = new THREEx.DynamicTexture(512,256).clear().drawText("", undefined, 64, "#ffffff", "normal 100px Helvetica");
  scoreMesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(0.3, 0.1),
                    new THREE.MeshBasicMaterial( {color: 0xffffff, transparent: true, opacity: 1, map: scoreTexture.texture, side: THREE.DoubleSide} ));
  scoreMesh.position.z = -0.3;
  // position score mesh differently if there is an hmd
  if(typeof navigator.getVRDevices !== "undefined"){
    scoreMesh.position.x = -0.1;
    scoreMesh.position.y = -0.2;
  } else {
    scoreMesh.position.x = -0.3;
    scoreMesh.position.y = -0.2;
  }

  camera.add(levelMesh);
  camera.add(scoreMesh);
  scene.add(camera);

  window.addEventListener('resize', onWindowResize, false);

  effect.render(scene, camera);
}

function animate() {
  if (level >= 0) {
    scoreTexture.clear().drawText(""+ Math.round((Date.now() - timing.start[level])/1000), undefined, 64, "#ffffff", "normal 90px Helvetica");

    for (var i = 0; i < numCells; i++) {
      matArray[i].uniforms.time.value = 0.00025 * (Date.now() - timing.start[0]);
      moveQuat = quatMult(headQuat, controlsQuat);
      matArray[i].uniforms.moveQuat.value = moveQuat;
    }

    if(controls.getVRState() !== null &&
        (controls.getVRState().hmd.rotation[0] !== 0 ||
        controls.getVRState().hmd.rotation[1] !== 0 ||
        controls.getVRState().hmd.rotation[2] !== 0 ||
        controls.getVRState().hmd.rotation[3] !== 0 )){
      // headQuat = new THREE.Vector4();
      headQuat.x = controls.getVRState().hmd.rotation[0];
      headQuat.y = controls.getVRState().hmd.rotation[1];
      headQuat.z = controls.getVRState().hmd.rotation[2];
      headQuat.w = controls.getVRState().hmd.rotation[3];
    }

    var myPos = invStereoProj(camera.position);
    myPos = quatMult(quatInv(moveQuat), myPos);

    for (var i = 0; i < objectArray.length; i++) {
      var distToPoint = S3dist(myPos, quatPerCellArray[i]);
      if (distToPoint < nomDistance){
        if (objectArray[i].visible === true){
          noms[i%5].play();
          gamePoints += 1;
        }
        objectArray[i].visible = false;
      }
    }

    if (gamePoints == numCells) {
      timing.end[level] = Date.now();
      winNoise.play();
      gamePoints = 0;
      levelTexture.clear().drawText("Level " + (level+1) + "Score: "  + Math.round((timing.end[level] - timing.start[level])/1000), undefined, 80, "#00ffff", "normal 30px Helvetica");
      camera.add(levelMesh);
      camera.remove(scoreMesh);
      for(var i; i < numCells; i++) {
        objectArray[i].visible = true;
      }
    }
  }

  controls.update();

  effect.render(scene, camera);

  requestAnimationFrame(animate);
}

function startLevel(level){
  camera.remove(levelMesh);
  if (scene) {
    timing.start[level] = Date.now();
    camera.add(scoreMesh);
    while (scene.children.length > 1) {
      scene.remove(scene.children[scene.children.length - 1]);
    }
    polychoron = polychora[level];
    quatPerCellArray = polychoron.quatPerCellArray;
    numCells = quatPerCellArray.length;
    matArray = new Array(numCells);
    modelFileName = polychoron.modelFileName;
    nomDistance = polychoron.nomDistance;
    objectArray = [];

    loadStuff();

    for (var i = 0; i < numCells; i++) {
      matArray[i].uniforms.quatPerCell.value = quatPerCellArray[i];
      matArray[i].uniforms.time.value = 0.00025 * (Date.now() - timing.start);
      matArray[i].uniforms.travelDir.value = travelDir;
      matArray[i].uniforms.colourDir.value = colourDir;
      matArray[i].uniforms.HopfColorMatrix.value = HopfColorMatrix;
      matArray[i].uniforms.moveQuat.value = moveQuat;
      if (typeof polychoron.rotMatrixArray === 'undefined') {
        matArray[i].uniforms.rotMatrix.value = new THREE.Matrix3();
      } else {
        matArray[i].uniforms.rotMatrix.value = polychoron.rotMatrixArray[i];
      }
      matArray[i].uniforms.modelScale.value = modelScale;
    }
  }
}

//Listen for double click event to enter full-screen VR mode
document.body.addEventListener( 'dblclick', function() {
  effect.setFullScreen( true );
});

//Listen for keyboard events
function onkey(event) {
  event.preventDefault();

  if (event.keyCode == 90) { // z
    controls.zeroSensor(); //zero rotation
  } else if (event.keyCode == 70 || event.keyCode == 13) { //f or enter
    effect.setFullScreen(true); //fullscreen
  } else if (event.keyCode === 73){ //i
    infoSign.material.visible = !infoSign.material.visible;
  } else if (event.keyCode == 80) {//p
    if (muteSound === true){
      for (var i = 0; i < noms.length; i++){
        noms[i].volume = 1;
      }
      muteSound = false;
      winNoise.volume = 1;
    } else {
      for (var i = 0; i < noms.length; i++) {
        noms[i].volume = 0;
      }
      muteSound = true;
      winNoise.volume = 0;
    }
  } else if (event.keyCode == 32) { // space
    level = (level+1)%6;
    startLevel(level);
  }
}
window.addEventListener("keydown", onkey, true);

//hold down keys to do rotations and stuff
document.addEventListener('keydown', function(event) { key(event, 1); }, false);
document.addEventListener('keyup', function(event) { key(event, -1); }, false);

/*
Handle window resizes
*/
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  effect.setSize( window.innerWidth, window.innerHeight );
}
window.addEventListener( 'resize', onWindowResize, false );
