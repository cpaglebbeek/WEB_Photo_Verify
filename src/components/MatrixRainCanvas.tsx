import { useEffect, useRef, memo } from 'react';

/**
 * Film-accurate Matrix Digital Rain (The Matrix, 1999)
 * - Half-width katakana + digits + symbols (original charset)
 * - White glowing head character with green bloom
 * - Long gradient trails fading from bright to dark green
 * - Per-column variable speed and trail length
 * - Character flickering/mutation in trails (~3% per frame)
 */

const CHARS =
  'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ' +
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ:."=*+-<>|';

const randChar = () => CHARS[Math.floor(Math.random() * CHARS.length)];

interface Stream {
  head: number;   // row position (fractional, allows sub-row speed)
  speed: number;  // rows per frame (0.3–1.8 for parallax depth)
  len: number;    // trail length in rows
}

export default memo(function MatrixRainCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const F = 14; // font size — smaller = denser columns = more cinematic
    let cols = 0;
    let rows = 0;
    let grid: string[][] = [];
    let streams: Stream[] = [];
    let raf = 0;

    const mkStream = (): Stream => ({
      head: Math.random() * -40,
      speed: 0.3 + Math.random() * 1.5,
      len: 8 + Math.floor(Math.random() * 26),
    });

    const resize = () => {
      cvs.width = window.innerWidth;
      cvs.height = window.innerHeight;
      const newCols = Math.floor(cvs.width / F) + 1;
      const newRows = Math.ceil(cvs.height / F) + 2;

      // Preserve existing streams on resize, extend if needed
      const prevStreams = streams;
      grid = Array.from({ length: newCols }, (_, c) =>
        Array.from({ length: newRows }, (_, r) =>
          (c < cols && r < rows && grid[c]) ? grid[c][r] : randChar()
        )
      );
      streams = Array.from({ length: newCols }, (_, i) =>
        i < prevStreams.length ? prevStreams[i] : mkStream()
      );

      cols = newCols;
      rows = newRows;

      // On first init, stagger positions so the screen isn't empty
      if (prevStreams.length === 0) {
        streams.forEach(s => { s.head = Math.random() * (rows + s.len); });
      }
    };

    resize();
    window.addEventListener('resize', resize);

    const tick = () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.font = `${F}px "MS Gothic","Hiragino Kaku Gothic Pro","Courier New",monospace`;
      ctx.textBaseline = 'top';

      // ---- Pass 1: trail characters (no shadow, efficient) ----
      ctx.shadowBlur = 0;
      for (let c = 0; c < cols; c++) {
        const s = streams[c];
        const hR = Math.floor(s.head);
        const x = c * F;

        for (let t = 1; t <= s.len; t++) {
          const row = hR - t;
          if (row < 0 || row >= rows) continue;

          // Flicker: mutate ~3% of visible trail chars per frame
          if (Math.random() < 0.03) grid[c][row] = randChar();

          if (t <= 2) {
            // Near-head: bright green
            ctx.fillStyle = '#00ff41';
          } else {
            // Gradient: bright green → dark green
            const fade = 1 - (t - 2) / Math.max(1, s.len - 2);
            const g = Math.floor(80 + fade * 175);
            const a = Math.max(0.06, fade * 0.85);
            ctx.fillStyle = `rgba(0,${g},20,${a})`;
          }
          ctx.fillText(grid[c][row], x, row * F);
        }
      }

      // ---- Pass 2: head characters (white + green glow bloom) ----
      ctx.shadowColor = '#00ff41';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffffff';
      for (let c = 0; c < cols; c++) {
        const s = streams[c];
        const hR = Math.floor(s.head);
        if (hR < 0 || hR >= rows) { s.head += s.speed; continue; }
        ctx.fillText(grid[c][hR], c * F, hR * F);

        // Advance stream
        s.head += s.speed;

        // Reset when trail clears the bottom
        if ((s.head - s.len) * F > cvs.height) {
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
