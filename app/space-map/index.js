"use client";

import React, {
  useState,
  useRef,
  useMemo,
  useEffect,
  useLayoutEffect,
} from "react";
import { useFrame, extend, Canvas } from "@react-three/fiber";
import { v4 as uuid } from "uuid";
import * as THREE from "three";
import { Text, Billboard, OrbitControls } from "@react-three/drei";
import cx from "classnames";
import Color from "color";
import { EffectComposer, SMAA } from "@react-three/postprocessing";
import _ from "lodash";

// import Canvas from "./canvas";
import JPL from "./jpl";

extend({
  PointLight: THREE.PointLight,
  AmbientLight: THREE.AmbientLight,
  Group: THREE.Group,
  Mesh: THREE.Mesh,
  SphereGeometry: THREE.SphereGeometry,
  TorusGeometry: THREE.TorusGeometry,
  MeshStandardMaterial: THREE.MeshStandardMaterial,
  MeshPhongMaterial: THREE.MeshPhongMaterial,
  InstancedMesh: THREE.InstancedMesh,
});

const theme = {
  sun: Color("#f1c40f"),
  mercury: Color("#b2bec3"),
  venus: Color("#fdcb6e"),
  earth: Color("#3498db"),
  mars: Color("#e74c3c"),
  jupiter: Color("#9b59b6"),
  saturn: Color("#ffeaa7"),
  uranus: Color("#778ca3"),
  neptune: Color("#74b9ff"),
  oumuamua: Color("#e17055"),
  trajectory: Color("#aaa"),
  asteroidBelt: Color("#a5b1c2"),
  kuiperBelt: Color("#83b1ff"),
  oortCloud: Color("#ffb1a2"),
  expectedTrajectory: Color("#aaa"),
};

const METERS_TO_PARSECS = 3.086e16;
const KM_TO_PARSECS = METERS_TO_PARSECS / 1000;
const AU_TO_PARSECS = 4.8481e-6;
const SCENE_RADIUS = 0.009315985771 / 30;
const G = 4.5141174e-30;
const EARTH_RADIUS = AU_TO_PARSECS;
const solarMass = 1;
const sizeFactor = 150;
const sunSize = 2.25461015e-8;
const earthSize = 2.066969e-10;
const jupiterSize = 2.3168979e-9;
const earthMass = 1 / 330000;
const earthV = Math.sqrt((G * solarMass) / EARTH_RADIUS);
const jupiterMass = 9.547919e-4;
const jupiterRadius = 6.203 * AU_TO_PARSECS;
const jupiterV = Math.sqrt((G * solarMass) / jupiterRadius);

// https://en.wikipedia.org/wiki/Mercury_(planet)
const mercurySize = earthSize;
const mercuryMass = 0.055 * earthMass;
const mercuryRadius = 0.3829 * EARTH_RADIUS;
const mercuryV = Math.sqrt((G * solarMass) / mercuryRadius);

// https://en.wikipedia.org/wiki/Mars
const marsSize = earthSize;
const marsMass = 0.107 * earthMass;
const marsRadius = 1.524 * AU_TO_PARSECS;
const marsV = Math.sqrt((G * solarMass) / marsRadius);

// https://en.wikipedia.org/wiki/Venus
const venusSize = earthSize;
const venusMass = 0.815 * earthMass;
const venusRadius = 0.9499 * EARTH_RADIUS;
const venusV = Math.sqrt((G * solarMass) / venusRadius);

const saturnSize = earthSize * 9.449;
const saturnMass = 95.159 * earthMass;
const saturnRadius = 9.957 * EARTH_RADIUS;
const saturnV = Math.sqrt((G * solarMass) / saturnRadius);

const uranusSize = (25362 * 1000) / METERS_TO_PARSECS;
const uranusMass = 14.536 * earthMass;
const uranusRadius = 19.2 * EARTH_RADIUS;
const uranusV = Math.sqrt((G * solarMass) / uranusRadius);

