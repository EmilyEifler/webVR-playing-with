/**
/**
 * @author dmarcos / https://github.com/dmarcos
 with additions by https://github.com/hawksley
 and https://github.com/vihart
 and https://github.com/henryseg
 */

THREE.VRControls = function ( camera, done ) {

	this._camera = camera;

	this._init = function () {
		var self = this;
		if ( !navigator.mozGetVRDevices && !navigator.getVRDevices ) {
			if ( done ) {
				done("Your browser is not VR Ready");
			}
			return;
		}
		if ( navigator.getVRDevices ) {
			navigator.getVRDevices().then( gotVRDevices );
		} else {
			navigator.mozGetVRDevices( gotVRDevices );
		}
		function gotVRDevices( devices ) {
			var vrInput;
			var error;
			for ( var i = 0; i < devices.length; ++i ) {
				if ( devices[i] instanceof PositionSensorVRDevice ) {
					vrInput = devices[i]
					self._vrInput = vrInput;
					break; // We keep the first we encounter
				}
			}
			if ( done ) {
				if ( !vrInput ) {
				 error = 'HMD not available';
				}
				done( error );
			}
		}
	};

	this._init();

	this.manualRotation = quat.create();

	this.manualControls = {
      65 : {index: 4, sign: 1, active: 0},  // a
      68 : {index: 4, sign: -1, active: 0}, // d
      87 : {index: 0, sign: 1, active: 0},  // w
      83 : {index: 0, sign: -1, active: 0}, // s
      81 : {index: 2, sign: -1, active: 0}, // q
      69 : {index: 2, sign: 1, active: 0},  // e
      38 : {index: 3, sign: -1, active: 0},  // up
      40 : {index: 3, sign: 1, active: 0}, // down
      37 : {index: 1, sign: 1, active: 0}, // left
      39 : {index: 1, sign: -1, active: 0},   // right
    };

	this.manualRotateRate = new Float32Array([0, 0, 0]);
	this.manualMoveRate = new Float32Array([0, 0, 0]);
	this.updateTime = 0;

	this.update = function() {
		var camera = this._camera;
		var vrState = this.getVRState();
		var manualRotation = this.manualRotation;
		var oldTime = this.updateTime;
		var newTime = performance.now();
		this.updateTime = newTime;

	  var interval = (newTime - oldTime) * 0.001;

	  // camera.position = camera.position.add(getFwdVector());

	  ///do translation 
		var offset = new THREE.Vector3();
		if (this.manualMoveRate[0] != 0 || this.manualMoveRate[1] != 0 || this.manualMoveRate[2] != 0){
		    offset = getFwdVector().multiplyScalar(4 * interval * this.manualMoveRate[0]).add(
		      		   getRightVector().multiplyScalar(4 * interval * this.manualMoveRate[1])).add(
		      		   getUpVector().multiplyScalar(4 * interval * this.manualMoveRate[2]));
		    }

		camera.position = camera.position.add(offset);

	  var update = quat.fromValues(this.manualRotateRate[0] * interval,
	                               this.manualRotateRate[1] * interval,
	                               this.manualRotateRate[2] * interval, 1.0);
	  quat.normalize(update, update);
	  quat.multiply(manualRotation, manualRotation, update);

		if ( camera ) {
			if ( !vrState ) {
				camera.quaternion.fromArray(manualRotation);
				return;
			}

			// Applies head rotation from sensors data.
			var totalRotation = quat.create();
      var state = vrState.hmd.rotation;
      if (vrState.hmd.rotation[0] !== 0 ||
					vrState.hmd.rotation[1] !== 0 ||
					vrState.hmd.rotation[2] !== 0 ||
					vrState.hmd.rotation[3] !== 0) {
        quat.multiply(totalRotation, manualRotation, vrState.hmd.rotation);
      } else {
        totalRotation = manualRotation;
      }

			camera.quaternion.fromArray( totalRotation );
		}
	};

	this.zeroSensor = function() {
		var vrInput = this._vrInput;
		if ( !vrInput ) {
			return null;
		}
		vrInput.zeroSensor();
	};

	this.getVRState = function() {
		var vrInput = this._vrInput;
		var orientation;
		var vrState;
		if ( !vrInput ) {
			return null;
		}
		orientation	= vrInput.getState().orientation;
		vrState = {
			hmd : {
				rotation : [
					orientation.x,
					orientation.y,
					orientation.z,
					orientation.w
				]
			}
		};
		return vrState;
	};

};


function getFwdVector() {
  return new THREE.Vector3(0,0,1).applyQuaternion(camera.quaternion);
}
function getRightVector() {
  return new THREE.Vector3(-1,0,0).applyQuaternion(camera.quaternion);
}
function getUpVector() {
  return new THREE.Vector3(0,-1,0).applyQuaternion(camera.quaternion);
}

THREE.Matrix4.prototype.add = function (m) {
  this.set.apply(this, [].map.call(this.elements, function (c, i) { return c + m.elements[i] }));
};

function translateByVector(v) {
  var dx = v.x;
  var dy = v.y;
  var dz = v.z;
  var len = Math.sqrt(dx*dx + dy*dy + dz*dz);
  dx /= len;
  dy /= len;
  dz /= len;
  var m = new THREE.Matrix4().set(
    0, 0, 0, dx,
    0, 0, 0, dy,
    0, 0, 0, dz,
    dx,dy,dz, 0);
  var m2 = new THREE.Matrix4().copy(m).multiply(m);
  var c1 = Math.sinh(len);
  var c2 = Math.cosh(len) - 1;
  m.multiplyScalar(c1);
  m2.multiplyScalar(c2);
  var result = new THREE.Matrix4().identity();
  result.add(m);
  result.add(m2);
  return result;
}

//hold down keys to do rotations and stuff
function key(event, sign) {
  var control = controls.manualControls[event.keyCode];

  if (sign === 1 && control.active || sign === -1 && !control.active) {
    return;
  }

  control.active = (sign === 1);
  if (control.index <= 2){
    controls.manualRotateRate[control.index] += sign * control.sign;
  }
  else if (control.index <= 5) {
    controls.manualMoveRate[control.index - 3] += sign * control.sign;
  }
}

document.addEventListener('keydown', function(event) { key(event, 1); }, false);
document.addEventListener('keyup', function(event) { key(event, -1); }, false);
