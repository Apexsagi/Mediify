import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export const ThreeClinicalHeroCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Probe renderer string without triggering unused WebGL contexts later
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const probeGl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!probeGl) return true;
        const ext = probeGl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probeGl.RENDERER;
        const gpu = String(probeGl.getParameter(param) ?? '');
        probeGl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    const gl = renderer.getContext();
    if (!gl) {
      renderer.dispose();
      setWebglUnavailable(true);
      return;
    }

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 320);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor('#041022', 1);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#041022');
    scene.fog = new THREE.FogExp2('#041022', 0.048);

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 100);
    camera.position.set(0, 0.15, 8.6);

    // 3-point vibrant clinical lighting rig (safe across hardware GPU & SwiftShader)
    const ambient = new THREE.AmbientLight('#BFE8FF', 0.85);
    scene.add(ambient);

    const hemiLight = new THREE.HemisphereLight('#67E8F9', '#091E3A', 0.9);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#67E8F9', 2.2);
    keyLight.position.set(5, 6, 7);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#3B82F6', 1.85);
    rimLight.position.set(-6, -3, 5);
    scene.add(rimLight);

    const tealGlow = new THREE.PointLight('#22D3EE', 3.2, 22);
    tealGlow.position.set(0.6, 0.5, 4.5);
    scene.add(tealGlow);

    // Master clinical lattice group (sweeping diagonal double helix + orbital rings)
    const rootGroup = new THREE.Group();
    rootGroup.rotation.z = -0.58;
    rootGroup.position.set(0.15, 0.35, 0);
    scene.add(rootGroup);

    const helixGroup = new THREE.Group();
    rootGroup.add(helixGroup);

    const sphereGeo = new THREE.SphereGeometry(0.195, isSoftwareGl ? 12 : 20, isSoftwareGl ? 10 : 16);
    const haloGeo = new THREE.SphereGeometry(0.34, isSoftwareGl ? 10 : 14, isSoftwareGl ? 8 : 12);
    const rungGeo = new THREE.CylinderGeometry(0.046, 0.046, 1, 8);
    const ringGeo = new THREE.TorusGeometry(3.05, 0.028, 8, isSoftwareGl ? 48 : 80);

    const cyanMat = new THREE.MeshPhongMaterial({
      color: '#22D3EE',
      emissive: '#06B6D4',
      emissiveIntensity: 0.72,
      specular: '#E0F2FE',
      shininess: 95,
    });

    const blueMat = new THREE.MeshPhongMaterial({
      color: '#3B82F6',
      emissive: '#1D4ED8',
      emissiveIntensity: 0.65,
      specular: '#BAE6FD',
      shininess: 85,
    });

    const tealMat = new THREE.MeshPhongMaterial({
      color: '#14B8A6',
      emissive: '#0D9488',
      emissiveIntensity: 0.62,
      specular: '#CCFBF1',
      shininess: 80,
    });

    const haloMatCyan = new THREE.MeshBasicMaterial({
      color: '#22D3EE',
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });

    const haloMatBlue = new THREE.MeshBasicMaterial({
      color: '#3B82F6',
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });

    const rungMat = new THREE.MeshPhongMaterial({
      color: '#7DD3FC',
      emissive: '#0284C7',
      emissiveIntensity: 0.45,
      specular: '#FFFFFF',
      shininess: 60,
      transparent: true,
      opacity: 0.85,
    });

    const pairCount = 26;
    const helixHeight = 9.2;
    const radius = 1.62;
    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < pairCount; i++) {
      const t = i / (pairCount - 1);
      const y = (t - 0.5) * helixHeight;
      const angle = t * Math.PI * 3.6;

      pA.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      pB.set(Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius);

      const nodeA = new THREE.Mesh(sphereGeo, i % 3 === 0 ? tealMat : cyanMat);
      nodeA.position.copy(pA);
      helixGroup.add(nodeA);

      if (i % 2 === 0) {
        const haloA = new THREE.Mesh(haloGeo, haloMatCyan);
        haloA.position.copy(pA);
        helixGroup.add(haloA);
      }

      const nodeB = new THREE.Mesh(sphereGeo, i % 4 === 0 ? cyanMat : blueMat);
      nodeB.position.copy(pB);
      helixGroup.add(nodeB);

      if (i % 3 === 0) {
        const haloB = new THREE.Mesh(haloGeo, haloMatBlue);
        haloB.position.copy(pB);
        helixGroup.add(haloB);
      }

      if (i % 2 === 0) {
        mid.addVectors(pA, pB).multiplyScalar(0.5);
        dir.subVectors(pB, pA);
        const dist = dir.length();
        const rung = new THREE.Mesh(rungGeo, rungMat);
        rung.position.copy(mid);
        rung.scale.set(1, dist, 1);
        rung.quaternion.setFromUnitVectors(up, dir.normalize());
        helixGroup.add(rung);
      }
    }

    // Subtle orbital diagnostic rings
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#22D3EE',
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const ring1 = new THREE.Mesh(ringGeo, ringMat);
    ring1.rotation.x = 1.15;
    ring1.rotation.y = 0.25;
    rootGroup.add(ring1);

    const ring2 = new THREE.Mesh(ringGeo, ringMat);
    ring2.rotation.x = -0.95;
    ring2.rotation.y = -0.5;
    ring2.scale.setScalar(1.24);
    rootGroup.add(ring2);

    // Instanced ambient clinical particle field
    const particleCount = isSoftwareGl ? 68 : 112;
    const particleGeo = new THREE.SphereGeometry(0.056, 6, 6);
    const particleMat = new THREE.MeshBasicMaterial({
      color: '#67E8F9',
      transparent: true,
      opacity: 0.8,
    });
    const particles = new THREE.InstancedMesh(particleGeo, particleMat, particleCount);
    particles.frustumCulled = false;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < particleCount; i++) {
      const phi = (i * 2.39996) % (Math.PI * 2);
      const r = 2.15 + ((i * 7) % 19) * 0.17;
      const py = (((i * 13) % 29) / 29 - 0.5) * 8.0;
      dummy.position.set(Math.cos(phi) * r, py, Math.sin(phi) * r * 0.72);
      dummy.scale.setScalar(0.55 + (i % 4) * 0.3);
      dummy.updateMatrix();
      particles.setMatrixAt(i, dummy.matrix);
    }
    particles.instanceMatrix.needsUpdate = true;
    particles.computeBoundingSphere();
    rootGroup.add(particles);

    // Instanced cyan clinical data wave grid near lower horizon
    const waveCols = 22;
    const waveRows = 8;
    const waveCount = waveCols * waveRows;
    const waveGeo = new THREE.SphereGeometry(0.036, 5, 5);
    const waveMat = new THREE.MeshBasicMaterial({
      color: '#22D3EE',
      transparent: true,
      opacity: 0.55,
    });
    const waveMesh = new THREE.InstancedMesh(waveGeo, waveMat, waveCount);
    waveMesh.frustumCulled = false;
    let wi = 0;
    for (let r = 0; r < waveRows; r++) {
      for (let c = 0; c < waveCols; c++) {
        const wx = (c - (waveCols - 1) / 2) * 0.52;
        const wz = (r - waveRows / 2) * 0.45 - 1.2;
        const wy = -2.35 + Math.sin(c * 0.45 + r * 0.55) * 0.28 + r * 0.06;
        dummy.position.set(wx, wy, wz);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        waveMesh.setMatrixAt(wi++, dummy.matrix);
      }
    }
    waveMesh.instanceMatrix.needsUpdate = true;
    waveMesh.computeBoundingSphere();
    scene.add(waveMesh);

    // Pointer parallax targets (no allocations inside animation frame)
    let targetTiltX = 0;
    let targetTiltY = 0;
    let currentTiltX = 0;
    let currentTiltY = 0;

    function onPointerMove(e: PointerEvent) {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / Math.max(rect.width, 1) - 0.5;
      const ny = (e.clientY - rect.top) / Math.max(rect.height, 1) - 0.5;
      targetTiltY = nx * 0.26;
      targetTiltX = ny * 0.16;
    }

    container.addEventListener('pointermove', onPointerMove, { passive: true });

    const resizeObserver = new ResizeObserver((entries) => {
      if (!renderer || !entries[0]) return;
      const w = Math.max(entries[0].contentRect.width, 280);
      const h = Math.max(entries[0].contentRect.height, 260);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.render(scene, camera);
    });
    resizeObserver.observe(container);

    // Software WebGL GPU-sync scheduler to keep compositor & Playwright screenshots responsive
    let disposed = false;
    let rafId = 0;
    let timerId = 0;
    let frame = 0;

    function afterDraw(cb: () => void) {
      if (!isSoftwareGl) {
        rafId = requestAnimationFrame(cb);
        return;
      }
      const gl2 = gl as WebGL2RenderingContext;
      if (typeof gl2.fenceSync === 'function') {
        const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          gl2.flush();
          const poll = () => {
            if (disposed) {
              gl2.deleteSync(sync);
              return;
            }
            const status = gl2.getSyncParameter(sync, gl2.SYNC_STATUS);
            if (status === gl2.SIGNALED || status === gl2.WAIT_FAILED) {
              gl2.deleteSync(sync);
              timerId = window.setTimeout(() => {
                if (!disposed) rafId = requestAnimationFrame(cb);
              }, 80);
            } else {
              timerId = window.setTimeout(poll, 10);
            }
          };
          timerId = window.setTimeout(poll, 10);
          return;
        }
      }
      timerId = window.setTimeout(() => {
        if (!disposed) rafId = requestAnimationFrame(cb);
      }, 90);
    }

    function tick() {
      if (disposed || !renderer) return;
      frame += 1;
      const t = frame * 0.015;

      currentTiltX += (targetTiltX - currentTiltX) * 0.06;
      currentTiltY += (targetTiltY - currentTiltY) * 0.06;

      helixGroup.rotation.y = t;
      ring1.rotation.z = t * 0.35;
      ring2.rotation.z = -t * 0.25;
      particles.rotation.y = -t * 0.22;
      rootGroup.rotation.x = currentTiltX;
      rootGroup.rotation.y = currentTiltY;

      renderer.render(scene, camera);

      if (!prefersReducedMotion) {
        afterDraw(tick);
      }
    }

    // Initial render
    renderer.render(scene, camera);
    if (!prefersReducedMotion) {
      afterDraw(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      resizeObserver.disconnect();
      container.removeEventListener('pointermove', onPointerMove);

      sphereGeo.dispose();
      haloGeo.dispose();
      rungGeo.dispose();
      ringGeo.dispose();
      particleGeo.dispose();
      waveGeo.dispose();
      cyanMat.dispose();
      blueMat.dispose();
      tealMat.dispose();
      haloMatCyan.dispose();
      haloMatBlue.dispose();
      rungMat.dispose();
      ringMat.dispose();
      particleMat.dispose();
      waveMat.dispose();

      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      }
    };
  }, []);

  if (webglUnavailable) {
    return (
      <div
        aria-hidden="true"
        className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#06152B] via-[#0B254B] to-[#06152B]"
      >
        <div className="w-48 h-48 rounded-full border border-[#22D3EE]/30 flex items-center justify-center">
          <div className="w-28 h-28 rounded-full border border-[#0D9488]/40 bg-[#22D3EE]/10" />
        </div>
      </div>
    );
  }

  return <div ref={containerRef} data-testid="hero-3d-canvas" className="w-full h-full" aria-hidden="true" />;
};
