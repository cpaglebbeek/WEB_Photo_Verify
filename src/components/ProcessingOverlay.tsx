import MatrixRainCanvas from './MatrixRainCanvas';

interface Props {
  progress: number;
  message?: string;
}

export default function ProcessingOverlay({ progress, message = 'Processing...' }: Props) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      zIndex: 9999, overflow: 'hidden',
    }}>
      {/* Film-accurate Matrix rain — full screen background */}
      <MatrixRainCanvas />

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
