import React, { useEffect, useRef } from 'react';

interface Node3D {
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
}

const LATTICE_NODES: Node3D[] = [
  { x: 0, y: 0, z: 0, radius: 5.5, color: '#22D3EE' },
  { x: 1.15, y: 0.45, z: 0.55, radius: 4.2, color: '#0D9488' },
  { x: -1.05, y: 0.65, z: 0.4, radius: 4.2, color: '#2563EB' },
  { x: 0.4, y: -1.1, z: 0.75, radius: 4, color: '#22D3EE' },
  { x: -0.65, y: -0.95, z: -0.55, radius: 3.8, color: '#0D9488' },
  { x: 0.85, y: 0.85, z: -0.9, radius: 3.8, color: '#2563EB' },
  { x: -1.25, y: -0.15, z: -0.75, radius: 3.5, color: '#22D3EE' },
  { x: 0.1, y: 1.35, z: -0.25, radius: 4.4, color: '#0D9488' },
  { x: 1.45, y: -0.45, z: -0.35, radius: 3.4, color: '#22D3EE' },
  { x: -0.25, y: -0.2, z: 1.35, radius: 4.5, color: '#2563EB' },
  { x: 0.75, y: -0.7, z: -1.15, radius: 3.2, color: '#22D3EE' },
  { x: -0.95, y: 1.15, z: -0.45, radius: 3.3, color: '#0D9488' },
];

const LATTICE_EDGES: Array<[number, number]> = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 7],
  [0, 9],
  [1, 5],
  [1, 8],
  [1, 9],
  [2, 6],
  [2, 7],
  [2, 11],
  [3, 4],
  [3, 8],
  [3, 9],
  [4, 6],
  [4, 10],
  [5, 7],
  [5, 8],
  [5, 10],
  [6, 11],
  [7, 11],
  [8, 10],
];

const AMBIENT_PARTICLES = Array.from({ length: 24 }, (_, idx) => ({
  angle: (idx / 24) * Math.PI * 2,
  dist: 1.35 + (idx % 4) * 0.28,
  yOffset: ((idx % 5) - 2) * 0.35,
  speed: 0.25 + (idx % 3) * 0.12,
  size: 1.4 + (idx % 2) * 0.8,
}));

export const MolecularNeuralCanvas: React.FC<{ className?: string }> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let angleY = 0.4;
    let angleX = 0.24;

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const drawFrame = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.48;
      const scale = Math.min(width, height) * 0.27;

      const rotY = angleY + pointerRef.current.x * 0.28;
      const rotX = angleX + pointerRef.current.y * 0.22;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      const project = (nx: number, ny: number, nz: number) => {
        const x1 = nx * cosY - nz * sinY;
        const z1 = nx * sinY + nz * cosY;
        const y2 = ny * cosX - z1 * sinX;
        const z2 = ny * sinX + z1 * cosX;
        const perspective = 3.6 / (3.6 - z2);
        return {
          px: cx + x1 * scale * perspective,
          py: cy + y2 * scale * perspective,
          z: z2,
          scale: perspective,
        };
      };

      // Subtle orbital rings
      ctx.save();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, scale * 1.65, scale * 0.72, -0.22, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(13, 148, 136, 0.18)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, scale * 1.45, scale * 0.62, 0.48, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Ambient drifting particles
      for (const p of AMBIENT_PARTICLES) {
        const a = p.angle + angleY * p.speed;
        const projected = project(Math.cos(a) * p.dist, p.yOffset, Math.sin(a) * p.dist);
        ctx.fillStyle = 'rgba(34, 211, 238, 0.28)';
        ctx.beginPath();
        ctx.arc(projected.px, projected.py, p.size * projected.scale, 0, Math.PI * 2);
        ctx.fill();
      }

      const projectedNodes = LATTICE_NODES.map((node) => ({
        ...node,
        ...project(node.x, node.y, node.z),
      }));

      // Draw molecular & neural edges
      for (const [i, j] of LATTICE_EDGES) {
        const a = projectedNodes[i];
        const b = projectedNodes[j];
        const avgDepth = (a.z + b.z) * 0.5;
        const alpha = Math.max(0.14, Math.min(0.6, 0.34 + avgDepth * 0.15));
        const grad = ctx.createLinearGradient(a.px, a.py, b.px, b.py);
        grad.addColorStop(0, `rgba(34, 211, 238, ${alpha})`);
        grad.addColorStop(1, `rgba(37, 99, 235, ${alpha})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(b.px, b.py);
        ctx.stroke();
      }

      // Depth-sorted nodes
      const sorted = [...projectedNodes].sort((a, b) => a.z - b.z);
      for (const node of sorted) {
        const r = node.radius * node.scale;
        ctx.fillStyle = 'rgba(34, 211, 238, 0.16)';
        ctx.beginPath();
        ctx.arc(node.px, node.py, r * 2.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.px, node.py, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(248, 250, 252, 0.75)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    drawFrame();

    if (!prefersReduced) {
      const tick = () => {
        angleY += 0.0045;
        angleX += 0.0014;
        drawFrame();
        rafId = window.requestAnimationFrame(tick);
      };
      rafId = window.requestAnimationFrame(tick);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        pointerRef.current = {
          x: ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2,
          y: ((e.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2,
        };
      }}
      onMouseLeave={() => {
        pointerRef.current = { x: 0, y: 0 };
      }}
      className={`w-full h-full block ${className}`}
    />
  );
};