const neptuneSize = (24622 * 1000) / METERS_TO_PARSECS;
const neptuneMass = 17.147 * earthMass;
const neptuneRadius = 30.1 * EARTH_RADIUS;
const neptuneV = Math.sqrt((G * solarMass) / neptuneRadius);

const xAxis = new THREE.Vector3(1, 0, 0);
const yAxis = new THREE.Vector3(0, 1, 0);
const zAxis = new THREE.Vector3(0, 0, 1);

const asteroidOrbit = new THREE.EllipseCurve(
  0,
  0, // ax, aY
  0.05,
  0.05, // xRadius, yRadius
  0,
  2 * Math.PI, // aStartAngle, aEndAngle
  false, // aClockwise
  0 // aRotation
);

const formatDate = (date) => {
  const options = { year: "numeric", month: "short", day: "numeric" };
  return date.toLocaleDateString("en-US", options);
};

const asteroids = [];
for (let i = 0; i < 1000; i++) {
  asteroids.push({
    id: uuid(),
    trajectory: new THREE.EllipseCurve(
      0,
      0, // ax, aY
      0.045 + Math.random() * 0.02,
      0.045 + Math.random() * 0.02, // xRadius, yRadius
      0,
      2 * Math.PI, // aStartAngle, aEndAngle
      false, // aClockwise
      0 // aRotation
    ),
    speed: 100000 + Math.random() * 100000,
    offset: Math.random() * 100000,
    xAngle: Math.random() * 0.1 - 0.05,
    yAngle: Math.random() * 0.1 - 0.05,
  });
}

const kuiperObjects = [];
for (let i = 0; i < 8000; i++) {
  const xRadius = ((Math.random() * 20 + 30) * AU_TO_PARSECS) / SCENE_RADIUS;
  const yRadius = ((Math.random() * 20 + 30) * AU_TO_PARSECS) / SCENE_RADIUS;

  kuiperObjects.push({
    id: uuid(),
    trajectory: new THREE.EllipseCurve(
      0,
      0, // ax, aY
      xRadius,
      yRadius, // xRadius, yRadius
      0,
      2 * Math.PI, // aStartAngle, aEndAngle
      false, // aClockwise
      0 // aRotation
    ),
    speed: 300000 + Math.random() * 300000,
    offset: Math.random() * 1000000,
    xAngle: Math.random() * 0.1 - 0.05,
    yAngle: Math.random() * 0.1 - 0.05,
  });
}

const oortObjects = [];
for (let i = 0; i < 20000; i++) {
  const xRadius = ((Math.random() * 50 + 100) * AU_TO_PARSECS) / SCENE_RADIUS;
  const yRadius = ((Math.random() * 50 + 100) * AU_TO_PARSECS) / SCENE_RADIUS;

  oortObjects.push({
    id: uuid(),
    trajectory: new THREE.EllipseCurve(
      0,
      0, // ax, aY
      xRadius,
      yRadius, // xRadius, yRadius
      0,
      2 * Math.PI, // aStartAngle, aEndAngle
      false, // aClockwise
      0 // aRotation
    ),
    speed: 100000 + Math.random() * 100000,
    offset: Math.random() * 1000000,
    xAngle: Math.random() * 1.4 - 0.7,
    yAngle: Math.random() * 1.4 - 0.7,
  });
}

function gpuCoords(position) {
  return position.clone().divideScalar(SCENE_RADIUS);
}

function vecToArray(vector) {
  return [vector.x, vector.y, vector.z];
}

function parseFloat3(x, y, z) {
  return new THREE.Vector3(parseFloat(x), parseFloat(y), parseFloat(z));
}

