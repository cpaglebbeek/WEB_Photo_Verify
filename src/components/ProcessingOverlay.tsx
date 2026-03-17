interface Props {
  progress: number;
  message?: string;
}

export default function ProcessingOverlay({ progress, message = 'Processing...' }: Props) {
  return (
    <div className="loading-overlay" style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(15, 23, 42, 0.9)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(8px)'
    }}>
      <div className="loader-card" style={{
        background: '#1e293b', padding: '2rem', borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        textAlign: 'center', width: '300px', border: '1px solid #334155'
      }}>
        <div className="spinner" style={{
          width: '50px', height: '50px', border: '5px solid #334155',
          borderTopColor: '#60a5fa', borderRadius: '50%',
          margin: '0 auto 1.5rem', animation: 'spin 1s linear infinite'
        }}></div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        
        <h3 style={{ margin: '0 0 10px 0', color: '#f8fafc' }}>{progress === 100 ? 'Finalizing...' : message}</h3>
        
        <div className="progress-bg" style={{ background: '#0f172a', height: '10px', borderRadius: '5px', overflow: 'hidden', marginBottom: '10px' }}>
          <div className="progress-fill" style={{ 
            width: `${progress}%`, height: '100%', background: '#60a5fa',
            transition: 'width 0.3s ease-out'
          }}></div>
        </div>
        <p style={{ color: '#94a3b8', margin: 0, fontWeight: 'bold' }}>{progress}%</p>
      </div>
    </div>
  );
}
