import { useEffect, useRef } from 'react';

interface Props {
  progress: number;
  message?: string;
}

/** Matrix digital-rain effect drawn on a full-screen <canvas>. */
function useMatrixRain(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const columnsRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const FONT_SIZE = 16;
    const CHARS = '01';
    let animId = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const cols = Math.floor(canvas.width / FONT_SIZE);
      // Keep existing drops, extend/shrink array
      const prev = columnsRef.current;
      columnsRef.current = Array.from({ length: cols }, (_, i) =>
        i < prev.length ? prev[i] : Math.random() * -50
      );
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      // Semi-transparent black to create fade trail
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${FONT_SIZE}px "Courier New", monospace`;

      const drops = columnsRef.current;
      for (let i = 0; i < drops.length; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)];
        const x = i * FONT_SIZE;
        const y = drops[i] * FONT_SIZE;

        // Bright head character
        ctx.fillStyle = '#00ff41';
        ctx.shadowColor = '#00ff41';
        ctx.shadowBlur = 8;
        ctx.fillText(char, x, y);

        // Dimmer trail character one row up
        ctx.fillStyle = 'rgba(0, 255, 65, 0.4)';
        ctx.shadowBlur = 0;
        ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], x, y - FONT_SIZE);

        // Reset drop to top after it falls past canvas, with randomness
        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i] += 1;
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [canvasRef]);
}

export default function ProcessingOverlay({ progress, message = 'Processing...' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useMatrixRain(canvasRef);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      zIndex: 9999, overflow: 'hidden',
    }}>
      {/* Matrix rain canvas — full screen background */}
      <canvas ref={canvasRef} style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: '#000',
      }} />

      {/* Info card floating on top */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100%', height: '100%',
      }}>
        <div style={{
          background: 'rgba(0, 10, 2, 0.85)',
          padding: '2rem', borderRadius: '24px',
          boxShadow: '0 0 40px rgba(0, 255, 65, 0.15), 0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          textAlign: 'center', width: '320px',
          border: '1px solid rgba(0, 255, 65, 0.25)',
          backdropFilter: 'blur(12px)',
        }}>
          {/* Matrix-green glowing title */}
          <h3 style={{
            margin: '0 0 1rem 0',
            color: '#00ff41',
            fontFamily: '"Courier New", monospace',
            fontSize: '1.1rem',
            textShadow: '0 0 10px rgba(0, 255, 65, 0.6)',
          }}>
            {progress === 100 ? 'Finalizing...' : message}
          </h3>

          {/* Progress bar */}
          <div style={{
            background: 'rgba(0, 255, 65, 0.1)',
            height: '10px', borderRadius: '5px',
            overflow: 'hidden', marginBottom: '10px',
            border: '1px solid rgba(0, 255, 65, 0.2)',
          }}>
            <div style={{
              width: `${progress}%`, height: '100%',
              background: 'linear-gradient(90deg, #003b00, #00ff41)',
              boxShadow: '0 0 12px rgba(0, 255, 65, 0.5)',
              transition: 'width 0.3s ease-out',
            }} />
          </div>

          <p style={{
            color: '#00ff41', margin: 0,
            fontWeight: 'bold',
            fontFamily: '"Courier New", monospace',
            textShadow: '0 0 8px rgba(0, 255, 65, 0.4)',
          }}>
            {progress}%
          </p>
        </div>
      </div>
    </div>
  );
}
