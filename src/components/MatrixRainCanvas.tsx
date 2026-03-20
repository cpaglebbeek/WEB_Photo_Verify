import { useEffect, useRef, memo } from 'react';

/**
 * Film-accurate Matrix Digital Rain (The Matrix, 1999)
 *
 * Uses semi-transparent fade (not full clear) so trails persist naturally.
 * This prevents black-screen gaps when streams cycle off-screen.
 *
 * - Half-width katakana + digits + symbols (original charset)
 * - White glowing head with green bloom
 * - Fade-based gradient trails (long, natural decay)
 * - Per-column variable speed (parallax depth)
 * - Character flicker/mutation in trail area
 */

const CHARS =
  'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ' +
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ:."=*+-<>|';

const randChar = () => CHARS[Math.floor(Math.random() * CHARS.length)];

export default memo(function MatrixRainCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const F = 14;
    let cols = 0;
    let rows = 0;

    interface Stream {
      head: number;  // fractional row position
      speed: number; // rows per frame (0.3–1.8)
    }

    let streams: Stream[] = [];
    let raf = 0;

    const mkStream = (): Stream => ({
      head: -(Math.random() * 15),   // small offset → reappears quickly
      speed: 0.3 + Math.random() * 1.5,
    });

    const resize = () => {
      // Save current canvas content before resize
      const prevW = cvs.width;
      const prevH = cvs.height;
      let imgData: ImageData | null = null;
      if (prevW > 0 && prevH > 0) {
        imgData = ctx.getImageData(0, 0, prevW, prevH);
      }

      cvs.width = window.innerWidth;
      cvs.height = window.innerHeight;
      rows = Math.ceil(cvs.height / F) + 2;
      const newCols = Math.floor(cvs.width / F) + 1;

      // Restore canvas content (resize clears it)
      if (imgData) {
        ctx.putImageData(imgData, 0, 0);
      }

      const prev = streams;
      streams = Array.from({ length: newCols }, (_, i) =>
        i < prev.length ? prev[i] : mkStream()
      );

      // First init: stagger heads across screen for immediate visual
      if (prev.length === 0) {
        streams.forEach(s => { s.head = Math.random() * rows; });
      }

      cols = newCols;
    };

    resize();
    window.addEventListener('resize', resize);

    const tick = () => {
      // Semi-transparent fade — trails persist and decay naturally
      // This is the key to continuous rain without black gaps
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, cvs.width, cvs.height);

      ctx.font = `${F}px "MS Gothic","Hiragino Kaku Gothic Pro","Courier New",monospace`;
      ctx.textBaseline = 'top';

      // ---- Pass 1: bright trail chars behind head + flicker (no shadow) ----
      ctx.shadowBlur = 0;
      for (let c = 0; c < cols; c++) {
        const s = streams[c];
        const hR = Math.floor(s.head);
        const x = c * F;

        if (hR >= 0 && hR < rows) {
          // 3 bright green chars just behind head — explicit gradient
          ctx.fillStyle = '#00ff41';
          if (hR - 1 >= 0) ctx.fillText(randChar(), x, (hR - 1) * F);

          ctx.fillStyle = 'rgba(0, 255, 65, 0.7)';
          if (hR - 2 >= 0) ctx.fillText(randChar(), x, (hR - 2) * F);

          ctx.fillStyle = 'rgba(0, 255, 65, 0.4)';
          if (hR - 3 >= 0) ctx.fillText(randChar(), x, (hR - 3) * F);
        }

        // Random character mutation deep in the trail (film flicker effect)
        if (Math.random() > 0.92 && hR > 6) {
          const fRow = hR - (4 + Math.floor(Math.random() * 18));
          if (fRow >= 0 && fRow < rows) {
            ctx.fillStyle = `rgba(0,${130 + Math.floor(Math.random() * 125)},25,${0.15 + Math.random() * 0.35})`;
            ctx.fillText(randChar(), x, fRow * F);
          }
        }
      }

      // ---- Pass 2: head characters (white + green bloom) ----
      ctx.shadowColor = '#00ff41';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#e0ffe0';
      for (let c = 0; c < cols; c++) {
        const s = streams[c];
        const hR = Math.floor(s.head);

        if (hR >= 0 && hR < rows) {
          ctx.fillText(randChar(), c * F, hR * F);
        }

        // Advance stream
        s.head += s.speed;

        // Reset when head is well past screen bottom
        if (hR > rows + 5) {
          Object.assign(s, mkStream());
        }
      }
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: '#000',
      }}
    />
  );
});
