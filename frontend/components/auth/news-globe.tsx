"use client";

import { useEffect, useRef } from "react";
import { SPEED_BARS } from "@/components/brand/speed-lines";
import { cn } from "@/lib/utils";

/*
 * The auth pages' 3D scene (owner 2026-10-02: "attractive, animated 3D models" on login / register, then a glossy red
 * glass globe like the owner's reference, on white): a red glass sphere — deep crimson at the edges, bright red where
 * the light falls — with white-to-pink continents (the land mask public/earth/water.jpg) and
 * white latitude / longitude lines, live pulses over India and white news arcs flying out to world cities, a "WebNEWS"
 * band circling it and the logo's three bars as floating 3D shapes. Drag (or swipe sideways) to spin it; it carries on
 * by itself after you let go. three.js and the mask (~45 KB) load only when the scene is on screen; the loop pauses off
 * screen and in hidden tabs; under reduced motion it only moves when dragged.
 */

const BRAND = 0xe30613;
/** Markers on the red globe: white, a touch of pink. */
const MARK = 0xffffff;
const MARK_SOFT = 0xffe4e7;

/** Lat / lon (degrees) → a point on a sphere of radius r, matching three.js sphere UVs (lon 0 at +x). */
function toVector(THREE: typeof import("three"), lat: number, lon: number, r: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

const INDIA = { lat: 20.6, lon: 78.9 };
const CITIES = [
  { lat: 51.5, lon: -0.1 }, // London
  { lat: 40.7, lon: -74 }, // New York
  { lat: 35.7, lon: 139.7 }, // Tokyo
  { lat: 25.2, lon: 55.3 }, // Dubai
  { lat: -33.9, lon: 151.2 }, // Sydney
  { lat: 1.35, lon: 103.8 }, // Singapore
  { lat: -1.3, lon: 36.8 }, // Nairobi
];

/** The "WebNEWS ● PULSE OF PEOPLE" band, repeated around a wide strip (wrapped onto a ring). */
function bandCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 96;
  const g = canvas.getContext("2d")!;
  g.textBaseline = "middle";
  const unit = canvas.width / 3;
  for (let i = 0; i < 3; i++) {
    let x = i * unit + 24;
    g.font = "900 54px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    g.fillStyle = "#16181d";
    g.fillText("Web", x, 50);
    x += g.measureText("Web").width;
    g.fillStyle = "#e30613";
    g.fillText("NEWS", x, 50);
    x += g.measureText("NEWS").width + 28;
    g.beginPath();
    g.arc(x, 49, 7, 0, Math.PI * 2);
    g.fill();
    x += 28;
    g.font = "800 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    g.fillStyle = "#3a3f47";
    g.fillText("PULSE OF PEOPLE", x, 51);
  }
  return canvas;
}

/** The logo's three slanted bars (SVG polygons) as shapes, centred and scaled to ~1 unit. */
function speedBarShapes(THREE: typeof import("three")) {
  return SPEED_BARS.map((points) => {
    const pairs = points.split(" ").map((p) => p.split(",").map(Number) as [number, number]);
    const shape = new THREE.Shape();
    pairs.forEach(([x, y], i) => {
      const px = (x - 34) / 45;
      const py = -(y - 31.5) / 45;
      if (i === 0) shape.moveTo(px, py);
      else shape.lineTo(px, py);
    });
    shape.closePath();
    return shape;
  });
}

const EARTH_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Red glass: crimson body lit from the top left (wrap lighting), white-to-pink land, edges darkening into the glass
 * with a faint red rim. Colours are written as sRGB (no colour-space chunk).
 */
const GLOBE_FRAGMENT = /* glsl */ `
  uniform sampler2D waterMap;
  uniform vec3 lightDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewW);
    float land = smoothstep(0.35, 0.65, 1.0 - texture2D(waterMap, vUv).r);
    float wrap = clamp(dot(n, lightDir) * 0.5 + 0.5, 0.0, 1.0);
    vec3 body = mix(vec3(0.30, 0.0, 0.03), vec3(0.93, 0.05, 0.10), pow(wrap, 1.25));
    vec3 landColor = mix(vec3(0.86, 0.16, 0.22), vec3(1.0, 0.94, 0.95), smoothstep(0.38, 0.95, wrap));
    vec3 color = mix(body, landColor, land * 0.94);
    // No gloss spot (owner 2026-10-02: no sun glare) — just the edges darkening into the glass.
    float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.4);
    color = color * (1.0 - fresnel * 0.5) + vec3(0.95, 0.12, 0.18) * fresnel * 0.22;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** A soft red glow beyond the edge (a bigger sphere seen from inside), fading to nothing. */
const HALO_VERTEX = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vView;
  void main() {
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    vView = p.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * p;
  }
`;
const HALO_FRAGMENT = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vView;
  void main() {
    float f = clamp(dot(normalize(vNormalV), normalize(vView)), 0.0, 1.0);
    gl_FragColor = vec4(0.89, 0.02, 0.07, pow(smoothstep(0.0, 0.6, f), 1.8) * 0.32);
  }