// Direction (photo)
// https://voyager.jpl.nasa.gov/mission/timeline/#event-voyager-1-crosses-the-shock
const voyagerSpeed = 16953.545; // m/s
const voyagerIVector = new THREE.Vector3(voyagerSpeed / 1000, 0, 0);
voyagerIVector.applyAxisAngle(yAxis, -Math.PI / 16 - 0.1);
voyagerIVector.applyAxisAngle(zAxis, -Math.PI / 2 + 0.5);
voyagerIVector.divideScalar(KM_TO_PARSECS);
// voyagerIVector.applyAxisAngle(yAxis, Math.PI / 2)

const voyagerDistance = 23222833920; // km
const voyagerPosition = new THREE.Vector3(
  voyagerDistance / KM_TO_PARSECS,
  0,
  0
);
voyagerPosition.applyAxisAngle(yAxis, -Math.PI / 16 - 0.1);
voyagerPosition.applyAxisAngle(zAxis, -Math.PI / 2 + 0.5);
// voyagerPosition.applyAxisAngle(yAxis, Math.PI / 2)

const titleize = (string) => {
  return string
    .split(" ")
    .map((s) => _.capitalize(s))
    .join(" ");
};

// https://observablehq.com/@rveciana/three-js-object-moving-object-along-path
function Inner({
  startTime,
  onDateChange = () => {},
  onObjectSelect = () => {},
  currentObject,
}) {
  const layers = useMemo(() => {
    const l = new THREE.Layers();
    l.set(1);
    l.enable(0);
    return l;
  });
  const asteroidStartTime = useMemo(() => new Date(), []);

  const [bodies, setBodies] = useState([
    {
      id: uuid(),
      name: "sun",
      mass: 1,
      radius: ((sunSize / SCENE_RADIUS) * sizeFactor) / 2.5,
      position: new THREE.Vector3(0, 0, 0),
      vector: new THREE.Vector3(0, 0, 0),
      color: theme.sun.rgbNumber(),
      ref: React.createRef(),
      labelRef: React.createRef(),
      orbitRef: React.createRef(),
      anchorX: -0.15,
      anchorY: -0.3,
    },
    {
      id: uuid(),
      name: "mercury",
      mass: mercuryMass,
      radius: (mercurySize / SCENE_RADIUS) * sizeFactor,
      position: parseFloat3(
        "-3.823694976792445E+07",
        "-5.793911762131056E+07",
        "-4.740775037588142E+05"
      ).divideScalar(KM_TO_PARSECS),
      vector: parseFloat3(
        "3.096268810339204E+01",
        "-2.371673883584312E+01",
        "-4.955410732063867E+00"
      ).divideScalar(KM_TO_PARSECS),
      color: theme.mercury.rgbNumber(),
      ref: React.createRef(),
      labelRef: React.createRef(),
      orbitRef: React.createRef(),
      labelScale: 0.02,
      orbitHeight: 0.1,
    },
    {
      id: uuid(),
      name: "venus",
      mass: venusMass,
      radius: (venusSize / SCENE_RADIUS) * sizeFactor,
      position: parseFloat3(
        "-9.645103255161631E+07",
        "4.592533731102879E+07",
        "5.796681893016027E+06"
      ).divideScalar(KM_TO_PARSECS),
      vector: parseFloat3(
        "-1.532790380972788E+01",
        "-3.178524960925109E+01",
        "8.264596474327668E-01"
      ).divideScalar(KM_TO_PARSECS),
      color: theme.venus.rgbNumber(),
      ref: React.createRef(),
      labelRef: React.createRef(),
      orbitRef: React.createRef(),
      labelScale: 0.025,
      orbitHeight: 0.15,
    },
    {
      id: uuid(),
      name: "earth",
      mass: earthMass,
      radius: (earthSize / SCENE_RADIUS) * sizeFactor,
      position: parseFloat3(
        "-1.181904198705582E+08",
        "-9.453853652406389E+07",
        "-8.040925400030762E+05"
      ).divideScalar(KM_TO_PARSECS),
      vector: parseFloat3(
        "1.800345904934255E+01",
        "-2.330969958379985E+01",
        "-2.328052565890495E-01"
      ).divideScalar(KM_TO_PARSECS),
      color: theme.earth.rgbNumber(),
      ref: React.createRef(),
      labelRef: React.createRef(),
      orbitRef: React.createRef(),
      labelScale: 0.03,
      orbitHeight: 0.2,
    },
    {
      id: uuid(),
      name: "mars",
      mass: marsMass,
      radius: (marsSize / SCENE_RADIUS) * sizeFactor,
      position: parseFloat3(
        "-6.364755715613443E+07",
        "2.24867948849559E+08",
        "6.407984120418444E+06"
      ).divideScalar(KM_TO_PARSECS),
      vector: parseFloat3(
        "-2.248588402094769E+01",
        "-4.272615745466258E+00",
        "4.623773738143619E-01"
      ).divideScalar(KM_TO_PARSECS),
      color: theme.mars.rgbNumber(),
      ref: React.createRef(),
      labelRef: React.createRef(),
      orbitRef: React.createRef(),
      labelScale: 0.031,
      orbitHeight: 0.2,
    },
    {
      id: uuid(),
      name: "jupiter",
      mass: jupiterMass,
      radius: (jupiterSize / SCENE_RADIUS) * sizeFactor,
      position: parseFloat3(
        "5.211229336496745E+08",
        "-5.491027957578257E+08",
        "-9.380896839784920E+06"
      ).divideScalar(KM_TO_PARSECS),
      vector: parseFloat3(
        "9.315566891481254E+00",
        "9.612555430628888E+00",
        "-2.482825497507117E-01"
      ).divideScalar(KM_TO_PARSECS),
      color: theme.jupiter.rgbNumber(),
      ref: React.createRef(),
      labelRef: React.createRef(),
      orbitRef: React.createRef(),
      labelScale: 0.06,
      orbitHeight: 0.6,
    },
    {
      id: uuid(),
      name: "saturn",
      mass: saturnMass,
      radius: (saturnSize / SCENE_RADIUS) * sizeFactor,
      position: parseFloat3(
        "8.709764258624988E+08",
        "-1.209842227315700E+09",
        "-1.363938366086167E+07"
      ).divideScalar(KM_TO_PARSECS),
      vector: parseFloat3(
        "7.300986595389126E+00",
        "5.621586238632872E+00",
        "-3.889405445008842E-01"
      ).divideScalar(KM_TO_PARSECS),
      color: theme.saturn.rgbNumber(),
      ref: React.createRef(),
      labelRef: React.createRef(),
      orbitRef: React.createRef(),
      labelScale: 0.08,
      orbitHeight: 0.75,
      orbitThickness: 0.005,
    },
    {
      id: uuid(),
      name: "uranus",
      mass: uranusMass,
      radius: (uranusSize / SCENE_RADIUS) * sizeFactor,
      position: parseFloat3(
        "2.265409476800708E+09",
        "1.898811311611674E+09",
        "-2.229652804173541E+07"
      ).divideScalar(KM_TO_PARSECS),
      vector: parseFloat3(
        "-4.424482472760232E+00",
        "4.901841206079347E+00",
        "7.556484831383936E-02"
      ).divideScalar(KM_TO_PARSECS),
      color: theme.uranus.rgbNumber(),
      ref: React.createRef(),
      labelRef: React.createRef(),
      orbitRef: React.createRef(),
      labelScale: 0.15,
      orbitHeight: 0.85,
    },
    {
      id: uuid(),
      name: "neptune",
      mass: neptuneMass,
      radius: (neptuneSize / SCENE_RADIUS) * sizeFactor,
      position: parseFloat3(
        "4.412319780875695E+09",
        "-7.449962155219820E+08",
        "-8.634459713443315E+07"
      ).divideScalar(KM_TO_PARSECS),
      vector: parseFloat3(
        "8.696483757993688E-01",
        "5.391842333227114E+00",
        "-1.315314705838639E-01"
      ).divideScalar(KM_TO_PARSECS),
      color: theme.neptune.rgbNumber(),
      ref: React.createRef(),
      labelRef: React.createRef(),
      orbitRef: React.createRef(),
      labelScale: 0.2,
      orbitHeight: 0.85,
    },
    {
      id: uuid(),
      name: "Voyager I",
      mass: 4.1504937e-28,
      radius: (neptuneSize / SCENE_RADIUS) * sizeFactor * 10,
      position: voyagerPosition,
      vector: voyagerIVector,
      color: theme.neptune.rgbNumber(),
      ref: React.createRef(),
      labelRef: React.createRef(),
      orbitRef: React.createRef(),
      labelScale: 0.5,
      orbitHeight: 0.85,
      orbit: false,
    },
  ]);

  const [zoom, setZoom] = useState(1);

  const [ephemerisData, setEphemerisData] = useState({});
  useEffect(() => {
    console.log("fetching data...");
    JPL.ephemerisData()
      .then((data) => {
        console.log("fetched data");
        setEphemerisData(data);
        console.log("set data");
        setAnimationStart(new Date());
      })
      .catch((e) => {
        console.log("error fetching data", e);
      });
  }, []);

  const asteroidBeltRef = useRef();
  const asteroidBeltLabelRef = useRef();
  const kuiperBeltRef = useRef();
  const kuiperBeltLabelRef = useRef();
  const oortCloudRef = useRef();
  const oortCloudLabelRef = useRef();

  useEffect(() => {
    asteroidBeltRef.current.setMatrixAt(0, new THREE.Matrix4());
    kuiperBeltRef.current.setMatrixAt(0, new THREE.Matrix4());
    oortCloudRef.current?.setMatrixAt(0, new THREE.Matrix4());
    onObjectSelect(bodies.find((body) => body.name === "saturn"));
  }, []);

  // useLayoutEffect(() => {
  //   controlsRef.current.addEventListener("change", () => {
  //     const currentZoom = controlsRef.current.target.distanceTo(
  //       controlsRef.current.object.position
  //     );
  //     setZoom(currentZoom);
  //   });
  // });

  const tempObject = new THREE.Object3D();
  const simulationStart = useMemo(() => new Date("21 Mar 2021"), []);
  const [animationStart, setAnimationStart] = useState(null);
  const controlsRef = useRef();
  const speed = 200000;
  const [lastSyncedYearKey, setLastSyncedYearKey] = useState("2020");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(new Date());

  useFrame(({ camera }, delta) => {
    if (!animationStart) {
      return;
    }

    const deltaT = delta * speed;
    const elapsedT = (new Date() - animationStart) * speed;
    const currentTime = new Date(simulationStart.getTime() + elapsedT);
    const currentYearKey = currentTime.toLocaleString("en-US", {
      year: "numeric",
    });
    const dayMonthKey = currentTime.toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
    });

    if (lastSyncedYearKey !== currentYearKey && dayMonthKey == "3/21") {
      bodies.forEach((body) => {
        const location = ephemerisData[body.name]?.[currentYearKey];
        if (location) {
          body.position.set(
            location.x / KM_TO_PARSECS,
            location.y / KM_TO_PARSECS,
            location.z / KM_TO_PARSECS
          );
          body.vector.set(
            location.vx / KM_TO_PARSECS,
            location.vy / KM_TO_PARSECS,
            location.vz / KM_TO_PARSECS
          );

          body.ref.current.position.copy(body.position);
          body.ref.current.position.divideScalar(SCENE_RADIUS);
          // body.labelRef.current.position.copy(body.ref.current.position);
        }
      });

      onDateChange(currentTime);
      setLastSyncedYearKey(currentYearKey);
    }

    if (new Date() - lastUpdatedAt > 1000) {
      onDateChange(currentTime);
      setLastUpdatedAt(new Date());
    }

    const otherBodies = bodies.map((body) => ({
      id: body.id,
      mass: body.mass,
      position: body.position.clone(),
    }));

    const elapsed = new Date() - asteroidStartTime;
    asteroids.forEach((asteroid, index) => {
      const x = -(elapsed + asteroid.offset) / asteroid.speed;
      tempObject.position.set(0, 0, 0);
      asteroid.trajectory.getPoint(x, tempObject.position);
      tempObject.position.applyAxisAngle(yAxis, asteroid.yAngle);
      tempObject.position.applyAxisAngle(xAxis, asteroid.xAngle);
      tempObject.updateMatrix();
      asteroidBeltRef.current.setMatrixAt(index, tempObject.matrix);
    });
    asteroidBeltRef.current.instanceMatrix.needsUpdate = true;
    // asteroidBeltLabelRef.current.position.set(0.05, 0, 0);
    kuiperObjects.forEach((object, index) => {
      const x = -(elapsed + object.offset) / object.speed;
      tempObject.position.set(0, 0, 0);
      object.trajectory.getPoint(x, tempObject.position);
      tempObject.position.applyAxisAngle(yAxis, object.yAngle);
      tempObject.position.applyAxisAngle(xAxis, object.xAngle);
      tempObject.updateMatrix();
      kuiperBeltRef.current.setMatrixAt(index, tempObject.matrix);
    });
    kuiperBeltRef.current.instanceMatrix.needsUpdate = true;
    // kuiperBeltLabelRef.current.position.set(0.65, 0, 0);
    if (oortCloudRef?.current) {
      oortObjects.forEach((object, index) => {
        const x = -(elapsed + object.offset) / object.speed;
        tempObject.position.set(0, 0, 0);
        object.trajectory.getPoint(x, tempObject.position);
        tempObject.position.applyAxisAngle(yAxis, object.yAngle);
        tempObject.position.applyAxisAngle(xAxis, object.xAngle);
        tempObject.updateMatrix();
        oortCloudRef.current.setMatrixAt(index, tempObject.matrix);
      });
      oortCloudRef.current.instanceMatrix.needsUpdate = true;
      // oortCloudLabelRef.current.position.set(2.5, 0.25, 1.0);
    }

    bodies.forEach((body) => {
      // Don't move the sun
      if (body.name === "sun") return;

      // body.labelRef.current.position.copy(body.ref.current.position);

      if (body.name === "Voyager I") {
        return;
      }

      const {
        id,
        mass,
        position,
        vector,
        ref: { current: mesh },
      } = body;
      let force = new THREE.Vector3(0, 0, 0);

      otherBodies.forEach((otherBody) => {
        if (otherBody.id != id) {
          const bodyForce =
            (G * mass * otherBody.mass) /
            Math.pow(position.distanceTo(otherBody.position), 2);
          const bodyForceVector = otherBody.position.clone();
          bodyForceVector.sub(position);
          bodyForceVector.normalize();
          bodyForceVector.multiplyScalar(bodyForce);

          force.add(bodyForceVector);
        }
      });

      const deltaVector = force.clone();
      deltaVector.divideScalar(mass);
      deltaVector.multiplyScalar(deltaT);
      vector.add(deltaVector); // v1 = v0 + at (deltaT is 1) = v0 + f/m

      const deltaPosition = vector.clone();
      deltaPosition.multiplyScalar(deltaT);
      position.add(deltaPosition); // p1 = p0 + v1t

      const gpuPosition = gpuCoords(position);

      mesh.position.x = gpuPosition.x;
      mesh.position.y = gpuPosition.y;
      mesh.position.z = gpuPosition.z;

      // Update Orbit
      const ellipticVector = vector.clone().cross(position);
      const ellipticAngleX = ellipticVector.angleTo(xAxis);
      const ellipticAngleY = ellipticVector.angleTo(yAxis);
      const ellipticAngleZ = ellipticVector.angleTo(zAxis);

      body.orbitRef.current.rotation.x = Math.PI / 2 - ellipticAngleY;
      body.orbitRef.current.rotation.y = Math.PI / 2 + ellipticAngleX;
      body.orbitRef.current.scale.set(0.02, 0.02, 0.02);
      body.orbitRef.current.scale.x = body.ref.current.position.length();
      body.orbitRef.current.scale.y = body.ref.current.position.length();
      // body.orbitRef.current.scale.z = body.orbitHeight || 0.5
      // body.labelRef.current.scale.set(Math.sqrt(zoom / 500), Math.sqrt(zoom / 500), Math.sqrt(zoom / 500))
    });
  });

  return (
    <group>
      {bodies.map((body) => (
        <group
          key={body.id}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={() => onObjectSelect(body)}
        >
          <mesh
            ref={body.ref}
            scale={body.radius}
            position={vecToArray(gpuCoords(body.position))}
          >
            <meshStandardMaterial color={body.color} />
            <sphereGeometry />
            {body.name === "sun" && (
              <primitive object={layers} attach="layers" />
            )}
          </mesh>
          {body.name !== "sun" && body.orbit !== false && (
            <mesh ref={body.orbitRef} rotation={[0, 0, 0]}>
              <torusGeometry args={[1, body.orbitThickness || 0.002, 8, 64]} />
              <meshStandardMaterial
                color={body.color}
                transparent
                opacity={body.id === currentObject?.id ? 0.75 : 0.25}
              />
            </mesh>
          )}
          {/* {body.name !== "sun" && (
            <Text
              color={body.id === currentObject?.id ? "#ffffff" : "#333333"}
              rotation={[Math.PI / 2, Math.PI / 4, 0]}
              anchorX={body.anchorX || -0.025}
              anchorY={body.anchorY || -0.12}
              scale={0.004}
              // strokeWidth={"10%"}
              // strokeWidth={ body.id === currentObject?.id ? 10 : 0 }
              ref={body.labelRef}
            >
              {body.name}
            </Text>
          )} */}
        </group>
      ))}
      <ambientLight color={0xffffff} intensity={3}>
        <primitive object={layers} attach="layers" />
      </ambientLight>
      <pointLight color={0xffffff} intensity={5} position={[0, 0, 0]} />

      <instancedMesh
        rotation={[Math.PI / 2, 0, 0]}
        ref={asteroidBeltRef}
        args={[null, null, asteroids.length]}
      >
        <sphereGeometry args={[0.0001]} />
        <meshPhongMaterial color={theme.asteroidBelt.rgbNumber()} />
      </instancedMesh>
      {/* https://github.com/protectwise/troika/tree/master/packages/troika-three-text */}
      {/* <Text
        color="#666666"
        rotation={[0, Math.PI / 4, 0]}
        anchorX={-0.1}
        anchorY={-0.2}
        scale={0.04}
        ref={asteroidBeltLabelRef}
      >
        Asteroid Belt
      </Text> */}

      <instancedMesh
        rotation={[Math.PI / 2, 0, 0]}
        ref={kuiperBeltRef}
        args={[null, null, kuiperObjects.length]}
      >
        <sphereGeometry args={[0.0003]} />
        <meshPhongMaterial color={theme.kuiperBelt.rgbNumber()} />
      </instancedMesh>
      {/* <Text
        color="#666666"
        rotation={[0, Math.PI / 4, 0]}
        anchorX={-0.1}
        anchorY={-0.2}
        scale={0.28}
        ref={kuiperBeltLabelRef}
      >
        Kuiper Belt
      </Text> */}

      {zoom > 15 && (
        <>
          <instancedMesh
            rotation={[Math.PI / 2, 0, 0]}
            ref={oortCloudRef}
            args={[null, null, oortObjects.length]}
          >
            <sphereGeometry args={[0.0015]} />
            <meshPhongMaterial color={theme.oortCloud.rgbNumber()} />
          </instancedMesh>
          {/* <Text
            color="#666666"
            rotation={[0, Math.PI / 4, 0]}
            anchorX={-0.1}
            anchorY={-0.2}
            scale={0.8}
            ref={oortCloudLabelRef}
          >
            Oort Cloud
          </Text> */}
        </>
      )}

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        rotateSpeed={0.25}
        zoomSpeed={0.5}
        minAzimuthAngle={Math.PI / 4}
        maxAzimuthAngle={Math.PI / 4}
        minDistance={0.1}
        maxDistance={40}
      />

      {/* <axesHelper args={[1]} /> */}
    </group>
  );
}