`;

export function NewsGlobe({ className, compact = false }: { className?: string; compact?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    // Started only once the box is actually on screen (the ≥1024px panel stays mounted but hidden on phones, and the
    // app hides the phone banner).
    const firstSight = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      firstSight.disconnect();
      void import("three").then(build);
    });
    firstSight.observe(host);

    function build(THREE: typeof import("three")) {
      if (disposed || !host) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const small = compact || window.innerWidth < 1024;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      } catch {
        return; // No WebGL: the panel's own background stays.
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.75 : 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(compact ? 38 : 34, 1, 0.1, 200);
      const baseZ = compact ? 8.6 : 10;
      camera.position.set(0, 0, baseZ);

      // The light: front, up and to the left (the gloss sits top left, like the reference).
      const lightDir = new THREE.Vector3(-0.55, 0.65, 0.9).normalize();
      scene.add(new THREE.AmbientLight(0xffffff, 0.9));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
      keyLight.position.copy(lightDir).multiplyScalar(10);
      scene.add(keyLight);

      const disposables: Array<{ dispose(): void }> = [];
      const track = <T extends { dispose(): void }>(item: T) => {
        disposables.push(item);
        return item;
      };

      // ── Earth ──
      const R = 2.3;
      const world = new THREE.Group();
      scene.add(world);
      const globe = new THREE.Group();
      world.add(globe);

      const loader = new THREE.TextureLoader();
      const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const load = (url: string, color: boolean) =>
        new Promise<import("three").Texture>((resolve, reject) =>
          loader.load(
            url,
            (texture) => {
              texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
              texture.anisotropy = maxAniso;
              resolve(track(texture));
            },
            undefined,
            reject,
          ),
        );

      const globeMaterial = track(
        new THREE.ShaderMaterial({
          uniforms: { waterMap: { value: null }, lightDir: { value: lightDir } },
          vertexShader: EARTH_VERTEX,
          fragmentShader: GLOBE_FRAGMENT,
        }),
      );
      globe.add(new THREE.Mesh(track(new THREE.SphereGeometry(R, 96, 96)), globeMaterial));

      // White latitude / longitude lines (every 30°), just above the glass; the far half hides behind it.
      const gridMaterial = track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
      const tube = small ? 0.012 : 0.01;
      for (let lon = 0; lon < 180; lon += 30) {
        const meridian = new THREE.Mesh(track(new THREE.TorusGeometry(R * 1.004, tube, 6, 160)), gridMaterial);
        meridian.rotation.y = (lon * Math.PI) / 180;
        globe.add(meridian);
      }
      for (const lat of [-60, -30, 0, 30, 60]) {
        const r = R * 1.004 * Math.cos((lat * Math.PI) / 180);
        const parallel = new THREE.Mesh(track(new THREE.TorusGeometry(r, tube, 6, 160)), gridMaterial);
        parallel.rotation.x = Math.PI / 2;
        parallel.position.y = R * 1.004 * Math.sin((lat * Math.PI) / 180);
        globe.add(parallel);
      }

      world.add(
        new THREE.Mesh(
          track(new THREE.SphereGeometry(R * 1.14, 64, 64)),
          track(
            new THREE.ShaderMaterial({
              vertexShader: HALO_VERTEX,
              fragmentShader: HALO_FRAGMENT,
              side: THREE.BackSide,
              transparent: true,
              depthWrite: false,
            }),
          ),
        ),
      );

      // Live pulses over India.
      const india = toVector(THREE, INDIA.lat, INDIA.lon, 1);
      const pulseGeometry = track(new THREE.RingGeometry(0.06, 0.085, 48));
      const pulses = [0, 1, 2].map((i) => {
        const material = track(
          new THREE.MeshBasicMaterial({ color: MARK, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
        );
        const mesh = new THREE.Mesh(pulseGeometry, material);
        mesh.position.copy(india.clone().multiplyScalar(R * 1.015));
        mesh.lookAt(india.clone().multiplyScalar(R * 2));
        globe.add(mesh);
        return { mesh, material, offset: i / 3 };
      });
      const beacon = new THREE.Mesh(track(new THREE.SphereGeometry(0.07, 16, 16)), track(new THREE.MeshBasicMaterial({ color: MARK })));
      beacon.position.copy(india.clone().multiplyScalar(R * 1.015));
      globe.add(beacon);

      // News arcs from India to world cities, each with a dot travelling along it.
      const arcMaterial = track(new THREE.LineBasicMaterial({ color: MARK_SOFT, transparent: true, opacity: 0.9 }));
      const travellerGeometry = track(new THREE.SphereGeometry(0.045, 12, 12));
      const travellerMaterial = track(new THREE.MeshBasicMaterial({ color: MARK }));
      const endMaterial = track(new THREE.MeshBasicMaterial({ color: MARK_SOFT }));
      const arcs = CITIES.map((city, i) => {
        const from = india.clone().multiplyScalar(R * 1.01);
        const to = toVector(THREE, city.lat, city.lon, R * 1.01);
        const mid = from.clone().add(to).multiplyScalar(0.5);
        mid.normalize().multiplyScalar(R * (1 + from.distanceTo(to) / (R * 2.2)));
        const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
        globe.add(new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48))), arcMaterial));
        const traveller = new THREE.Mesh(travellerGeometry, travellerMaterial);
        globe.add(traveller);
        const end = new THREE.Mesh(travellerGeometry, endMaterial);
        end.position.copy(to);
        end.scale.setScalar(0.8);
        globe.add(end);
        return { curve, traveller, speed: 0.16 + (i % 3) * 0.05, offset: i / CITIES.length };
      });

      // ── The "WebNEWS" band circling the globe ──
      const bandTexture = track(new THREE.CanvasTexture(bandCanvas()));
      bandTexture.colorSpace = THREE.SRGBColorSpace;
      bandTexture.anisotropy = maxAniso;
      const bandGeometry = track(new THREE.CylinderGeometry(R * 1.32, R * 1.32, 0.34, 160, 1, true));
      const band = new THREE.Group();
      band.rotation.set(0.22, 0, -0.16);
      band.add(
        new THREE.Mesh(bandGeometry, track(new THREE.MeshBasicMaterial({ map: bandTexture, transparent: true, side: THREE.FrontSide, depthWrite: false }))),
      );
      band.add(
        new THREE.Mesh(
          bandGeometry,
          track(new THREE.MeshBasicMaterial({ map: bandTexture, transparent: true, opacity: 0.2, side: THREE.BackSide, depthWrite: false })),
        ),
      );
      world.add(band);

      // ── The logo's bars, extruded ──
      const barGeometry = track(
        new THREE.ExtrudeGeometry(speedBarShapes(THREE), { depth: 0.18, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.03, bevelSegments: 2 }),
      );
      barGeometry.center();
      const barMaterial = track(new THREE.MeshStandardMaterial({ color: BRAND, roughness: 0.3, metalness: 0.2, emissive: 0x3a0003 }));
      // Clear of the logo (top left of the panel) and of the headline (bottom left).
      const barSpots = compact
        ? [{ x: 3.4, y: 1.15, s: 0.85, r: 0.4 }]
        : [
            { x: 2.45, y: 3.05, s: 1.0, r: 0.2 },
            { x: 2.55, y: -2.75, s: 0.8, r: 1.4 },
          ];
      const bars = barSpots.map((spot, i) => {
        const mesh = new THREE.Mesh(barGeometry, barMaterial);
        mesh.position.set(spot.x, spot.y, 0.6);
        mesh.scale.setScalar(spot.s);
        scene.add(mesh);
        return { mesh, base: spot, phase: i * 1.7 };
      });

      // ── Size ──
      const resize = () => {
        const { clientWidth: w, clientHeight: h } = host;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // Keep the Earth in frame on narrow / short boxes.
        camera.position.z = baseZ * Math.max(1, 1.15 / camera.aspect, compact ? 1 : 0.95);
        camera.updateProjectionMatrix();
      };
      const sizeObserver = new ResizeObserver(resize);
      sizeObserver.observe(host);
      resize();

      // ── Drag to spin (owner 2026-10-02: no hover tilt) ──
      const AUTO_SPIN = 0.09; // rad / s
      let yaw = -1.3;
      let pitch = 0.32;
      let spin = AUTO_SPIN;
      let dragging: { id: number; x: number; y: number; t: number } | null = null;
      let lastDrag = -Infinity;
      const clock = new THREE.Clock();
      let elapsed = 0;

      const render = (dt: number) => {
        elapsed += dt;
        const t = elapsed;
        if (!dragging) {
          // A flick's speed eases back to the Earth's own pace.
          spin += (AUTO_SPIN - spin) * Math.min(1, dt * 1.6);
          yaw += spin * dt;
        }
        globe.rotation.set(0, yaw, 0);
        world.rotation.set(pitch, 0, 0.12);
        band.children.forEach((m) => (m.rotation.y = -t * 0.22));

        for (const p of pulses) {
          const k = (t * 0.6 + p.offset) % 1;
          p.mesh.scale.setScalar(1 + k * 4.5);
          p.material.opacity = 0.8 * (1 - k);
        }
        beacon.scale.setScalar(1 + Math.sin(t * 4) * 0.15);
        for (const a of arcs) a.traveller.position.copy(a.curve.getPoint((t * a.speed + a.offset) % 1));
        for (const b of bars) {
          b.mesh.position.y = b.base.y + Math.sin(t * 0.9 + b.phase) * 0.18;
          b.mesh.rotation.set(0.35 + Math.sin(t * 0.7 + b.phase) * 0.25, b.base.r + t * 0.35, Math.sin(t * 0.5 + b.phase) * 0.12);
        }
        renderer.render(scene, camera);
      };

      const onDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now() };
        host.setPointerCapture(event.pointerId);
        host.style.cursor = "grabbing";
        spin = 0;
      };
      const onMove = (event: PointerEvent) => {
        if (!dragging || event.pointerId !== dragging.id) return;
        const now = performance.now();
        const dx = event.clientX - dragging.x;
        const dy = event.clientY - dragging.y;
        const step = 4.2 / Math.max(240, host.clientWidth);
        yaw += dx * step;
        pitch = Math.max(-0.9, Math.min(0.9, pitch + dy * step * 0.7));
        spin = (dx * step) / Math.max(0.008, (now - dragging.t) / 1000);
        dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, t: now };
        lastDrag = now;
        if (reduceMotion) render(0);
      };
      const onUp = (event: PointerEvent) => {
        if (!dragging || event.pointerId !== dragging.id) return;
        dragging = null;
        host.style.cursor = "grab";
        // A flick keeps the Earth turning for a moment; a drag that stopped before letting go doesn't.
        spin = performance.now() - lastDrag > 80 ? 0 : Math.max(-3, Math.min(3, spin));
      };
      host.addEventListener("pointerdown", onDown);
      host.addEventListener("pointermove", onMove);
      host.addEventListener("pointerup", onUp);
      host.addEventListener("pointercancel", onUp);

      // ── Loop ──
      let frame = 0;
      let visible = true;
      let ready = false;
      const loop = () => {
        frame = 0;
        if (!visible || document.hidden) return;
        render(Math.min(0.05, clock.getDelta()));
        frame = requestAnimationFrame(loop);
      };
      const start = () => {
        if (!ready) return;
        if (reduceMotion) {
          render(0);
          return;
        }
        if (!frame) {
          clock.getDelta(); // don't jump ahead after a pause
          frame = requestAnimationFrame(loop);
        }
      };
      const onScreen = new IntersectionObserver(([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        if (visible) start();
      });
      onScreen.observe(host);
      const onVisibility = () => {
        if (!document.hidden) start();
      };
      document.addEventListener("visibilitychange", onVisibility);

      // The land mask first, then the scene fades in.
      void load("/earth/water.jpg", false)
        .then((water) => {
          if (disposed) return;
          globeMaterial.uniforms.waterMap!.value = water;
          ready = true;
          host.style.cursor = "grab";
          start();
          requestAnimationFrame(() => host.setAttribute("data-ready", ""));
        })
        .catch(() => {});

      cleanup = () => {
        cancelAnimationFrame(frame);
        sizeObserver.disconnect();
        onScreen.disconnect();
        host.removeEventListener("pointerdown", onDown);
        host.removeEventListener("pointermove", onMove);
        host.removeEventListener("pointerup", onUp);
        host.removeEventListener("pointercancel", onUp);
        document.removeEventListener("visibilitychange", onVisibility);
        disposables.forEach((item) => item.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    return () => {
      disposed = true;
      firstSight.disconnect();
      cleanup();
    };
  }, [compact]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      // Sideways drags spin the Earth; up / down still scrolls the page on phones.
      className={cn("touch-pan-y select-none opacity-0 transition-opacity duration-700 ease-out data-ready:opacity-100", className)}
    />
  );
}