// Check if window is defined (so if in the browser or in node.js).
const isBrowser = () => typeof window !== "undefined";
const formatNumber = (number) => {
  return _.round(number, 3);
};

export default function SpaceMap() {
  const [startTime, setStartTime] = useState(new Date("21 Mar 2021"));
  const [currentObject, setCurrentObject] = useState(null);
  const [width, setWidth] = useState(null);
  const [height, setHeight] = useState(null);

  const handleDateChange = (date) => setStartTime(date);
  useEffect(() => {
    if (isBrowser()) {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    }
  }, []);

  const objectTable = (object, currentTime, mobile = false) => {
    return (
      object && (
        <div>
          <table className={mobile ? "slim spc-s-zero" : ""}>
            <tbody>
              <tr>
                <td>Date</td>
                <td>{formatDate(currentTime)}</td>
              </tr>
              <tr>
                <td>Velocity (km/s)</td>
                <td>{formatNumber(object.vector.length() * KM_TO_PARSECS)} </td>
              </tr>
              <tr>
                <td>Position (km) </td>
                <td>
                  {" "}
                  x={(object.position.x * KM_TO_PARSECS).toExponential(2)}
                  ,&nbsp; y=
                  {(object.position.y * KM_TO_PARSECS).toExponential(2)},&nbsp;
                  z={(object.position.z * KM_TO_PARSECS).toExponential(2)}
                </td>
              </tr>
              <tr>
                <td>Distance (km)</td>
                <td>
                  {(object.position.length() * KM_TO_PARSECS).toExponential(3)}
                </td>
              </tr>
              <tr>
                <td>Mass (solar mass)</td>
                <td>{object.mass.toExponential(3)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )
    );
  };

  return (
    <div className="layout-overlay">
      <div className="sm-show md-hide">
        <div className="layout-overlay-top bg-frost pad">
          <p className="spc-s-zero text-center">
            <a href="/">an0maly</a>
          </p>
          <p className="text-center text-mono text-large spc-s-zero">
            Space Map{" "}
            {currentObject && <span> - {titleize(currentObject.name)}</span>}
          </p>
          {objectTable(currentObject, startTime, true)}
        </div>
      </div>

      <div
        className="layout-overlay-left bg-frost pad center md-show sm-hide"
        style={{ width: "20%" }}
      >
        <div>
          <p className="text-center text-mono text-large">Space Map</p>

          <p>
            The Space Map is a 3D simulation of the Solar System that uses the{" "}
            <a
              href="https://ssd.jpl.nasa.gov/horizons/app.html#/"
              target="_blank"
            >
              Jet Propulsion Laboratory's Ephemeris System
            </a>{" "}
            in combination with an n-body simulation to create accurate orbits
            and trajectories over time.
          </p>
          {currentObject && <h3>{titleize(currentObject.name)}</h3>}
          {objectTable(currentObject, startTime)}
        </div>
      </div>

      <Canvas style={{ background: "black" }}>
        <Inner
          startTime={startTime}
          onDateChange={handleDateChange}
          currentObject={currentObject}
          onObjectSelect={(obj) => setCurrentObject(obj)}
        />
      </Canvas>
    </div>
  );
}
